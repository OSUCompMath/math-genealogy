#!/usr/bin/env python3
"""
Extract OSU faculty area metadata from saved Ohio State profile pages.

This is a helper for refreshing faculty_areas_osu.txt. The static graph builder
reads that TSV, so the GUI does not need to query Ohio State at runtime.
"""

from __future__ import annotations

import argparse
import re
import unicodedata
from pathlib import Path

from bs4 import BeautifulSoup


AREA_COLUMNS = [
    "osu_name",
    "profile_url",
    "title",
    "filed_in",
    "expertise",
    "area_ids",
    "note",
]


def ascii_clean(value: str) -> str:
    replacements = {
        "\u2010": "-",
        "\u2011": "-",
        "\u2012": "-",
        "\u2013": "-",
        "\u2014": "-",
        "\u2212": "-",
        "\u00a0": " ",
        "\u2202": "d",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return " ".join(value.split())


def slug_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_")


def slug_area(value: str) -> str:
    value = ascii_clean(value).lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def read_faculty_names(path: Path) -> list[str]:
    names = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) >= 2 and parts[1] != "MISSING":
            names.append(parts[0])
        elif len(parts) >= 1 and parts[0] in {"Ian Hamilton", "Kenneth Ng"}:
            names.append(parts[0])
    return names


def profile_url_map(people_page: Path | None) -> dict[str, str]:
    if people_page is None or not people_page.exists():
        return {}
    soup = BeautifulSoup(people_page.read_text(encoding="utf-8", errors="replace"), "html.parser")
    urls: dict[str, str] = {}
    for person in soup.select(".bux-person"):
        name_el = person.select_one(".bux-person__name")
        if name_el is None:
            continue
        link = name_el.find("a", href=True)
        if link is None:
            continue
        name = " ".join(name_el.get_text(" ", strip=True).split())
        href = link["href"]
        urls[name] = href if href.startswith("http") else f"https://math.osu.edu{href}"
    urls["Niles Johnson"] = "https://earthworks.osu.edu/people/njohnson"
    return urls


def parse_profile(path: Path) -> tuple[str, list[str], list[str]]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    title_el = soup.select_one(".field--name-field-your-title .field--item")
    title = ascii_clean(title_el.get_text(" ", strip=True)) if title_el else ""

    expertise = [
        ascii_clean(item.get_text(" ", strip=True))
        for item in soup.select(".user-profile__areas-of-expertise li")
    ]

    filed_in = []
    for item in soup.select(".taxonomy-tags__user .bux-tag__link__text"):
        text = ascii_clean(item.get_text(" ", strip=True))
        if text and text not in {"Columbus", "Lima", "Mansfield", "Marion", "Newark"}:
            filed_in.append(text)

    return title, sorted(set(filed_in)), sorted(set(expertise))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--faculty", default="faculty_osu.txt")
    parser.add_argument("--people-page", default="/private/tmp/osu_people.html")
    parser.add_argument("--profile-dir", default="/private/tmp/osu_profiles_all")
    parser.add_argument("--out", default="faculty_areas_osu.txt")
    args = parser.parse_args()

    faculty_names = read_faculty_names(Path(args.faculty))
    urls = profile_url_map(Path(args.people_page))
    profile_dir = Path(args.profile_dir)
    rows = []

    for name in faculty_names:
        note = ""
        if name == "Niles Johnson":
            title = "Associate Professor of Mathematics"
            filed_in = ["Algebraic & Geometric Topology", "Mathematical Education"]
            expertise = ["Algebraic topology", "Mathematics Education", "Mathematical visualization"]
            note = "Area metadata from OSU Earthworks profile."
        else:
            path = profile_dir / f"{slug_name(name)}.html"
            if path.exists() and path.stat().st_size > 100:
                title, filed_in, expertise = parse_profile(path)
            else:
                title, filed_in, expertise = "", [], []
                note = "OSU profile page unavailable in local profile cache."

        rows.append(
            {
                "osu_name": name,
                "profile_url": urls.get(name, ""),
                "title": title,
                "filed_in": "; ".join(filed_in),
                "expertise": "; ".join(expertise),
                "area_ids": "; ".join(slug_area(area) for area in filed_in),
                "note": note,
            }
        )

    out_path = Path(args.out)
    lines = [
        "# Ohio State Mathematics faculty area metadata",
        "# OSU faculty source: https://math.osu.edu/people",
        "# Columns: " + "\t".join(AREA_COLUMNS),
    ]
    for row in rows:
        lines.append("\t".join(row[column] for column in AREA_COLUMNS))
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out_path}: {len(rows)} rows")


if __name__ == "__main__":
    main()
