#!/usr/bin/env python3
"""
Attach high-confidence English Wikipedia links to static MGP graph people.

Matching is intentionally strict: a person is enriched only when Wikidata has
exactly one item with the same Mathematics Genealogy Project ID (property P549)
and that item has an English Wikipedia sitelink. No fuzzy name matching is used.
"""

from __future__ import annotations

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

import requests


WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_PROPERTY = "P549"
USER_AGENT = "OSUCompMath-MathGenealogy/1.0 (high-confidence MGP Wikipedia enrichment)"


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[index : index + size] for index in range(0, len(values), size)]


def wikipedia_title_from_url(url: str) -> str:
    path = urlparse(url).path
    title = path.rsplit("/", 1)[-1]
    return unquote(title).replace("_", " ")


def query_wikidata_for_ids(mgp_ids: list[str], delay: float, batch_size: int, retries: int) -> dict[str, list[dict[str, str]]]:
    matches: dict[str, list[dict[str, str]]] = defaultdict(list)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    for batch in chunks(mgp_ids, batch_size):
        values = " ".join(json.dumps(value) for value in batch)
        query = f"""
        SELECT ?mgp ?item ?article WHERE {{
          VALUES ?mgp {{ {values} }}
          ?item wdt:{WIKIDATA_PROPERTY} ?mgp.
          OPTIONAL {{
            ?article schema:about ?item;
                     schema:isPartOf <https://en.wikipedia.org/>.
          }}
        }}
        """
        for attempt in range(retries + 1):
            response = session.get(
                WIKIDATA_SPARQL_URL,
                params={"query": query, "format": "json"},
                timeout=60,
            )
            if response.status_code < 500:
                response.raise_for_status()
                break
            if attempt >= retries:
                response.raise_for_status()
            time.sleep(delay * (attempt + 2))
        payload = response.json()
        for row in payload["results"]["bindings"]:
            mgp_id = row["mgp"]["value"]
            item_url = row["item"]["value"]
            article_url = row.get("article", {}).get("value", "")
            matches[mgp_id].append(
                {
                    "wikidata_id": item_url.rsplit("/", 1)[-1],
                    "wikipedia_url": article_url,
                    "wikipedia_title": wikipedia_title_from_url(article_url) if article_url else "",
                }
            )
        time.sleep(delay)

    return matches


def load_or_query_matches(
    mgp_ids: list[str],
    cache_path: Path | None,
    delay: float,
    batch_size: int,
    retries: int,
) -> dict[str, list[dict[str, str]]]:
    if cache_path and cache_path.exists():
        return json.loads(cache_path.read_text(encoding="utf-8"))

    matches = query_wikidata_for_ids(mgp_ids, delay, batch_size, retries)
    serializable = {key: value for key, value in sorted(matches.items(), key=lambda item: int(item[0]))}
    if cache_path:
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(serializable, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return serializable


def unique_english_wikipedia_match(rows: list[dict[str, str]]) -> dict[str, str] | None:
    item_ids = {row["wikidata_id"] for row in rows}
    article_rows = [row for row in rows if row.get("wikipedia_url")]
    article_urls = {row["wikipedia_url"] for row in article_rows}
    if len(item_ids) != 1 or len(article_urls) != 1:
        return None
    return article_rows[0]


def enrich_payload(payload: dict[str, Any], matches: dict[str, list[dict[str, str]]]) -> tuple[int, int]:
    enriched = 0
    skipped_ambiguous = 0
    for person in payload["people"]:
        for key in ("wikidata_id", "wikipedia_url", "wikipedia_title"):
            person.pop(key, None)
        match = unique_english_wikipedia_match(matches.get(str(person["id"]), []))
        if not match:
            if matches.get(str(person["id"])):
                skipped_ambiguous += 1
            continue
        person["wikidata_id"] = match["wikidata_id"]
        person["wikipedia_url"] = match["wikipedia_url"]
        person["wikipedia_title"] = match["wikipedia_title"]
        enriched += 1

    payload.setdefault("metadata", {})
    payload["metadata"]["wikipedia_match_method"] = "Wikidata P549 exact MGP ID with unique English Wikipedia sitelink"
    payload["metadata"]["wikipedia_match_count"] = enriched
    payload["metadata"]["wikipedia_ambiguous_or_no_article_count"] = len(payload["people"]) - enriched
    return enriched, skipped_ambiguous


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/osu_mgp_graph.json", help="Static graph JSON to enrich")
    parser.add_argument("--out", default="", help="Output path. Defaults to overwriting --data.")
    parser.add_argument("--cache", default=".cache/wikidata_mgp_wikipedia.json", help="Raw Wikidata match cache")
    parser.add_argument("--batch-size", type=int, default=40, help="MGP IDs per Wikidata SPARQL query")
    parser.add_argument("--delay", type=float, default=0.2, help="Delay between Wikidata query batches")
    parser.add_argument("--retries", type=int, default=3, help="Retries for transient Wikidata 5xx responses")
    args = parser.parse_args()

    data_path = Path(args.data)
    out_path = Path(args.out) if args.out else data_path
    cache_path = Path(args.cache) if args.cache else None

    payload = json.loads(data_path.read_text(encoding="utf-8"))
    mgp_ids = sorted({str(person["id"]) for person in payload["people"]}, key=int)
    matches = load_or_query_matches(mgp_ids, cache_path, args.delay, args.batch_size, args.retries)
    enriched, skipped_ambiguous = enrich_payload(payload, matches)

    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {out_path}: {enriched} Wikipedia links; "
        f"{skipped_ambiguous} ambiguous/non-article Wikidata matches skipped"
    )


if __name__ == "__main__":
    main()
