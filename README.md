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

## Ohio State Static Faculty Graph

The Ohio State faculty roster lives in `faculty_osu.txt`. It includes the
regular Chair/Faculty and Faculty sections from the Ohio State math people page,
their matched MGP IDs, and a verification status comparing MGP degree
school/year against the Ohio State profile when that profile lists the PhD.
The companion `faculty_areas_osu.txt` file stores static Ohio State profile
area metadata. Graph groups use the actual OSU `Filed In` category names from
faculty profiles.

Build the static shared graph:

```bash
conda run -n webscraping python build_static_data.py
```

This writes `data/osu_mgp_graph.json`. The builder uses a shared per-person
cache under `.cache/mgp_people`, so overlapping faculty lineages are fetched and
stored once rather than re-scraped separately for every faculty member.

The JSON is structured for efficient GUI queries:

- one shared `people` table for all MGP records
- `edges` as advisor-to-student index pairs
- `faculty_mask` bitmasks on people for fast common-ancestor filtering
- `ancestors_by_faculty` and `distances_by_person` indexes for ranking and paths

Example local queries:

```bash
python3 graph_queries.py common "Anna Yesypenko" "Thomas O'Leary-Roseberry"
python3 graph_queries.py ancestors "David Anderson" --limit 10
python3 graph_queries.py path "Anna Yesypenko" "Ferdinand Georg Frobenius"
python3 graph_queries.py groups
python3 graph_queries.py group-faculty applied-mathematics
python3 graph_queries.py group-common applied-mathematics --min-faculty 5 --limit 10
```

## Static GUI

The browser app under `web/` reads the static JSON file and performs all
filtering in the browser. It does not query Ohio State or MGP at runtime.
The Areas panel includes an All Faculty option, and the faculty checklist can
be used to make custom cross-area selections. The graph canvas supports
zooming, panning, width/full/faculty fitting, a visible-ancestor slider, and a
small overview map for jumping around large views. The graph is laid out
vertically, with older ancestors above and selected Ohio State faculty along the
bottom, so large subsets read more like a genealogy tree. Faculty and highlighted
ancestor labels are placed in collision-checked lanes. The GUI layout is
computed directly in the browser from the static JSON rather than from a
pre-rendered dot file.

Run a local preview from the repository root:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8000/web/
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
