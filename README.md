# Math Genealogy Graph Exporter

Build advisor-ancestry graphs from the
[Mathematics Genealogy Project](https://www.genealogy.math.ndsu.nodak.edu/).
Pulling someone's ancestor graph is the core algorithmic piece. Each scrape
lands in its own self-contained folder under `scrapes/`, including a raw HTML
cache, so the data can be re-parsed and re-rendered later without going back
to the network.

## Files

```text
mgp_ancestors.py  # Scraper: BFS over advisor links, writes per-person folder
export_graph.py   # Reader / merger / renderer: turns scrapes into DOT or JSON
README.md         # This file
```

## Setup

```bash
conda create -n webscraping python=3.12 -y
conda activate webscraping
conda install -c conda-forge requests beautifulsoup4 lxml tqdm graphviz -y
```

`graphviz` provides the `dot` command used to render `.dot` graph files into
images. On macOS you can also install it system-wide with `brew install
graphviz`.

## Quick Start

The shortest path from an MGP ID to a rendered image is one command:

```bash
conda run --no-capture-output -n webscraping \
  python export_graph.py 345877 \
  --serif \
  --render png \
  --out thomas.dot
```

That single invocation will:

1. Scrape MGP ID `345877` (Thomas O'Leary-Roseberry) into
   `scrapes/thomas_oleary_roseberry_345877/`, including raw `html/<id>.html`
   for every page fetched.
2. Write `thomas.dot` with serif (Georgia) typography.
3. Run `dot -Tpng thomas.dot -o thomas.png` for you.

If `345877` was already scraped, no network calls are made — the local cache
is reused.

## On-disk layout

Each starting ID lands in its own folder:

```text
scrapes/<slug>_<id>/
    ancestors.csv      # parsed people, one row per ancestor
    ancestors.txt      # readable distance + name listing
    metadata.json      # start_id, scraped name, scrape time, person count, ...
    html/              # raw HTML for every page fetched
        <id>.html
        ...
```

`<slug>` defaults to the scraped person's name slugified
(`anna_yesypenko_345879/`, `thomas_oleary_roseberry_345877/`). Override it
with `--label`. Folder lookup is by `_<id>` suffix or by the `start_id`
field in `metadata.json`, so renaming the folder by hand still works.

CSV columns:

```text
distance, id, name, year, university, country, advisors, url
```

## Two-script workflow

You can run scraping and exporting separately if you prefer.

Scrape one or more IDs:

```bash
conda run --no-capture-output -n webscraping python mgp_ancestors.py 345877 113092
```

Export an existing scrape (or auto-scrape if the folder is missing):

```bash
conda run -n webscraping python export_graph.py 345877 113092 \
  --out combined.dot
```

The output graph merges all scraped nodes and edges. Shared ancestors appear
once, with distance metadata for each starting ID that reaches them.

JSON output for programmatic analysis:

```bash
conda run -n webscraping python export_graph.py 345877 113092 \
  --format json \
  --out combined.json
```

## Graph appearance

Node labels show the advisor name, dissertation year, and the granting
university when MGP provides one. If the university is unknown, the country
is used as a fallback; if neither is known, only the year (or just the name)
is shown. Arrows point from advisor to advisee.

Highlights:

- One starting ID — all tied longest advisor paths are highlighted in orange.
- Multiple starting IDs — common ancestors reached from at least two starts
  are highlighted in green.

Requested starting IDs are placed near the bottom of the rendered graph.

### Fonts

Default font is Helvetica. To switch to a serif face:

```bash
python export_graph.py 345877 --serif --out graph.dot          # Georgia
python export_graph.py 345877 --font "Times-Roman" --out graph.dot
```

`--font NAME` accepts any Graphviz-known font name and overrides `--serif`.

### Rendering

Easiest — let `export_graph.py` invoke Graphviz:

```bash
python export_graph.py 345877 --render png --out graph.dot
```

`--render` accepts `png`, `pdf`, or `svg`. The script fails gracefully (with
the manual command you can run yourself) if `dot` isn't on `PATH`.

Or render manually:

```bash
dot -Tpng graph.dot -o graph.png
dot -Tpdf graph.dot -o graph.pdf
dot -Tsvg graph.dot -o graph.svg
```

### Unicode in labels

MGP names occasionally include typographic punctuation (U+2010 hyphen,
U+2018-201F curly quotes), Arabic transliteration modifier letters
(U+02BB-02BF), or Latin Extended Additional characters (U+1E00-U+1EFF — for
example the dot-below in *al-Ṭūsī* or *al-Mufaḍḍal*). Graphviz's default
fonts (Helvetica, Georgia, Times-Roman) don't ship glyphs for those ranges
and would render `[?]` boxes.

`export_graph.py` quietly normalizes those characters in the rendered DOT
labels: typographic punctuation is mapped to its plain-Latin equivalent, and
characters in the Latin Extended Additional block are decomposed and stripped
of their combining marks (so *Ṭ* renders as *T*, *ḍ* as *d*, etc.). The
underlying `ancestors.csv`, `metadata.json`, and DOT tooltips are left
unchanged — only the visible label is normalized.

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

Optionally enrich the static graph with high-confidence English Wikipedia
matches:

```bash
python3 enrich_wikipedia_links.py
```

This only fills a Wikipedia URL when Wikidata has a unique Mathematics
Genealogy Project ID (`P549`) match with an English Wikipedia sitelink. It does
not use fuzzy name matching.

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

## Cache behavior

The on-disk HTML cache makes the workflow incremental and resilient:

- **Repeated runs are free.** Re-running a scrape with the same flags reads
  every page from `html/<id>.html` and makes zero network calls.
- **Re-parsing without re-fetching.** If the parser changes (a bug fix or a
  new field), pass `--reparse` to `export_graph.py` to regenerate
  `ancestors.csv` from cached HTML — no network I/O:

  ```bash
  python export_graph.py 345877 --reparse --serif --render png --out thomas.dot
  ```

- **Forced re-fetch.** Pass `--refresh` to ignore the on-disk HTML and re-hit
  MGP for every page. Useful if MGP records have been updated upstream.

If MGP starts blocking requests, your existing per-person folders still
contain everything needed to re-render and re-analyze.

## Scraping options

The same set of options is accepted by both scripts (where they apply):

| Flag                | Effect                                                         |
| ------------------- | -------------------------------------------------------------- |
| `--out-dir DIR`     | Base directory for per-person folders. Default `scrapes/`.     |
| `--label LABEL ...` | Override the folder slug. One label, or one per ID.            |
| `--max-depth N`     | Cap BFS depth. Useful for quick test runs.                     |
| `--delay SECONDS`   | Delay between MGP requests. Default `0.5`.                     |
| `--quiet`           | Suppress the tqdm progress bar.                                |
| `--refresh`         | Re-fetch every page, ignoring the HTML cache.                  |
| `--reparse`         | (`export_graph.py` only) re-parse cached HTML, no network.     |
| `--serif`           | (`export_graph.py` only) use a serif font (Georgia).           |
| `--font NAME`       | (`export_graph.py` only) explicit font; overrides `--serif`.   |
| `--render FMT`      | (`export_graph.py` only) also run `dot -T<fmt>`. png/pdf/svg.  |
| `--format dot,json` | (`export_graph.py` only) graph output format. Default `dot`.   |

## Notes

The Mathematics Genealogy Project includes both modern doctoral-advisor
relationships and older historical mentor or intellectual-lineage
relationships. For very old ancestors, edges should not always be interpreted
as modern PhD supervision.

The scraper is intentionally single-threaded and uses a configurable polite
delay between requests. Please avoid aggressive scraping.
