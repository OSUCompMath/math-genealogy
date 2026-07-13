#!/usr/bin/env python3
"""
Build the static Ohio State MGP graph data file.

The builder fetches each MGP page at most once, stores person pages in a local
cache, and writes a compact shared graph. The output is designed for GUI use:
all faculty lineages share one people table, and each person carries a faculty
reachability bitmask for fast common-ancestor filtering.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from mgp_ancestors import BASE_URL, parse_person


ROSTER_COLUMNS = [
    "osu_name",
    "mgp_id",
    "mgp_name",
    "mgp_degree_school",
    "mgp_degree_year",
    "osu_phd_from_profile",
    "verification_status",
    "note",
]

AREA_COLUMNS = [
    "osu_name",
    "profile_url",
    "title",
    "filed_in",
    "expertise",
    "area_ids",
    "note",
]


@dataclass
class FacultyRecord:
    osu_name: str
    mgp_id: str
    mgp_name: str
    mgp_degree_school: str
    mgp_degree_year: str
    osu_phd_from_profile: str
    verification_status: str
    note: str


@dataclass
class FacultyAreaRecord:
    osu_name: str
    profile_url: str
    title: str
    filed_in: list[str]
    expertise: list[str]
    area_ids: list[str]
    note: str


@dataclass
class PersonRecord:
    id: str
    name: str
    year: str
    country: str
    advisors: list[tuple[str, str]]
    url: str


def read_faculty_roster(path: Path) -> tuple[list[FacultyRecord], list[FacultyRecord]]:
    faculty: list[FacultyRecord] = []
    unresolved: list[FacultyRecord] = []
    with path.open(encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue

            parts = line.split("\t")
            if len(parts) < len(ROSTER_COLUMNS):
                parts.extend([""] * (len(ROSTER_COLUMNS) - len(parts)))
            if len(parts) > len(ROSTER_COLUMNS):
                raise ValueError(f"{path}:{line_number}: too many tab-separated columns")

            record = FacultyRecord(**dict(zip(ROSTER_COLUMNS, parts, strict=True)))
            if record.mgp_id.isdigit():
                faculty.append(record)
            else:
                unresolved.append(record)
    return faculty, unresolved


def split_list(value: str) -> list[str]:
    return [part.strip() for part in value.split(";") if part.strip()]


def slug_area(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower().replace("&", " and ")).strip("-")


def read_faculty_areas(path: Path) -> dict[str, FacultyAreaRecord]:
    if not path.exists():
        return {}

    areas: dict[str, FacultyAreaRecord] = {}
    with path.open(encoding="utf-8") as f:
        for line_number, line in enumerate(f, start=1):
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue

            parts = line.split("\t")
            if len(parts) < len(AREA_COLUMNS):
                parts.extend([""] * (len(AREA_COLUMNS) - len(parts)))
            if len(parts) > len(AREA_COLUMNS):
                raise ValueError(f"{path}:{line_number}: too many tab-separated columns")

            raw = dict(zip(AREA_COLUMNS, parts, strict=True))
            areas[raw["osu_name"]] = FacultyAreaRecord(
                osu_name=raw["osu_name"],
                profile_url=raw["profile_url"],
                title=raw["title"],
                filed_in=split_list(raw["filed_in"]),
                expertise=split_list(raw["expertise"]),
                area_ids=split_list(raw["area_ids"]),
                note=raw["note"],
            )
    return areas


def parse_advisors(value: str) -> list[tuple[str, str]]:
    advisors: list[tuple[str, str]] = []
    for entry in value.split(";"):
        entry = entry.strip()
        if not entry:
            continue
        advisor_id, _sep, advisor_name = entry.partition(":")
        advisor_id = advisor_id.strip()
        if advisor_id:
            advisors.append((advisor_id, advisor_name.strip()))
    return advisors


def person_cache_path(cache_dir: Path, person_id: str) -> Path:
    return cache_dir / f"{person_id}.json"


def load_cached_person(cache_dir: Path, person_id: str) -> PersonRecord | None:
    path = person_cache_path(cache_dir, person_id)
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    return PersonRecord(
        id=str(payload["id"]),
        name=str(payload.get("name") or payload["id"]),
        year=str(payload.get("year") or ""),
        country=str(payload.get("country") or ""),
        advisors=[(str(a[0]), str(a[1])) for a in payload.get("advisors", [])],
        url=str(payload.get("url") or BASE_URL.format(id=payload["id"])),
    )


def write_cached_person(cache_dir: Path, person: PersonRecord) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = person_cache_path(cache_dir, person.id)
    payload = asdict(person)
    payload["advisors"] = [[advisor_id, name] for advisor_id, name in person.advisors]
    path.write_text(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def seed_people_from_scrapes(scrapes_dir: Path, cache_dir: Path) -> dict[str, PersonRecord]:
    people: dict[str, PersonRecord] = {}
    if not scrapes_dir.exists():
        return people

    for csv_path in sorted(scrapes_dir.glob("mgp_ancestors_*.csv")):
        with csv_path.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for raw in reader:
                person_id = raw["id"].strip()
                if not person_id or person_id in people:
                    continue
                person = PersonRecord(
                    id=person_id,
                    name=raw.get("name", "").strip() or person_id,
                    year=raw.get("year", "").strip(),
                    country=raw.get("country", "").strip(),
                    advisors=parse_advisors(raw.get("advisors", "")),
                    url=raw.get("url", "").strip() or BASE_URL.format(id=person_id),
                )
                people[person.id] = person
                if load_cached_person(cache_dir, person.id) is None:
                    write_cached_person(cache_dir, person)
    return people


def fetch_person(session: requests.Session, person_id: str, delay: float) -> PersonRecord:
    time.sleep(delay)
    response = session.get(BASE_URL.format(id=person_id), timeout=30)
    response.raise_for_status()
    parsed = parse_person(response.text, person_id)
    return PersonRecord(
        id=parsed.id,
        name=parsed.name,
        year=parsed.year or "",
        country=parsed.country or "",
        advisors=parsed.advisors,
        url=BASE_URL.format(id=person_id),
    )


def load_or_fetch_person(
    session: requests.Session,
    person_id: str,
    cache_dir: Path,
    people: dict[str, PersonRecord],
    delay: float,
    offline: bool,
) -> tuple[PersonRecord | None, bool]:
    if person_id in people:
        return people[person_id], False

    cached = load_cached_person(cache_dir, person_id)
    if cached is not None:
        people[person_id] = cached
        return cached, False

    if offline:
        return None, False

    person = fetch_person(session, person_id, delay=delay)
    people[person.id] = person
    write_cached_person(cache_dir, person)
    return person, True


def crawl_shared_graph(
    start_ids: list[str],
    cache_dir: Path,
    scrapes_dir: Path,
    delay: float,
    max_depth: int | None,
    offline: bool,
    checkpoint_every: int,
) -> tuple[dict[str, PersonRecord], set[str]]:
    people = seed_people_from_scrapes(scrapes_dir, cache_dir)
    missing: set[str] = set()
    best_depth: dict[str, int] = {person_id: 0 for person_id in start_ids}
    queue = deque(start_ids)
    queued = set(start_ids)
    fetched_count = 0
    processed_count = 0

    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Ohio State static MGP graph builder "
                "(polite crawler; shared cache; one request at a time)"
            )
        }
    )

    while queue:
        person_id = queue.popleft()
        queued.discard(person_id)
        depth = best_depth[person_id]

        person, fetched = load_or_fetch_person(
            session=session,
            person_id=person_id,
            cache_dir=cache_dir,
            people=people,
            delay=delay,
            offline=offline,
        )
        processed_count += 1
        if fetched:
            fetched_count += 1
        if person is None:
            missing.add(person_id)
            continue

        if max_depth is not None and depth >= max_depth:
            continue

        for advisor_id, _advisor_name in person.advisors:
            next_depth = depth + 1
            old_depth = best_depth.get(advisor_id)
            if old_depth is None or next_depth < old_depth:
                best_depth[advisor_id] = next_depth
                if advisor_id not in queued:
                    queue.append(advisor_id)
                    queued.add(advisor_id)

        if checkpoint_every and processed_count % checkpoint_every == 0:
            print(
                "progress: "
                f"processed={processed_count} cached_people={len(people)} "
                f"fetched={fetched_count} queue={len(queue)} missing={len(missing)}",
                flush=True,
            )

    return people, missing


def compute_ancestor_distances(
    people: dict[str, PersonRecord],
    faculty: list[FacultyRecord],
) -> dict[str, dict[str, int]]:
    distances_by_faculty: dict[str, dict[str, int]] = {}
    for record in faculty:
        distances = {record.mgp_id: 0}
        queue = deque([record.mgp_id])
        while queue:
            person_id = queue.popleft()
            person = people.get(person_id)
            if person is None:
                continue
            current_distance = distances[person_id]
            for advisor_id, _advisor_name in person.advisors:
                next_distance = current_distance + 1
                old_distance = distances.get(advisor_id)
                if old_distance is None or next_distance < old_distance:
                    distances[advisor_id] = next_distance
                    queue.append(advisor_id)
        distances_by_faculty[record.mgp_id] = distances
    return distances_by_faculty


def build_static_payload(
    people: dict[str, PersonRecord],
    faculty: list[FacultyRecord],
    unresolved: list[FacultyRecord],
    faculty_areas: dict[str, FacultyAreaRecord],
    missing_pages: set[str],
    max_depth: int | None,
    areas_source: str,
) -> dict[str, Any]:
    distances_by_faculty = compute_ancestor_distances(people, faculty)
    sorted_people = sorted(people.values(), key=lambda p: (int(p.id) if p.id.isdigit() else 10**12, p.id))
    id_to_index = {person.id: i for i, person in enumerate(sorted_people)}
    faculty_id_to_index = {record.mgp_id: i for i, record in enumerate(faculty)}

    distance_index: dict[int, list[list[int]]] = {}
    faculty_mask_by_person = {person.id: 0 for person in sorted_people}
    ancestors_by_faculty: dict[int, list[list[int]]] = {}
    for record in faculty:
        faculty_idx = faculty_id_to_index[record.mgp_id]
        ancestor_rows: list[list[int]] = []
        for person_id, distance in distances_by_faculty[record.mgp_id].items():
            person_idx = id_to_index.get(person_id)
            if person_idx is None:
                continue
            faculty_mask_by_person[person_id] |= 1 << faculty_idx
            distance_index.setdefault(person_idx, []).append([faculty_idx, distance])
            ancestor_rows.append([person_idx, distance])
        ancestors_by_faculty[faculty_idx] = sorted(
            ancestor_rows,
            key=lambda row: (row[1], sorted_people[row[0]].name),
        )

    people_payload = []
    edges: list[list[int]] = []
    seen_edges: set[tuple[int, int]] = set()
    for person in sorted_people:
        person_idx = id_to_index[person.id]
        advisor_indices: list[int] = []
        advisor_ids: list[str] = []
        for advisor_id, _advisor_name in person.advisors:
            advisor_idx = id_to_index.get(advisor_id)
            advisor_ids.append(advisor_id)
            if advisor_idx is None:
                continue
            advisor_indices.append(advisor_idx)
            edge = (advisor_idx, person_idx)
            if edge not in seen_edges:
                seen_edges.add(edge)
                edges.append([advisor_idx, person_idx])
        people_payload.append(
            {
                "id": person.id,
                "name": person.name,
                "year": person.year,
                "country": person.country,
                "url": person.url,
                "advisor_ids": advisor_ids,
                "advisor_indices": advisor_indices,
                "faculty_mask": format(faculty_mask_by_person[person.id], "x"),
            }
        )

    faculty_payload = []
    group_label_by_id: dict[str, str] = {}
    for i, record in enumerate(faculty):
        area = faculty_areas.get(record.osu_name)
        group_ids = (area.area_ids or [slug_area(value) for value in area.filed_in]) if area else []
        if area:
            for filed_in in area.filed_in:
                group_label_by_id.setdefault(slug_area(filed_in), filed_in)
        faculty_payload.append(
            {
                **asdict(record),
                "faculty_index": i,
                "person_index": id_to_index.get(record.mgp_id),
                "profile_url": area.profile_url if area else "",
                "title": area.title if area else "",
                "filed_in": area.filed_in if area else [],
                "expertise": area.expertise if area else [],
                "groups": group_ids,
                "area_note": area.note if area else "",
            }
        )

    unresolved_payload = []
    for record in unresolved:
        area = faculty_areas.get(record.osu_name)
        group_ids = (area.area_ids or [slug_area(value) for value in area.filed_in]) if area else []
        if area:
            for filed_in in area.filed_in:
                group_label_by_id.setdefault(slug_area(filed_in), filed_in)
        unresolved_payload.append(
            {
                **asdict(record),
                "profile_url": area.profile_url if area else "",
                "title": area.title if area else "",
                "filed_in": area.filed_in if area else [],
                "expertise": area.expertise if area else [],
                "groups": group_ids,
                "area_note": area.note if area else "",
            }
        )

    faculty_by_group: dict[str, list[int]] = {}
    faculty_by_filed_in: dict[str, list[int]] = {}
    for record in faculty_payload:
        faculty_idx = record["faculty_index"]
        for group in record["groups"]:
            faculty_by_group.setdefault(group, []).append(faculty_idx)
        for filed_in in record["filed_in"]:
            faculty_by_filed_in.setdefault(filed_in, []).append(faculty_idx)

    group_payload = {}
    for group, faculty_indices in sorted(faculty_by_group.items()):
        mask = 0
        for faculty_idx in faculty_indices:
            mask |= 1 << faculty_idx
        group_payload[group] = {
            "id": group,
            "label": group_label_by_id.get(group, group.replace("-", " ").title()),
            "faculty_indices": sorted(faculty_indices),
            "faculty_mask": format(mask, "x"),
        }

    return {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "faculty_source": "https://math.osu.edu/people",
            "mgp_source": "https://www.genealogy.math.ndsu.nodak.edu/",
            "roster_source": "faculty_osu.txt",
            "areas_source": areas_source,
            "max_depth": max_depth,
            "person_count": len(people_payload),
            "edge_count": len(edges),
            "faculty_count": len(faculty_payload),
            "unresolved_faculty_count": len(unresolved),
            "missing_page_count": len(missing_pages),
            "complete": len(missing_pages) == 0,
        },
        "faculty": faculty_payload,
        "unresolved_faculty": unresolved_payload,
        "faculty_groups": group_payload,
        "people": people_payload,
        "edges": sorted(edges),
        "indexes": {
            "id_to_index": id_to_index,
            "faculty_name_to_index": {record.osu_name: i for i, record in enumerate(faculty)},
            "faculty_by_filed_in": {
                key: sorted(value) for key, value in sorted(faculty_by_filed_in.items())
            },
            "faculty_by_group": {
                key: sorted(value) for key, value in sorted(faculty_by_group.items())
            },
            "ancestors_by_faculty": ancestors_by_faculty,
            "distances_by_person": {
                str(person_idx): sorted(rows)
                for person_idx, rows in sorted(distance_index.items())
            },
        },
        "missing_pages": sorted(missing_pages),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--faculty", default="faculty_osu.txt", help="Verified faculty roster")
    parser.add_argument("--areas", default="faculty_areas_osu.txt", help="Faculty area metadata TSV")
    parser.add_argument("--out", default="data/osu_mgp_graph.json", help="Static graph JSON output")
    parser.add_argument("--cache-dir", default=".cache/mgp_people", help="Per-person MGP page cache")
    parser.add_argument("--scrapes-dir", default="scrapes", help="Existing scrape CSV seed directory")
    parser.add_argument("--delay", type=float, default=0.5, help="Delay before each uncached MGP request")
    parser.add_argument("--max-depth", type=int, default=None, help="Optional ancestor depth limit")
    parser.add_argument("--offline", action="store_true", help="Use only existing cache and scrape CSVs")
    parser.add_argument("--checkpoint-every", type=int, default=25)
    args = parser.parse_args()

    faculty, unresolved = read_faculty_roster(Path(args.faculty))
    faculty_areas = read_faculty_areas(Path(args.areas))
    start_ids = [record.mgp_id for record in faculty]
    people, missing_pages = crawl_shared_graph(
        start_ids=start_ids,
        cache_dir=Path(args.cache_dir),
        scrapes_dir=Path(args.scrapes_dir),
        delay=args.delay,
        max_depth=args.max_depth,
        offline=args.offline,
        checkpoint_every=args.checkpoint_every,
    )
    payload = build_static_payload(
        people=people,
        faculty=faculty,
        unresolved=unresolved,
        faculty_areas=faculty_areas,
        missing_pages=missing_pages,
        max_depth=args.max_depth,
        areas_source=args.areas,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {out_path}: {payload['metadata']['person_count']} people, "
        f"{payload['metadata']['edge_count']} edges, complete={payload['metadata']['complete']}"
    )


if __name__ == "__main__":
    main()
