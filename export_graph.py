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
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Set, Tuple

from mgp_ancestors import crawl_ancestors, write_csv


CACHE_COLUMNS = {"distance", "id", "name", "year", "country", "advisors", "url"}


@dataclass
class Row:
    id: str
    name: str
    year: str
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


def cache_path(cache_dir: Path, start_id: str) -> Path:
    return cache_dir / f"mgp_ancestors_{start_id}.csv"


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
    max_depth: int | None,
    delay: float,
    quiet: bool,
    refresh: bool,
) -> Path:
    csv_path = cache_path(cache_dir, start_id)
    if csv_path.exists() and not refresh:
        if cache_is_current(csv_path):
            print(f"Using cached scrape for {start_id}: {csv_path}")
            return csv_path
        print(f"Cached scrape for {start_id} is missing newer columns; refreshing it.")

    print(f"Scraping {start_id} into {csv_path}")
    print("Scrape progress will be shown below.")
    cache_dir.mkdir(parents=True, exist_ok=True)
    people, distance, parents, _failed = crawl_ancestors(
        start_id=start_id,
        max_depth=max_depth,
        delay=delay,
        quiet=quiet,
    )
    write_csv(str(csv_path), people, distance, parents)
    print(f"Finished scraping {start_id}: {len(distance)} people written")
    return csv_path


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


def node_label(node: Dict[str, object]) -> str:
    label = wrapped_label(str(node["name"]))
    details = []
    if node.get("year"):
        details.append(str(node["year"]))
    if node.get("country"):
        details.append(str(node["country"]))
    if details:
        label += f"\\n{' · '.join(details)}"
    return label


def wrapped_label(value: str, width: int = 24) -> str:
    return "\\n".join(textwrap.wrap(value, width=width, break_long_words=False)) or value


def to_dot(rows: Dict[str, Row], start_ids: List[str]) -> str:
    nodes, edges = graph_parts(rows, start_ids)
    start_set = set(start_ids)
    longest_nodes, longest_edges = all_longest_path_highlights(rows, start_ids)
    highlight_common = len(start_ids) > 1
    common_nodes = {
        node_id
        for node_id, node in nodes.items()
        if node_id not in start_set and len(node["distances"]) >= 2
    }
    lines = [
        "digraph mgp_ancestors {",
        '  graph [rankdir=TB, bgcolor="white", margin=0.2, nodesep=0.35, ranksep=0.65,',
        '         outputorder=edgesfirst, overlap=false, splines=polyline];',
        '  node [shape=box, style="rounded,filled", fillcolor="#f8fafc",',
        '        color="#94a3b8", penwidth=1.2, fontname="Helvetica", fontsize=18,',
        '        margin="0.12,0.08"];',
        '  edge [color="#64748b", arrowsize=0.55, penwidth=1.0];',
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
        default="scrapes",
        help="Directory for cached per-ID scrape CSV/TXT files",
    )
    parser.add_argument("--max-depth", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between scrape requests")
    parser.add_argument("--quiet", action="store_true", help="Disable scrape progress bars")
    parser.add_argument("--refresh", action="store_true", help="Rescrape even if cached CSVs exist")
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir)
    csv_paths = [
        (
            start_id,
            ensure_scraped(
                start_id=start_id,
                cache_dir=cache_dir,
                max_depth=args.max_depth,
                delay=args.delay,
                quiet=args.quiet,
                refresh=args.refresh,
            ),
        )
        for start_id in args.ids
    ]

    rows = read_all_rows(csv_paths)
    output = to_json(rows, args.ids) if args.format == "json" else to_dot(rows, args.ids)
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


if __name__ == "__main__":
    main()
