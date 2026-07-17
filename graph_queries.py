#!/usr/bin/env python3
"""
Fast local queries over data/osu_mgp_graph.json.

This module performs no network access. It relies on the static indexes written
by build_static_data.py: per-person faculty reachability masks, ancestor lists
per faculty member, and sparse distance rows for ranking common ancestors.
"""

from __future__ import annotations

import argparse
import json
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass
class StaticGraph:
    payload: dict[str, Any]

    @property
    def people(self) -> list[dict[str, Any]]:
        return self.payload["people"]

    @property
    def faculty(self) -> list[dict[str, Any]]:
        return self.payload["faculty"]

    @property
    def faculty_groups(self) -> dict[str, dict[str, Any]]:
        return self.payload.get("faculty_groups", {})

    @property
    def faculty_name_to_index(self) -> dict[str, int]:
        return self.payload["indexes"]["faculty_name_to_index"]

    @property
    def id_to_index(self) -> dict[str, int]:
        return self.payload["indexes"]["id_to_index"]

    def faculty_index(self, name_or_id: str) -> int:
        if name_or_id in self.faculty_name_to_index:
            return self.faculty_name_to_index[name_or_id]
        for i, record in enumerate(self.faculty):
            if record["mgp_id"] == name_or_id:
                return i
            if record["osu_name"].lower() == name_or_id.lower():
                return i
        raise KeyError(f"unknown faculty member: {name_or_id}")

    def person_index(self, name_or_id: str) -> int:
        if name_or_id in self.id_to_index:
            return self.id_to_index[name_or_id]
        matches = [
            i
            for i, person in enumerate(self.people)
            if person["name"].lower() == name_or_id.lower()
        ]
        if len(matches) == 1:
            return matches[0]
        if matches:
            raise KeyError(f"ambiguous person name {name_or_id!r}; use an MGP ID")
        raise KeyError(f"unknown person: {name_or_id}")

    def group_record(self, group_id_or_label: str) -> dict[str, Any]:
        groups = self.faculty_groups
        if group_id_or_label in groups:
            return groups[group_id_or_label]

        normalized = group_id_or_label.lower()
        matches = [
            record
            for group_id, record in groups.items()
            if group_id.lower() == normalized or record["label"].lower() == normalized
        ]
        if len(matches) == 1:
            return matches[0]
        if matches:
            raise KeyError(f"ambiguous group {group_id_or_label!r}; use a group id")
        raise KeyError(f"unknown group: {group_id_or_label}")

    def faculty_indices_for_group(self, group_id_or_label: str) -> list[int]:
        return [int(idx) for idx in self.group_record(group_id_or_label)["faculty_indices"]]

    def faculty_for_group(self, group_id_or_label: str) -> list[dict[str, Any]]:
        faculty_indices = self.faculty_indices_for_group(group_id_or_label)
        return sorted(
            (
                {
                    **self.faculty[idx],
                    "filed_in": "; ".join(self.faculty[idx].get("filed_in", [])),
                    "expertise": "; ".join(self.faculty[idx].get("expertise", [])),
                    "groups": "; ".join(self.faculty[idx].get("groups", [])),
                }
                for idx in faculty_indices
            ),
            key=lambda record: record["osu_name"],
        )

    def group_summary(self) -> list[dict[str, Any]]:
        rows = []
        for group_id, group in sorted(self.faculty_groups.items()):
            faculty_indices = [int(idx) for idx in group["faculty_indices"]]
            group_mask = int(group["faculty_mask"], 16) if group["faculty_mask"] else 0
            person_indices = [
                idx
                for idx, person in enumerate(self.people)
                if int(person["faculty_mask"], 16) & group_mask
            ]
            person_set = set(person_indices)
            edge_count = sum(
                1
                for advisor_idx, student_idx in self.payload["edges"]
                if advisor_idx in person_set and student_idx in person_set
            )
            shared_ancestor_count = sum(
                1
                for person_idx in person_indices
                if (
                    int(self.people[person_idx]["faculty_mask"], 16) & group_mask
                ).bit_count()
                >= min(2, len(faculty_indices))
            )
            rows.append(
                {
                    "id": group_id,
                    "label": group["label"],
                    "faculty_count": len(faculty_indices),
                    "lineage_people": len(person_indices),
                    "lineage_edges": edge_count,
                    "shared_ancestors": shared_ancestor_count,
                }
            )
        rows.sort(key=lambda row: (-row["faculty_count"], row["label"]))
        return rows

    def common_ancestors(self, faculty_names: list[str], limit: int = 25) -> list[dict[str, Any]]:
        faculty_indices = [self.faculty_index(name) for name in faculty_names]
        if not faculty_indices:
            return []
        target_mask = 0
        for idx in faculty_indices:
            target_mask |= 1 << idx

        distances_by_person = self.payload["indexes"]["distances_by_person"]
        rows = []
        for person_index, person in enumerate(self.people):
            person_mask = int(person["faculty_mask"], 16) if person["faculty_mask"] else 0
            if person_mask & target_mask != target_mask:
                continue
            distance_pairs = {
                int(faculty_idx): distance
                for faculty_idx, distance in distances_by_person.get(str(person_index), [])
            }
            selected_distances = [distance_pairs[idx] for idx in faculty_indices]
            rows.append(
                {
                    "id": person["id"],
                    "name": person["name"],
                    "year": person["year"],
                    "country": person["country"],
                    "max_distance": max(selected_distances),
                    "total_distance": sum(selected_distances),
                    "distances": {
                        self.faculty[idx]["osu_name"]: distance_pairs[idx]
                        for idx in faculty_indices
                    },
                }
            )
        rows.sort(key=lambda row: (row["max_distance"], row["total_distance"], row["name"]))
        return rows[:limit]

    def common_ancestors_for_group(
        self,
        group_id_or_label: str,
        min_faculty: int = 2,
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        faculty_indices = self.faculty_indices_for_group(group_id_or_label)
        if not faculty_indices:
            return []

        min_faculty = max(1, min(min_faculty, len(faculty_indices)))
        target_mask = 0
        for idx in faculty_indices:
            target_mask |= 1 << idx

        distances_by_person = self.payload["indexes"]["distances_by_person"]
        rows = []
        for person_index, person in enumerate(self.people):
            person_mask = int(person["faculty_mask"], 16) if person["faculty_mask"] else 0
            matched_indices = [
                idx for idx in faculty_indices if person_mask & (1 << idx)
            ]
            if len(matched_indices) < min_faculty:
                continue
            distance_pairs = {
                int(faculty_idx): distance
                for faculty_idx, distance in distances_by_person.get(str(person_index), [])
            }
            selected_distances = [distance_pairs[idx] for idx in matched_indices]
            rows.append(
                {
                    "id": person["id"],
                    "name": person["name"],
                    "year": person["year"],
                    "country": person["country"],
                    "matched_faculty_count": len(matched_indices),
                    "max_distance": max(selected_distances),
                    "total_distance": sum(selected_distances),
                    "matched_faculty": ", ".join(
                        self.faculty[idx]["osu_name"] for idx in matched_indices
                    ),
                }
            )
        rows.sort(
            key=lambda row: (
                -row["matched_faculty_count"],
                row["max_distance"],
                row["total_distance"],
                row["name"],
            )
        )
        return rows[:limit]

    def ancestors_of_faculty(self, faculty_name: str, limit: int | None = None) -> list[dict[str, Any]]:
        faculty_idx = self.faculty_index(faculty_name)
        ancestor_rows = self.payload["indexes"]["ancestors_by_faculty"][str(faculty_idx)]
        out = []
        for person_idx, distance in ancestor_rows[:limit]:
            person = self.people[person_idx]
            out.append(
                {
                    "id": person["id"],
                    "name": person["name"],
                    "year": person["year"],
                    "country": person["country"],
                    "distance": distance,
                }
            )
        return out

    def path_to_ancestor(self, faculty_name: str, ancestor_name_or_id: str) -> list[dict[str, Any]]:
        faculty_idx = self.faculty_index(faculty_name)
        start_idx = self.faculty[faculty_idx]["person_index"]
        target_idx = self.person_index(ancestor_name_or_id)
        if start_idx is None:
            return []

        queue = deque([start_idx])
        previous: dict[int, int | None] = {start_idx: None}
        while queue:
            person_idx = queue.popleft()
            if person_idx == target_idx:
                break
            for advisor_idx in self.people[person_idx]["advisor_indices"]:
                if advisor_idx not in previous:
                    previous[advisor_idx] = person_idx
                    queue.append(advisor_idx)
        else:
            return []

        path_indices = []
        cursor: int | None = target_idx
        while cursor is not None:
            path_indices.append(cursor)
            cursor = previous[cursor]
        path_indices.reverse()
        return [
            {
                "id": self.people[idx]["id"],
                "name": self.people[idx]["name"],
                "year": self.people[idx]["year"],
                "country": self.people[idx]["country"],
            }
            for idx in path_indices
        ]


def load_graph(path: str | Path = "data/osu_mgp_graph.json") -> StaticGraph:
    return StaticGraph(json.loads(Path(path).read_text(encoding="utf-8")))


def print_table(rows: list[dict[str, Any]], columns: list[str]) -> None:
    if not rows:
        return
    widths = {
        column: max(len(column), *(len(str(row.get(column, ""))) for row in rows))
        for column in columns
    }
    print("  ".join(column.ljust(widths[column]) for column in columns))
    print("  ".join("-" * widths[column] for column in columns))
    for row in rows:
        print("  ".join(str(row.get(column, "")).ljust(widths[column]) for column in columns))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/osu_mgp_graph.json")
    subparsers = parser.add_subparsers(dest="command", required=True)

    common = subparsers.add_parser("common", help="Find common ancestors")
    common.add_argument("faculty", nargs="+")
    common.add_argument("--limit", type=int, default=25)

    ancestors = subparsers.add_parser("ancestors", help="List one faculty member's ancestors")
    ancestors.add_argument("faculty")
    ancestors.add_argument("--limit", type=int, default=25)

    path = subparsers.add_parser("path", help="Find one advisor path to an ancestor")
    path.add_argument("faculty")
    path.add_argument("ancestor")

    subparsers.add_parser("groups", help="Summarize derived OSU area groups")

    group_faculty = subparsers.add_parser("group-faculty", help="List faculty in a derived group")
    group_faculty.add_argument("group")

    group_common = subparsers.add_parser(
        "group-common",
        help="Find common ancestors inside a derived group",
    )
    group_common.add_argument("group")
    group_common.add_argument("--min-faculty", type=int, default=2)
    group_common.add_argument("--limit", type=int, default=25)

    args = parser.parse_args()
    graph = load_graph(args.data)
    if args.command == "common":
        rows = graph.common_ancestors(args.faculty, limit=args.limit)
        print_table(rows, ["id", "name", "year", "country", "max_distance", "total_distance"])
    elif args.command == "ancestors":
        rows = graph.ancestors_of_faculty(args.faculty, limit=args.limit)
        print_table(rows, ["id", "name", "year", "country", "distance"])
    elif args.command == "path":
        rows = graph.path_to_ancestor(args.faculty, args.ancestor)
        print_table(rows, ["id", "name", "year", "country"])
    elif args.command == "groups":
        rows = graph.group_summary()
        print_table(
            rows,
            [
                "id",
                "label",
                "faculty_count",
                "lineage_people",
                "lineage_edges",
                "shared_ancestors",
            ],
        )
    elif args.command == "group-faculty":
        rows = graph.faculty_for_group(args.group)
        print_table(rows, ["osu_name", "mgp_id", "title", "filed_in"])
    elif args.command == "group-common":
        rows = graph.common_ancestors_for_group(
            args.group,
            min_faculty=args.min_faculty,
            limit=args.limit,
        )
        print_table(
            rows,
            [
                "id",
                "name",
                "year",
                "country",
                "matched_faculty_count",
                "max_distance",
                "total_distance",
            ],
        )


if __name__ == "__main__":
    main()
