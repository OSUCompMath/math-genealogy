#!/usr/bin/env python3
"""
Traverse Math Genealogy Project ancestors from a starting ID.

Pulling someone's ancestor graph is the core algorithmic piece. Each scrape
lands in its own per-person folder under --out-dir (default: scrapes/) so we
have a complete local copy to manipulate later, even if MGP starts blocking us.

On-disk layout for a starting ID:

    scrapes/<slug>_<id>/
        ancestors.csv      # parsed people, one row per ancestor
        ancestors.txt      # readable distance/name listing
        metadata.json      # start_id, name, scrape time, counts, ...
        html/<id>.html     # raw HTML for every page fetched

Examples:
    python mgp_ancestors.py 345877
    python mgp_ancestors.py 345877 --label thomas
    python mgp_ancestors.py 345877 --max-depth 12
    python mgp_ancestors.py 345877 --refresh        # ignore cached HTML
"""

import argparse
import csv
import json
import re
import shutil
import time
import unicodedata
from collections import deque, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple, Set, Optional

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm


BASE_URL = "https://www.genealogy.math.ndsu.nodak.edu/id.php?id={id}"
DEFAULT_OUT_DIR = "scrapes"


@dataclass
class Person:
    id: str
    name: str
    year: Optional[str]
    university: Optional[str]
    country: Optional[str]
    advisors: List[Tuple[str, str]]


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def slugify(text: str) -> str:
    """Turn a name like 'Anna Yesypenko' into a filesystem slug like 'anna_yesypenko'."""
    text = unicodedata.normalize("NFKD", text)
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    text = re.sub(r"[-\s]+", "_", text).strip("_")
    return text or "person"


def find_person_dir(out_dir: Path, start_id: str) -> Optional[Path]:
    """Return an existing per-person folder for start_id, or None.

    Matches either a folder whose name ends with `_<start_id>` (the canonical
    layout) or any folder containing a metadata.json with that start_id.
    """
    if not out_dir.exists():
        return None
    suffix = f"_{start_id}"
    for candidate in sorted(out_dir.iterdir()):
        if not candidate.is_dir():
            continue
        if candidate.name.endswith(suffix):
            return candidate
        meta_path = candidate / "metadata.json"
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                if str(meta.get("start_id", "")) == start_id:
                    return candidate
            except (OSError, json.JSONDecodeError):
                continue
    return None


def build_person_dir(out_dir: Path, start_id: str, name: str, label: Optional[str]) -> Path:
    """Compute the canonical per-person folder path: <out_dir>/<slug>_<id>/."""
    slug_source = label if label else name
    slug = slugify(slug_source)
    return out_dir / f"{slug}_{start_id}"


def fetch_html(
    session: requests.Session,
    mgp_id: str,
    delay: float,
    html_cache_dir: Optional[Path] = None,
    use_cache: bool = True,
) -> str:
    """Fetch the MGP page for an ID, optionally caching to / reading from disk.

    If html_cache_dir is set and use_cache is True, an existing
    <html_cache_dir>/<mgp_id>.html is returned without any network I/O.
    Successful network fetches are always written to the cache when one is
    configured, regardless of use_cache.
    """
    if html_cache_dir is not None and use_cache:
        cached = html_cache_dir / f"{mgp_id}.html"
        if cached.exists():
            return cached.read_text(encoding="utf-8")
    time.sleep(delay)
    url = BASE_URL.format(id=mgp_id)
    r = session.get(url, timeout=30)
    r.raise_for_status()
    html = r.text
    if html_cache_dir is not None:
        html_cache_dir.mkdir(parents=True, exist_ok=True)
        (html_cache_dir / f"{mgp_id}.html").write_text(html, encoding="utf-8")
    return html


_DEGREE_PATTERN = re.compile(
    r"\b(?:Ph\.?\s*D\.?|D\.?\s*Phil\.?|Sc\.?\s*D\.?|Doctorat|Dr\.?\s+rer\.?\s+nat\.?)\b",
    re.I,
)


def parse_degree_info_container(soup: BeautifulSoup):
    thesis = soup.find(id="thesisTitle")
    if thesis:
        previous = thesis.find_previous("div")
        while previous is not None:
            # Skip the dissertation div and any ancestor that wraps it —
            # otherwise we fall through to the page-wide wrapper which contains
            # all the "Dissertation:" / "Advisor:" boilerplate.
            if previous.find(id="thesisTitle"):
                previous = previous.find_previous("div")
                continue

            text = clean(previous.get_text(" "))
            # Strongest signal: the div text mentions the degree (Ph.D. / D.Phil. / etc.)
            if _DEGREE_PATTERN.search(text) and len(text) <= 300:
                return previous
            # Next-strongest: a country flag image (degree text style varies)
            if previous.find("img", src=re.compile(r"img/flags/")):
                return previous
            # Last-ditch: a 4-digit year, but only on small divs so we don't
            # accidentally pick up a wrapper whose text happens to contain a year.
            if len(text) <= 300 and re.search(r"\b(?:1[0-9]|20)[0-9]{2}\b", text):
                return previous
            previous = previous.find_previous("div")

    for tag in soup.find_all(["span", "div"]):
        text = clean(tag.get_text(" "))
        if len(text) <= 300 and _DEGREE_PATTERN.search(text):
            return tag
    return None


