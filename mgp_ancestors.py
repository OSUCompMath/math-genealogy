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
from typing import Dict, List, Tuple, Set, Optional

import requests
from bs4 import BeautifulSoup
from tqdm import tqdm


BASE_URL = "https://www.genealogy.math.ndsu.nodak.edu/id.php?id={id}"


@dataclass
class Person:
    id: str
    name: str
    advisors: List[Tuple[str, str]]


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def fetch_html(session: requests.Session, mgp_id: str, delay: float) -> str:
    time.sleep(delay)
    url = BASE_URL.format(id=mgp_id)
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def parse_person(html: str, mgp_id: str) -> Person:
    soup = BeautifulSoup(html, "lxml")

    h2 = soup.find("h2")
    if h2:
        name = clean(h2.get_text(" "))
    else:
        title = soup.find("title")
        name = clean(title.get_text(" ")) if title else mgp_id

    advisors: List[Tuple[str, str]] = []

    # Avoid accidentally crawling descendants.
    upper_html = re.split(
        r"Students:|Student:|Descendants:",
        html,
        flags=re.I,
    )[0]

    pattern = re.compile(
        r"Advisor(?:\s*\d+)?\s*:.*?"
        r"<a\s+href=[\"'](?:/)?id\.php\?id=(\d+)[\"'][^>]*>(.*?)</a>",
        re.I | re.S,
    )

    for aid, aname_html in pattern.findall(upper_html):
        aname = clean(BeautifulSoup(aname_html, "lxml").get_text(" "))
        advisors.append((aid, aname))

    # Fallback for unusual page structures.
    if not advisors:
        for text_node in soup.find_all(string=re.compile(r"Advisor", re.I)):
            block = text_node.parent
            for _ in range(4):
                if block is None:
                    break
                links = block.find_all("a", href=re.compile(r"id\.php\?id=\d+"))
                for a in links:
                    m = re.search(r"id=(\d+)", a.get("href", ""))
                    if m:
                        advisors.append((m.group(1), clean(a.get_text(" "))))
                if advisors:
                    break
                block = block.parent

    seen = set()
    unique_advisors = []
    for aid, aname in advisors:
        if aid not in seen:
            seen.add(aid)
            unique_advisors.append((aid, aname))

    return Person(id=mgp_id, name=name, advisors=unique_advisors)


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

    people: Dict[str, Person] = {}
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
            people[pid] = Person(pid, f"[FAILED: {pid}; {e}]", [])
            pbar.update(1)
            continue

        for advisor_id, advisor_name in person.advisors:
            parents[pid].add(advisor_id)

            if advisor_id not in people:
                people[advisor_id] = Person(advisor_id, advisor_name, [])

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
            advisor_name = people.get(aid, Person(aid, aid, [])).name
            advisor_entries.append(f"{aid}:{advisor_name}")

        rows.append(
            {
                "distance": d,
                "id": pid,
                "name": person.name,
                "advisors": "; ".join(advisor_entries),
                "url": BASE_URL.format(id=pid),
            }
        )

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["distance", "id", "name", "advisors", "url"],
        )
        writer.writeheader()
        writer.writerows(rows)


def write_txt(path: str, people: Dict[str, Person], distance: Dict[str, int]):
    with open(path, "w", encoding="utf-8") as f:
        for pid, d in sorted(distance.items(), key=lambda x: (x[1], people[x[0]].name)):
            f.write(f"{d:2d}  {pid:>8}  {people[pid].name}\n")


def print_summary(people: Dict[str, Person], distance: Dict[str, int], failed: Set[str]):
    print("\nAncestors by shortest distance:\n")
    for pid, d in sorted(distance.items(), key=lambda x: (x[1], people[x[0]].name)):
        print(f"{d:2d}  {pid:>8}  {people[pid].name}")

    print("\nSummary:")
    print(f"  People discovered: {len(distance)}")
    print(f"  Pages failed:       {len(failed)}")
    print(f"  Max distance:       {max(distance.values()) if distance else 0}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("id", help="Starting Math Genealogy Project ID")
    parser.add_argument("--out", default="mgp_ancestors.csv", help="CSV output path")
    parser.add_argument("--txt", default="mgp_ancestors.txt", help="Text output path")
    parser.add_argument("--max-depth", type=int, default=None)
    parser.add_argument("--delay", type=float, default=0.5, help="Delay between requests")
    parser.add_argument("--quiet", action="store_true", help="Disable progress bar")
    args = parser.parse_args()

    people, distance, parents, failed = crawl_ancestors(
        start_id=args.id,
        max_depth=args.max_depth,
        delay=args.delay,
        quiet=args.quiet,
    )

    write_csv(args.out, people, distance, parents)
    write_txt(args.txt, people, distance)
    print_summary(people, distance, failed)

    print(f"\nWrote CSV:  {args.out}")
    print(f"Wrote text: {args.txt}")


if __name__ == "__main__":
    main()