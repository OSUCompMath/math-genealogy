#!/usr/bin/env python3
"""
Export one or more MGP ancestor graphs from starting IDs.

If a starting ID has not been scraped yet, this script runs the scrape first and
caches the CSV under --cache-dir.

Examples:
    python export_graph.py 123456 --out mgp_graph.dot
    python export_graph.py 123456 789012 --format json --out mgp_graph.json
"""

import argparse
import csv
import json
import shutil
import subprocess
import sys
import textwrap
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

from mgp_ancestors import DEFAULT_OUT_DIR, find_person_dir, scrape_one


CACHE_COLUMNS = {"distance", "id", "name", "year", "university", "country", "advisors", "url"}
ANCESTORS_CSV = "ancestors.csv"


@dataclass
class Row:
    id: str
    name: str
    year: str
    university: str
    country: str
    advisors: List[Tuple[str, str]]
    url: str
    distances: Dict[str, int] = field(default_factory=dict)


def parse_advisors(value: str) -> List[Tuple[str, str]]:
    advisors = []
    for entry in value.split(";"):
        entry = entry.strip()
        if not entry:
            continue
        advisor_id, _, advisor_name = entry.partition(":")
        advisors.append((advisor_id.strip(), advisor_name.strip()))
    return advisors


def cached_csv_for(cache_dir: Path, start_id: str) -> Optional[Path]:
    """Return the ancestors.csv path for a previously-scraped start_id, or None."""
    person_dir = find_person_dir(cache_dir, start_id)
    if person_dir is None:
        return None
    csv_path = person_dir / ANCESTORS_CSV
    return csv_path if csv_path.exists() else None


def cache_is_current(csv_path: Path) -> bool:
    try:
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return CACHE_COLUMNS.issubset(set(reader.fieldnames or []))
    except OSError:
        return False


def ensure_scraped(
    start_id: str,
    cache_dir: Path,
    label: Optional[str],
    max_depth: int | None,
    delay: float,
    quiet: bool,
    refresh: bool,
    reparse: bool = False,
) -> Path:
    csv_path = cached_csv_for(cache_dir, start_id)
    if csv_path is not None and not refresh and not reparse:
        if cache_is_current(csv_path):
            print(f"Using cached scrape for {start_id}: {csv_path}")
            return csv_path
        print(f"Cached scrape for {start_id} is missing newer columns; refreshing it.")

    if reparse and csv_path is not None:
        print(f"Re-parsing cached HTML for {start_id} (no network)")
    else:
        print(f"Scraping {start_id} into {cache_dir}/")
    person_dir = scrape_one(
        start_id=start_id,
        out_dir_base=str(cache_dir),
        label=label,
        max_depth=max_depth,
        delay=delay,
        quiet=quiet,
        refresh=refresh,
    )
    return person_dir / ANCESTORS_CSV


def merge_row(rows: Dict[str, Row], start_id: str, raw: Dict[str, str]):
    pid = raw["id"].strip()
    existing = rows.get(pid)
    advisors = parse_advisors(raw.get("advisors", ""))
    distance = int(raw["distance"])

    if existing is None:
        rows[pid] = Row(
            id=pid,
            name=raw["name"].strip(),
            year=raw.get("year", "").strip(),
            university=raw.get("university", "").strip(),
            country=raw.get("country", "").strip(),
            advisors=advisors,
            url=raw["url"].strip(),
            distances={start_id: distance},
        )
        return

    existing.distances[start_id] = distance
    if existing.name == existing.id and raw["name"].strip():
        existing.name = raw["name"].strip()
    if not existing.year and raw.get("year", "").strip():
        existing.year = raw.get("year", "").strip()
    if not existing.university and raw.get("university", "").strip():
        existing.university = raw.get("university", "").strip()
    if not existing.country and raw.get("country", "").strip():
        existing.country = raw.get("country", "").strip()
    if not existing.url and raw["url"].strip():
        existing.url = raw["url"].strip()

    seen_advisors = {advisor_id for advisor_id, _name in existing.advisors}
    for advisor in advisors:
        if advisor[0] not in seen_advisors:
            existing.advisors.append(advisor)