def parse_degree_year(soup: BeautifulSoup) -> Optional[str]:
    year_pattern = re.compile(r"\b((?:1[0-9]|20)[0-9]{2})\b")
    container = parse_degree_info_container(soup)

    if container is not None:
        text = clean(container.get_text(" "))
        match = year_pattern.search(text)
        if match:
            return match.group(1)
    return None


def parse_country(soup: BeautifulSoup) -> Optional[str]:
    container = parse_degree_info_container(soup)
    if container is not None:
        flag = container.find("img", src=re.compile(r"img/flags/"))
        if flag:
            country = flag.get("title") or flag.get("alt")
            if country:
                return clean(country)
    return None


_BOILERPLATE_RE = re.compile(
    r"^(?:Dissertation|Advisor|Student|Mathematics\s+Subject\s+Classification|"
    r"MathSciNet|Click\s+here|According\s+to\s+our|Search|Descendants?)\b",
    re.I,
)


def _looks_like_university(text: str) -> bool:
    """Reject obvious non-university text: empty, boilerplate, year-only, label-only."""
    if not text:
        return False
    if text.endswith(":"):
        return False
    if _BOILERPLATE_RE.match(text):
        return False
    if re.fullmatch(r"\d{4}", text):
        return False
    if _DEGREE_PATTERN.fullmatch(text):
        return False
    # Require at least three real letters — guards against leftover punctuation
    # (e.g. "." after stripping "Ph.D.") and pathological single-char results.
    letters = re.sub(r"[^A-Za-zÀ-ɏḀ-ỿ]", "", text)
    if len(letters) < 3:
        return False
    return True


def parse_university(soup: BeautifulSoup) -> Optional[str]:
    """Pull the school name out of the degree-info container.

    MGP encodes the school in three observed ways:
      1. As an `<a href="school.php?id=...">` link (some entries, esp. older).
      2. Inside a nested span with an inline `color: #...` style (modern pages).
      3. Plain text between the degree label and the year (last resort).
    """
    container = parse_degree_info_container(soup)
    if container is None:
        return None

    # 1. school.php link inside the container
    link = container.find("a", href=re.compile(r"school\.php"))
    if link:
        text = clean(link.get_text(" "))
        if _looks_like_university(text):
            return text

    # 2. Leaf span styled with a color (the "green" school span)
    for sp in container.find_all("span"):
        style = (sp.get("style") or "").lower()
        if "color:" not in style:
            continue
        if sp.find("span"):
            continue  # only leaf spans
        text = clean(sp.get_text(" "))
        if _looks_like_university(text):
            return text

    # 3. Strip degree label, year, and country from the container text
    text = clean(container.get_text(" "))
    flag = container.find("img", src=re.compile(r"img/flags/"))
    if flag:
        country = clean((flag.get("title") or flag.get("alt") or ""))
        if country:
            text = re.sub(re.escape(country), "", text)
    text = _DEGREE_PATTERN.sub("", text)
    text = re.sub(r"\b(?:1[0-9]|20)[0-9]{2}\b", "", text)
    text = clean(text)
    if _looks_like_university(text):
        return text
    return None


def parse_person(html: str, mgp_id: str) -> Person:
    soup = BeautifulSoup(html, "lxml")

    h2 = soup.find("h2")
    if h2:
        name = clean(h2.get_text(" "))
    else:
        title = soup.find("title")
        name = clean(title.get_text(" ")) if title else mgp_id
    year = parse_degree_year(soup)
    university = parse_university(soup)
    country = parse_country(soup)

    advisors: List[Tuple[str, str]] = []
    advisor_blocks = soup.find_all(string=re.compile(r"\bAdvisor(?:\s*\d+)?\s*:", re.I))

    for text_node in advisor_blocks:
        block = text_node.parent
        if block is None:
            continue

        block_text = clean(block.get_text(" "))
        if re.search(r"\bAdvisor(?:\s*\d+)?\s*:\s*Unknown\b", block_text, re.I):
            continue

        for a in block.find_all("a", href=re.compile(r"(?:^|/)id\.php\?id=\d+")):
            m = re.search(r"id=(\d+)", a.get("href", ""))
            if m:
                advisors.append((m.group(1), clean(a.get_text(" "))))

    seen = set()
    unique_advisors = []
    for aid, aname in advisors:
        if aid not in seen:
            seen.add(aid)
            unique_advisors.append((aid, aname))

    return Person(
        id=mgp_id,
        name=name,
        year=year,
        university=university,
        country=country,
        advisors=unique_advisors,
    )


