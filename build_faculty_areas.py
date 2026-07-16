#!/usr/bin/env python3
"""
Extract OSU faculty area metadata from saved Ohio State profile pages.

This is a helper for refreshing faculty_areas_osu.txt. The static graph builder
reads that TSV, so the GUI does not need to query Ohio State at runtime.
"""

from __future__ import annotations

import argparse
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


AREA_COLUMNS = [
    "osu_name",
    "osu_profile_url",
    "professional_website_url",
    "website_url",
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


def read_existing_rows(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}

    columns = AREA_COLUMNS
    rows: dict[str, dict[str, str]] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        if line.startswith("# Columns:"):
            columns = [part.strip() for part in line.partition(":")[2].split("\t")]
            continue
        if line.startswith("#"):
            continue

        parts = line.split("\t")
        if len(parts) < len(columns):
            parts.extend([""] * (len(columns) - len(parts)))
        raw = dict(zip(columns, parts, strict=False))
        name = raw.get("osu_name", "")
        if not name:
            continue
        if "osu_profile_url" not in raw and raw.get("profile_url"):
            raw["osu_profile_url"] = raw["profile_url"]
        raw.setdefault("professional_website_url", "")
        raw.setdefault("website_url", raw.get("professional_website_url") or raw.get("osu_profile_url", ""))
        rows[name] = raw
    return rows


def professional_website_from_soup(soup: BeautifulSoup, base_url: str) -> str:
    for link in soup.find_all("a", href=True):
        text = " ".join(link.get_text(" ", strip=True).split()).lower()
        if text == "professional website":
            return urljoin(base_url, link["href"])
    return ""


def parse_profile(path: Path, profile_url: str = "") -> tuple[str, list[str], list[str], str]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    title_el = soup.select_one(".field--name-field-your-title .field--item")
    title = ascii_clean(title_el.get_text(" ", strip=True)) if title_el else ""
    professional_website_url = professional_website_from_soup(soup, profile_url)

    expertise = [
        ascii_clean(item.get_text(" ", strip=True))
        for item in soup.select(".user-profile__areas-of-expertise li")
    ]

    filed_in = []
    for item in soup.select(".taxonomy-tags__user .bux-tag__link__text"):
        text = ascii_clean(item.get_text(" ", strip=True))
        if text and text not in {"Columbus", "Lima", "Mansfield", "Marion", "Newark"}:
            filed_in.append(text)

    return title, sorted(set(filed_in)), sorted(set(expertise)), professional_website_url


def fetch_profile(session: requests.Session, url: str, path: Path, delay: float) -> bool:
    if not url:
        return False
    time.sleep(delay)
    response = session.get(url, timeout=30)
    response.raise_for_status()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(response.text, encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--faculty", default="faculty_osu.txt")
    parser.add_argument("--people-page", default="/private/tmp/osu_people.html")
    parser.add_argument("--profile-dir", default="/private/tmp/osu_profiles_all")
    parser.add_argument("--out", default="faculty_areas_osu.txt")
    parser.add_argument("--fetch-missing", action="store_true")
    parser.add_argument("--fetch-delay", type=float, default=0.1)
    args = parser.parse_args()

    faculty_names = read_faculty_names(Path(args.faculty))
    existing_rows = read_existing_rows(Path(args.out))
    urls = profile_url_map(Path(args.people_page))
    profile_dir = Path(args.profile_dir)
    session = requests.Session()
    session.headers.update({"User-Agent": "Ohio State Math genealogy static data refresh"})
    rows = []

    for name in faculty_names:
        existing = existing_rows.get(name, {})
        osu_profile_url = urls.get(name) or existing.get("osu_profile_url", "")
        note = ""
        if name == "Niles Johnson":
            osu_profile_url = "https://earthworks.osu.edu/people/njohnson"
            title = "Associate Professor of Mathematics"
            filed_in = ["Algebraic & Geometric Topology", "Mathematical Education"]
            expertise = ["Algebraic topology", "Mathematics Education", "Mathematical visualization"]
            professional_website_url = existing.get("professional_website_url", "")
            note = "Area metadata from OSU Earthworks profile."
        else:
            path = profile_dir / f"{slug_name(name)}.html"
            if (
                args.fetch_missing
                and osu_profile_url
                and (not path.exists() or path.stat().st_size <= 100)
            ):
                fetch_profile(session, osu_profile_url, path, args.fetch_delay)
            if path.exists() and path.stat().st_size > 100:
                title, filed_in, expertise, professional_website_url = parse_profile(path, osu_profile_url)
            else:
                title = existing.get("title", "")
                filed_in = [part.strip() for part in existing.get("filed_in", "").split(";") if part.strip()]
                expertise = [part.strip() for part in existing.get("expertise", "").split(";") if part.strip()]
                professional_website_url = existing.get("professional_website_url", "")
                note = "OSU profile page unavailable in local profile cache."

        website_url = professional_website_url or osu_profile_url
        rows.append(
            {
                "osu_name": name,
                "osu_profile_url": osu_profile_url,
                "professional_website_url": professional_website_url,
                "website_url": website_url,
                "title": title,
                "filed_in": "; ".join(filed_in),
                "expertise": "; ".join(expertise),
                "area_ids": "; ".join(slug_area(area) for area in filed_in),
                "note": note or existing.get("note", ""),
            }
        )

    out_path = Path(args.out)
    lines = [
        "# Ohio State Mathematics faculty area metadata",
        "# OSU faculty source: https://math.osu.edu/people",
        "# Columns: " + "\t".join(AREA_COLUMNS),
    ]
    for row in rows:
        lines.append("\t".join(row[column] for column in AREA_COLUMNS).rstrip("\t"))
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {out_path}: {len(rows)} rows")


if __name__ == "__main__":
    main()