def read_rows(path: Path, start_id: str) -> Dict[str, Row]:
    rows: Dict[str, Row] = {}
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        required = {"distance", "id", "name", "advisors", "url"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise ValueError(f"{path} is missing required column(s): {missing_list}")

        for raw in reader:
            merge_row(rows, start_id, raw)
    return rows


def read_all_rows(csv_paths: List[Tuple[str, Path]]) -> Dict[str, Row]:
    rows: Dict[str, Row] = {}
    for start_id, path in csv_paths:
        for row in read_rows(path, start_id).values():
            merge_row(
                rows,
                start_id,
                {
                    "id": row.id,
                    "name": row.name,
                    "year": row.year,
                    "university": row.university,
                    "country": row.country,
                    "distance": str(row.distances[start_id]),
                    "advisors": "; ".join(
                        f"{advisor_id}:{advisor_name}"
                        for advisor_id, advisor_name in row.advisors
                    ),
                    "url": row.url,
                },
            )
    return rows


def graph_parts(rows: Dict[str, Row], start_ids: List[str]):
    nodes = {}
    edges = {}

    for row in rows.values():
        nodes[row.id] = {
            "id": row.id,
            "name": row.name,
            "year": row.year,
            "university": row.university,
            "country": row.country,
            "distances": {sid: row.distances[sid] for sid in start_ids if sid in row.distances},
            "url": row.url,
        }

        for advisor_id, advisor_name in row.advisors:
            if advisor_id not in nodes:
                nodes[advisor_id] = {
                    "id": advisor_id,
                    "name": advisor_name or advisor_id,
                    "year": "",
                    "university": "",
                    "country": "",
                    "distances": {},
                    "url": "",
                }
            edges[(row.id, advisor_id)] = {
                "source": row.id,
                "target": advisor_id,
                "source_name": row.name,
                "target_name": nodes[advisor_id]["name"],
            }

    return nodes, list(edges.values())


def all_longest_path_highlights(rows: Dict[str, Row], start_ids: List[str]):
    highlighted_nodes: Set[str] = set()
    highlighted_edges: Set[Tuple[str, str]] = set()
    memo: Dict[str, int] = {}

    def best_length(pid: str, visiting: Set[str]) -> int:
        if pid in memo:
            return memo[pid]
        if pid in visiting:
            return 0

        row = rows.get(pid)
        if row is None:
            return 0

        next_visiting = set(visiting)
        next_visiting.add(pid)
        best = 0
        for advisor_id, _advisor_name in row.advisors:
            if advisor_id in next_visiting:
                continue
            best = max(best, 1 + best_length(advisor_id, next_visiting))

        memo[pid] = best
        return best

    def collect(pid: str, visiting: Set[str]):
        highlighted_nodes.add(pid)
        row = rows.get(pid)
        if row is None:
            return

        next_visiting = set(visiting)
        next_visiting.add(pid)
        target_length = best_length(pid, visiting)
        for advisor_id, _advisor_name in row.advisors:
            if advisor_id in next_visiting:
                continue
            if 1 + best_length(advisor_id, next_visiting) == target_length:
                highlighted_edges.add((pid, advisor_id))
                collect(advisor_id, next_visiting)

    for start_id in start_ids:
        collect(start_id, set())

    return highlighted_nodes, highlighted_edges


def dot_escape(value: object) -> str:
    return str(value).replace("\\", "\\\\").replace('"', '\\"')


def dot_label_escape(value: object) -> str:
    return str(value).replace('"', '\\"')


def distance_label(distances: Dict[str, int]) -> str:
    if not distances:
        return ""
    parts = [f"{start_id}: {distances[start_id]}" for start_id in sorted(distances)]
    return "d=" + ", ".join(parts)


_PUNCT_MAP = str.maketrans({
    "‐": "-", "‑": "-", "‒": "-", "–": "-",
    "—": "-", "―": "-", "−": "-",
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "ʻ": "'", "ʼ": "'", "ʾ": "'", "ʿ": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"',
})


def display_safe(text: str) -> str:
    """Make text safe to render with the default Graphviz fonts.

    Helvetica / Georgia / Times-Roman cover Basic Latin, Latin-1 Supplement,
    and Latin Extended-A but typically don't have glyphs for typographic
    punctuation (U+2010 hyphen, U+2018-201F curly quotes), Arabic
    transliteration modifier letters (U+02BB-02BF), or Latin Extended
    Additional (U+1E00-U+1EFF, e.g. ḍ ḥ ṣ Ṭ used in Arabic transliteration).
    Render those as their closest plain-Latin equivalents so the rendered
    label matches the source instead of falling back to `[?]` boxes.

    The underlying CSV / JSON data is left untouched — this only normalizes
    the strings written into the .dot output.
    """
    if not text:
        return text
    text = text.translate(_PUNCT_MAP)
    out = []
    for ch in text:
        cp = ord(ch)
        if 0x1E00 <= cp <= 0x1EFF:
            for sub in unicodedata.normalize("NFD", ch):
                if not unicodedata.combining(sub):
                    out.append(sub)
        else:
            out.append(ch)
    return "".join(out)


def node_label(node: Dict[str, object]) -> str:
    label = wrapped_label(display_safe(str(node["name"])))
    details = []
    if node.get("year"):
        details.append(str(node["year"]))
    # Prefer the university; fall back to the country only when no school is known.
    location = node.get("university") or node.get("country") or ""
    if location:
        details.append(display_safe(str(location)))
    if details:
        label += f"\\n{wrapped_label(' · '.join(details), width=28)}"
    return label


def wrapped_label(value: str, width: int = 24) -> str:
    return "\\n".join(textwrap.wrap(value, width=width, break_long_words=False)) or value


DEFAULT_SANS_FONT = "Helvetica"
DEFAULT_SERIF_FONT = "Georgia"


def resolve_font(font: Optional[str], serif: bool) -> str:
    """An explicit --font wins; otherwise --serif picks a serif face; else sans."""
    if font:
        return font
    if serif:
        return DEFAULT_SERIF_FONT
    return DEFAULT_SANS_FONT


def to_dot(
    rows: Dict[str, Row],
    start_ids: List[str],
    font: str = DEFAULT_SANS_FONT,
) -> str:
    nodes, edges = graph_parts(rows, start_ids)
    start_set = set(start_ids)
    longest_nodes, longest_edges = all_longest_path_highlights(rows, start_ids)
    highlight_common = len(start_ids) > 1
    common_nodes = {
        node_id
        for node_id, node in nodes.items()
        if node_id not in start_set and len(node["distances"]) >= 2
    }
    font_attr = dot_escape(font)
    lines = [
        "digraph mgp_ancestors {",
        f'  graph [rankdir=TB, bgcolor="white", margin=0.2, nodesep=0.35, ranksep=0.65,',
        f'         outputorder=edgesfirst, overlap=false, splines=polyline,',
        f'         fontname="{font_attr}"];',
        f'  node [shape=box, style="rounded,filled", fillcolor="#f8fafc",',
        f'        color="#94a3b8", penwidth=1.2, fontname="{font_attr}", fontsize=18,',
        f'        margin="0.12,0.08"];',
        f'  edge [color="#64748b", arrowsize=0.55, penwidth=1.0, fontname="{font_attr}"];',
        "",
    ]

    def sort_key(node):
        distances = node["distances"]
        min_distance = min(distances.values()) if distances else 10**9
        return (min_distance, node["name"])

    for node in sorted(nodes.values(), key=sort_key):
        label = node_label(node)
        is_common = highlight_common and node["id"] in common_nodes
        is_longest = not highlight_common and node["id"] in longest_nodes
        fillcolor = (
            "#dbeafe"
            if node["id"] in start_set
            else "#dcfce7"
            if is_common
            else "#fff7ed"
            if is_longest
            else "#f8fafc"
        )
        color = (
            "#2563eb"
            if node["id"] in start_set
            else "#16a34a"
            if is_common
            else "#f97316"
            if is_longest
            else "#94a3b8"
        )
        penwidth = "2.4" if is_common or is_longest or node["id"] in start_set else "1.2"
        attrs = [
            f'label="{dot_label_escape(label)}"',
            f'fillcolor="{fillcolor}"',
            f'color="{color}"',
            f'penwidth="{penwidth}"',
            f'URL="{dot_escape(node["url"])}"',
            f'tooltip="{dot_escape(node["name"])} (ID: {dot_escape(node["id"])})"',
        ]
        lines.append(f'  "{dot_escape(node["id"])}" [{", ".join(attrs)}];')

    if start_set:
        start_nodes = " ".join(f'"{dot_escape(start_id)}"' for start_id in sorted(start_set))
        lines.append("")
        lines.append(f"  {{ rank=sink; {start_nodes}; }}")
        for start_id in sorted(start_set):
            for advisor_id, _advisor_name in rows.get(start_id, Row(start_id, start_id, "", "", [], "", {})).advisors:
                lines.append(
                    f'  "{dot_escape(advisor_id)}" -> "{dot_escape(start_id)}" '
                    '[style=invis, weight=100, constraint=true];'
                )

    lines.append("")

    for edge in sorted(edges, key=lambda e: (e["source_name"], e["target_name"])):
        is_longest = not highlight_common and (edge["source"], edge["target"]) in longest_edges
        attrs = []
        if is_longest:
            attrs = ['color="#ea580c"', "penwidth=2.8", "arrowsize=0.75"]
        attr_text = f' [{", ".join(attrs)}]' if attrs else ""
        lines.append(
            f'  "{dot_escape(edge["target"])}" -> "{dot_escape(edge["source"])}"{attr_text};'
        )

    lines.append("}")
    return "\n".join(lines) + "\n"


def to_json(rows: Dict[str, Row], start_ids: List[str]) -> str:
    nodes, edges = graph_parts(rows, start_ids)
    payload = {
        "start_ids": start_ids,
        "nodes": sorted(nodes.values(), key=lambda n: n["id"]),
        "edges": sorted(edges, key=lambda e: (e["source"], e["target"])),
    }
    return json.dumps(payload, indent=2) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("ids", nargs="+", help="Starting Math Genealogy Project ID(s)")
    parser.add_argument(
        "--format",
        choices=["dot", "json"],
        default="dot",
        help="Graph export format",
    )
    parser.add_argument("--out", default=None, help="Output path")
    parser.add_argument(
        "--cache-dir",
        default=DEFAULT_OUT_DIR,
        help=(
            "Base directory holding per-person scrape folders "
            f"(default: {DEFAULT_OUT_DIR}/). New scrapes land in <cache-dir>/<slug>_<id>/."
        ),
    )
    parser.add_argument(
        "--label",
        default=None,
        nargs="+",
        help=(
            "Override the per-person folder slug used when an ID has not yet "
            "been scraped. Pass one label per ID, or one label total."
        ),
    )
    parser.add_argument(
        "--serif",
        action="store_true",
        help=f"Render node labels in a serif font (defaults to {DEFAULT_SERIF_FONT}).",
    )
    parser.add_argument(
        "--font",
        default=None,
        help=(
            "Explicit font name passed to Graphviz. Overrides --serif. "
            f"Defaults to {DEFAULT_SANS_FONT}."
        ),
    )
    parser.add_argument(
        "--render",
        choices=["png", "pdf", "svg"],
        default=None,
        help=(
            "After writing the .dot file, also render it with Graphviz. "
            "Requires `dot` on PATH. Only valid with --format dot."
        ),
    )
    parser.add_argument("--max-depth", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between scrape requests")
    parser.add_argument("--quiet", action="store_true", help="Disable scrape progress bars")
    parser.add_argument("--refresh", action="store_true", help="Rescrape even if cached CSVs exist")
    parser.add_argument(
        "--reparse",
        action="store_true",
        help=(
            "Re-parse cached HTML to regenerate ancestors.csv, without going to "
            "the network. Useful after a parser change."
        ),
    )
    args = parser.parse_args()

    if args.label is not None and len(args.label) not in (1, len(args.ids)):
        parser.error("--label must provide one label, or one label per input ID")
    if args.render and args.format != "dot":
        parser.error("--render is only valid with --format dot")

    def label_for(i: int) -> Optional[str]:
        if args.label is None:
            return None
        if len(args.label) == 1:
            return args.label[0]
        return args.label[i]

    cache_dir = Path(args.cache_dir)
    csv_paths = [
        (
            start_id,
            ensure_scraped(
                start_id=start_id,
                cache_dir=cache_dir,
                label=label_for(i),
                max_depth=args.max_depth,
                delay=args.delay,
                quiet=args.quiet,
                refresh=args.refresh,
                reparse=args.reparse,
            ),
        )
        for i, start_id in enumerate(args.ids)
    ]

    rows = read_all_rows(csv_paths)
    if args.format == "json":
        output = to_json(rows, args.ids)
    else:
        font = resolve_font(args.font, args.serif)
        output = to_dot(rows, args.ids, font=font)
    out_path = args.out or f"mgp_graph.{args.format}"

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(output)

    nodes, edges = graph_parts(rows, args.ids)
    print(f"Exported {len(nodes)} nodes and {len(edges)} edges to {out_path}")
    if len(args.ids) > 1:
        common_count = sum(
            1
            for node_id, node in nodes.items()
            if node_id not in set(args.ids) and len(node["distances"]) >= 2
        )
        print(f"Highlighted common ancestors: {common_count} nodes")
    else:
        highlighted_nodes, highlighted_edges = all_longest_path_highlights(rows, args.ids)
        print(
            "Highlighted all tied longest paths: "
            f"{len(highlighted_nodes)} nodes and {len(highlighted_edges)} edges"
        )

    if args.render:
        if shutil.which("dot") is None:
            print(
                "ERROR: --render requested but `dot` (Graphviz) is not on PATH. "
                "Install Graphviz, or render manually with: "
                f"`dot -T{args.render} {out_path} -o <output>`",
                file=sys.stderr,
            )
            sys.exit(1)

        rendered_path = Path(out_path).with_suffix(f".{args.render}")
        try:
            subprocess.run(
                ["dot", f"-T{args.render}", out_path, "-o", str(rendered_path)],
                check=True,
            )
        except subprocess.CalledProcessError as exc:
            print(f"ERROR: Graphviz failed (exit {exc.returncode})", file=sys.stderr)
            sys.exit(exc.returncode)
        print(f"Rendered: {rendered_path}")


if __name__ == "__main__":
    main()
