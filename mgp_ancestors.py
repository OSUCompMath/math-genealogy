#!/usr/bin/env python3
"""
Traverse Math Genealogy Project ancestors from a starting ID.

Examples:
    python mgp_ancestors.py 345877
    python mgp_ancestors.py 345877 --out thomas_ancestors.csv --delay 0.5
    python mgp_ancestors.py 345877 --max-depth 12
"""

import argparse
import csv
import re
import time
from collections import deque, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple, Set, Optional

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm


BASE_URL = "https://www.genealogy.math.ndsu.nodak.edu/id.php?id={id}"


@dataclass
class Person:
    id: str
    name: str
    year: Optional[str]
    country: Optional[str]
    advisors: List[Tuple[str, str]]


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def fetch_html(session: requests.Session, mgp_id: str, delay: float) -> str:
    time.sleep(delay)
    url = BASE_URL.format(id=mgp_id)
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def parse_degree_info_container(soup: BeautifulSoup):
    thesis = soup.find(id="thesisTitle")
    if thesis:
        previous = thesis.find_previous("div")
        while previous is not None:
            if previous.find("img", src=re.compile(r"img/flags/")):
                return previous
            text = clean(previous.get_text(" "))
            if re.search(r"\b((?:1[0-9]|20)[0-9]{2})\b", text):
                return previous
            previous = previous.find_previous("div")

    degree_pattern = re.compile(
        r"Ph\.?\s*D\.?|D\.?\s*Phil\.?|Sc\.?\s*D\.?|Doctorat|"
        r"Dr\.?\s+rer\.?\s+nat\.?",
        re.I,
    )
    for tag in soup.find_all(["span", "div"]):
        text = clean(tag.get_text(" "))
        if len(text) <= 200 and degree_pattern.search(text):
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


def parse_person(html: str, mgp_id: str) -> Person:
    soup = BeautifulSoup(html, "lxml")

    h2 = soup.find("h2")
    if h2:
        name = clean(h2.get_text(" "))
    else:
        title = soup.find("title")
        name = clean(title.get_text(" ")) if title else mgp_id
    year = parse_degree_year(soup)
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
        country=country,
        advisors=unique_advisors,
    )


def crawl_ancestors(
    start_id: str,
    max_depth: Optional[int],
    delay: float,
    quiet: bool = False,
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
        start_id: Person(start_id, start_id, None, None, [])
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
            html = fetch_html(session, pid, delay=delay)
            person = parse_person(html, pid)
            people[pid] = person
        except Exception as e:
            failed.add(pid)
            people[pid] = Person(pid, f"[FAILED: {pid}; {e}]", None, None, [])
            pbar.update(1)
            continue

        for advisor_id, advisor_name in person.advisors:
            parents[pid].add(advisor_id)

            if advisor_id not in people:
                people[advisor_id] = Person(advisor_id, advisor_name, None, None, [])

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
            advisor_name = people.get(aid, Person(aid, aid, None, None, [])).name
            advisor_entries.append(f"{aid}:{advisor_name}")

        rows.append(
            {
                "distance": d,
                "id": pid,
                "name": person.name,
                "year": person.year or "",
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


def default_scrape_paths(out_dir: str, start_id: str) -> Tuple[str, str]:
    output_dir = Path(out_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    return (
        str(output_dir / f"mgp_ancestors_{start_id}.csv"),
        str(output_dir / f"mgp_ancestors_{start_id}.txt"),
    )


def scrape_one(
    start_id: str,
    out_path: str,
    txt_path: str,
    max_depth: Optional[int],
    delay: float,
    quiet: bool,
):
    print(f"\nScraping {start_id}")
    people, distance, parents, failed = crawl_ancestors(
        start_id=start_id,
        max_depth=max_depth,
        delay=delay,
        quiet=quiet,
    )

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(txt_path).parent.mkdir(parents=True, exist_ok=True)
    write_csv(out_path, people, distance, parents)
    write_txt(txt_path, people, distance)
    print_summary(people, distance, failed)

    print(f"\nWrote CSV:  {out_path}")
    print(f"Wrote text: {txt_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("ids", nargs="+", help="Starting Math Genealogy Project ID(s)")
    parser.add_argument(
        "--out",
        default=None,
        nargs="+",
        help="CSV output path(s). If provided, pass one path per input ID.",
    )
    parser.add_argument(
        "--txt",
        default=None,
        nargs="+",
        help="Text output path(s). If provided, pass one path per input ID.",
    )
    parser.add_argument(
        "--out-dir",
        default="scrapes",
        help="Output directory for automatic per-ID scrape files",
    )
    parser.add_argument("--max-depth", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests")
    parser.add_argument("--quiet", action="store_true", help="Disable progress bar")
    args = parser.parse_args()

    if args.out is not None and len(args.out) != len(args.ids):
        parser.error("--out must provide exactly one path per input ID")
    if args.txt is not None and len(args.txt) != len(args.ids):
        parser.error("--txt must provide exactly one path per input ID")

    for i, start_id in enumerate(args.ids):
        if args.out is not None:
            out_path = args.out[i]
        elif len(args.ids) == 1:
            out_path = "mgp_ancestors.csv"
        else:
            out_path, _txt_path = default_scrape_paths(args.out_dir, start_id)

        if args.txt is not None:
            txt_path = args.txt[i]
        elif len(args.ids) == 1:
            txt_path = "mgp_ancestors.txt"
        else:
            _out_path, txt_path = default_scrape_paths(args.out_dir, start_id)

        scrape_one(
            start_id=start_id,
            out_path=out_path,
            txt_path=txt_path,
            max_depth=args.max_depth,
            delay=args.delay,
            quiet=args.quiet,
        )


if __name__ == "__main__":
    main()