def crawl_ancestors(
    start_id: str,
    max_depth: Optional[int],
    delay: float,
    quiet: bool = False,
    html_cache_dir: Optional[Path] = None,
    use_cache: bool = True,
):
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Academic genealogy research script "
                "(polite crawler; one request at a time)"
            )
        }
    )

    people: Dict[str, Person] = {
        start_id: Person(start_id, start_id, None, None, None, [])
    }
    distance: Dict[str, int] = {start_id: 0}
    parents: Dict[str, Set[str]] = defaultdict(set)

    queue = deque([start_id])
    queued_or_done: Set[str] = {start_id}
    failed: Set[str] = set()

    pbar = tqdm(
        total=1,
        desc="Fetching MGP pages",
        unit="page",
        dynamic_ncols=True,
        disable=quiet,
    )

    while queue:
        pid = queue.popleft()
        d = distance[pid]

        pbar.set_postfix(
            {
                "current": pid,
                "depth": d,
                "queue": len(queue),
                "found": len(distance),
                "failed": len(failed),
            },
            refresh=True,
        )

        if max_depth is not None and d >= max_depth:
            pbar.update(1)
            continue

        try:
            html = fetch_html(
                session,
                pid,
                delay=delay,
                html_cache_dir=html_cache_dir,
                use_cache=use_cache,
            )
            person = parse_person(html, pid)
            people[pid] = person
        except Exception as e:
            failed.add(pid)
            people[pid] = Person(pid, f"[FAILED: {pid}; {e}]", None, None, None, [])
            pbar.update(1)
            continue

        for advisor_id, advisor_name in person.advisors:
            parents[pid].add(advisor_id)

            if advisor_id not in people:
                people[advisor_id] = Person(advisor_id, advisor_name, None, None, None, [])

            new_dist = d + 1
            old_dist = distance.get(advisor_id)

            if old_dist is None or new_dist < old_dist:
                distance[advisor_id] = new_dist

            if advisor_id not in queued_or_done:
                queue.append(advisor_id)
                queued_or_done.add(advisor_id)
                pbar.total += 1
                pbar.refresh()

        pbar.update(1)

    pbar.close()
    return people, distance, parents, failed


def write_csv(
    path: str,
    people: Dict[str, Person],
    distance: Dict[str, int],
    parents: Dict[str, Set[str]],
):
    rows = []
    for pid, d in sorted(distance.items(), key=lambda x: (x[1], people[x[0]].name)):
        person = people[pid]
        advisor_entries = []
        for aid in sorted(parents.get(pid, [])):
            advisor_name = people.get(aid, Person(aid, aid, None, None, None, [])).name
            advisor_entries.append(f"{aid}:{advisor_name}")

        rows.append(
            {
                "distance": d,
                "id": pid,
                "name": person.name,
                "year": person.year or "",
                "university": person.university or "",
                "country": person.country or "",
                "advisors": "; ".join(advisor_entries),
                "url": BASE_URL.format(id=pid),
            }
        )

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "distance",
                "id",
                "name",
                "year",
                "university",
                "country",
                "advisors",
                "url",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def write_txt(path: str, people: Dict[str, Person], distance: Dict[str, int]):
    with open(path, "w", encoding="utf-8") as f:
        for pid, d in sorted(distance.items(), key=lambda x: (x[1], people[x[0]].name)):
            f.write(f"{d:2d}  {pid:>8}  {people[pid].name}\n")


def print_summary(people: Dict[str, Person], distance: Dict[str, int], failed: Set[str]):
    print("\nSummary:")
    print(f"  People discovered: {len(distance)}")
    print(f"  Pages failed:       {len(failed)}")
    print(f"  Max distance:       {max(distance.values()) if distance else 0}")


