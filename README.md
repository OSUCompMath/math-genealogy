# Math Genealogy Graph Exporter

Export advisor ancestry graphs from the
[Mathematics Genealogy Project](https://www.genealogy.math.ndsu.nodak.edu/) by
passing one or more Math Genealogy IDs.

The main command is `export_graph.py`. If an ID has not been scraped yet, the
script scrapes it first, caches the CSV under `scrapes/`, and then exports the
combined graph. When an automatic scrape runs, progress is printed by default.

## Files

```text
export_graph.py   # Main ID-to-graph export command
mgp_ancestors.py  # Scraping helper used by export_graph.py
README.md         # Usage instructions
```

## Setup

```bash
conda create -n webscraping python=3.12 -y
conda activate webscraping
conda install -c conda-forge requests beautifulsoup4 lxml tqdm graphviz -y
```

Graphviz provides the `dot` command used to render `.dot` graph files as images.

## Quick Start

Scrape one or more Math Genealogy IDs:

```bash
conda run --no-capture-output -n webscraping python mgp_ancestors.py 123 789 234
```

This writes one cached CSV per ID under `scrapes/`.

Export any combination of scraped IDs:

```bash
conda run -n webscraping python export_graph.py 123 789 \
  --out graph.dot
```

Render it with Graphviz:

```bash
dot -Tpng graph.dot -o graph.png
```

Nodes show names, plus dissertation year and country when available. Arrows point
from advisor to advisee. For one starting ID, orange nodes and edges highlight
all tied longest advisor paths. For multiple starting IDs, green nodes highlight
common ancestors shared by at least two starting IDs. Requested starting IDs are
placed near the bottom of the rendered graph.

## Scrape IDs

```bash
conda run --no-capture-output -n webscraping python mgp_ancestors.py 123 789 234
```

This automatically creates `scrapes/` and writes:

```text
scrapes/mgp_ancestors_123.csv
scrapes/mgp_ancestors_123.txt
scrapes/mgp_ancestors_789.csv
scrapes/mgp_ancestors_789.txt
scrapes/mgp_ancestors_234.csv
scrapes/mgp_ancestors_234.txt
```

The default request delay is `0.5` seconds.

Custom output paths are optional. If provided, pass one path per input ID:

```bash
conda run --no-capture-output -n webscraping python mgp_ancestors.py 123 789 \
  --out first.csv second.csv \
  --txt first.txt second.txt
```

## Export Graphs

```bash
conda run -n webscraping python export_graph.py 123 789 \
  --out graph.dot
```

You can call `export_graph.py` with any combination of IDs:

```bash
conda run -n webscraping python export_graph.py 123 234 \
  --out graph_123_234.dot

conda run -n webscraping python export_graph.py 123 789 234 \
  --out graph_all.dot
```

The output graph merges all scraped nodes and edges. Shared ancestors appear
once, with distance metadata for each starting ID that reaches them.

Graph node labels show the advisor name, dissertation year, and country when the
Mathematics Genealogy Project provides them.

For one starting ID, all tied longest advisor paths are highlighted in orange.
For multiple starting IDs, common ancestors shared by at least two starting IDs
are highlighted in green. Requested starting IDs are placed near the bottom of
the rendered graph.

## Render With Graphviz

```bash
dot -Tpng graph.dot -o graph.png
```

If you change the ID combination or rerun scraping, regenerate the `.dot` file
with `export_graph.py` before rendering a new image.

Other useful formats:

```bash
dot -Tpdf graph.dot -o graph.pdf
dot -Tsvg graph.dot -o graph.svg
```

## Export JSON

For programmatic analysis:

```bash
conda run -n webscraping python export_graph.py 123 789 234 \
  --format json \
  --out graph.json
```

## Cache Behavior

Per-ID scrape CSVs are cached here:

```text
scrapes/mgp_ancestors_<ID>.csv
```

If a cached CSV exists, `export_graph.py` reuses it and does not scrape again.

## Scraping Options

Use a polite delay between requests:

```bash
conda run -n webscraping python export_graph.py 123 \
  --delay 0.5 \
  --out graph.dot
```

Limit traversal depth for testing:

```bash
conda run -n webscraping python export_graph.py 123 \
  --max-depth 3 \
  --out graph.dot
```

Hide scrape progress output:

```bash
conda run -n webscraping python export_graph.py 123 \
  --quiet \
  --out graph.dot
```

## Notes

The Mathematics Genealogy Project includes both modern doctoral-advisor
relationships and older historical mentor or intellectual-lineage relationships.
For very old ancestors, edges should not always be interpreted as modern PhD
supervision.

The scraper is intentionally single-threaded and supports configurable delay.
Please avoid aggressive scraping.