def write_metadata(
    path: Path,
    start_id: str,
    name: str,
    slug: str,
    started_at: datetime,
    finished_at: datetime,
    person_count: int,
    failed_ids: Set[str],
    max_depth: Optional[int],
    delay: float,
):
    payload = {
        "start_id": start_id,
        "name": name,
        "slug": slug,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_seconds": (finished_at - started_at).total_seconds(),
        "person_count": person_count,
        "failed_ids": sorted(failed_ids),
        "max_depth": max_depth,
        "delay": delay,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def scrape_one(
    start_id: str,
    out_dir_base: str = DEFAULT_OUT_DIR,
    label: Optional[str] = None,
    max_depth: Optional[int] = None,
    delay: float = 0.5,
    quiet: bool = False,
    refresh: bool = False,
) -> Path:
    """Scrape one starting ID into a self-contained per-person folder.

    Returns the path to the canonical per-person folder.

    Layout:
        <out_dir_base>/<slug>_<start_id>/
            ancestors.csv
            ancestors.txt
            metadata.json
            html/<id>.html
    """
    out_dir = Path(out_dir_base)
    out_dir.mkdir(parents=True, exist_ok=True)

    existing_dir = find_person_dir(out_dir, start_id)
    if refresh and existing_dir is not None:
        shutil.rmtree(existing_dir)
        existing_dir = None

    if existing_dir is not None:
        # Reuse the existing folder so the on-disk HTML cache is preserved
        # across runs (and across renames if --label changes).
        person_dir_path = existing_dir
    else:
        # We don't yet know the start person's name, so scrape into a temp
        # folder named by ID, then rename to <slug>_<id> once the name is
        # known. This keeps the canonical folder name in sync with the data
        # without requiring a separate "kickoff" fetch.
        person_dir_path = out_dir / f"_scraping_{start_id}"
        if person_dir_path.exists():
            shutil.rmtree(person_dir_path)
        person_dir_path.mkdir(parents=True, exist_ok=True)

    html_cache_dir = person_dir_path / "html"

    print(f"\nScraping {start_id} (cache: {person_dir_path})")
    started_at = datetime.now(timezone.utc)
    people, distance, parents, failed = crawl_ancestors(
        start_id=start_id,
        max_depth=max_depth,
        delay=delay,
        quiet=quiet,
        html_cache_dir=html_cache_dir,
        use_cache=not refresh,
    )
    finished_at = datetime.now(timezone.utc)

    name = people[start_id].name if start_id in people else start_id
    canonical_dir = build_person_dir(out_dir, start_id, name, label)

    if person_dir_path != canonical_dir:
        if canonical_dir.exists():
            shutil.rmtree(canonical_dir)
        person_dir_path.rename(canonical_dir)

    csv_path = canonical_dir / "ancestors.csv"
    txt_path = canonical_dir / "ancestors.txt"
    meta_path = canonical_dir / "metadata.json"

    write_csv(str(csv_path), people, distance, parents)
    write_txt(str(txt_path), people, distance)
    write_metadata(
        meta_path,
        start_id=start_id,
        name=name,
        slug=slugify(label) if label else slugify(name),
        started_at=started_at,
        finished_at=finished_at,
        person_count=len(distance),
        failed_ids=failed,
        max_depth=max_depth,
        delay=delay,
    )

    print_summary(people, distance, failed)
    print(f"\nWrote per-person folder: {canonical_dir}/")
    print(f"  ancestors.csv  ({len(distance)} rows)")
    print(f"  ancestors.txt")
    print(f"  metadata.json")
    print(f"  html/          (raw page cache)")

    return canonical_dir


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Scrape MGP ancestor graphs into per-person folders under --out-dir. "
            "Each folder holds parsed CSV/TXT, metadata, and a raw HTML cache so "
            "the data can be re-parsed later without going back to the network."
        ),
    )
    parser.add_argument("ids", nargs="+", help="Starting Math Genealogy Project ID(s)")
    parser.add_argument(
        "--out-dir",
        default=DEFAULT_OUT_DIR,
        help=(
            "Base directory for per-person scrape folders "
            f"(default: {DEFAULT_OUT_DIR}/). Each ID lands in <out-dir>/<slug>_<id>/."
        ),
    )
    parser.add_argument(
        "--label",
        default=None,
        nargs="+",
        help=(
            "Override the folder name slug. Pass one label per input ID, "
            "or one label total to apply to a single ID. Defaults to the "
            "scraped person's name slugified."
        ),
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Ignore any cached HTML and re-fetch every page from MGP.",
    )
    parser.add_argument("--max-depth", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests")
    parser.add_argument("--quiet", action="store_true", help="Disable progress bar")
    args = parser.parse_args()

    if args.label is not None and len(args.label) not in (1, len(args.ids)):
        parser.error("--label must provide one label, or one label per input ID")

    for i, start_id in enumerate(args.ids):
        if args.label is None:
            label = None
        elif len(args.label) == 1:
            label = args.label[0]
        else:
            label = args.label[i]

        scrape_one(
            start_id=start_id,
            out_dir_base=args.out_dir,
            label=label,
            max_depth=args.max_depth,
            delay=args.delay,
            quiet=args.quiet,
            refresh=args.refresh,
        )


if __name__ == "__main__":
    main()
