# Math Genealogy Ancestor Scraper

This repository contains a small Python script, `mgp_ancestors.py`, for traversing the advisor graph of the [Mathematics Genealogy Project](https://www.genealogy.math.ndsu.nodak.edu/) upward from a given Math Genealogy ID.

Given a starting person, the script crawls their advisors, then their advisors' advisors, and so on. It records all discovered antecedents, their Math Genealogy IDs, names, shortest advisor-graph distance from the starting person, and profile URLs.

## Files

```text
mgp_ancestors.py   # Main scraping/traversal script
README.md          # Usage instructions
```

## Create the conda environment

```bash
conda create -n webscraping python=3.12 -y
conda activate webscraping
conda install -c conda-forge requests beautifulsoup4 lxml tqdm -y
```

## Basic usage

Run the script with a Math Genealogy ID:

```bash
python mgp_ancestors.py 123456
```

Replace `123456` with the Math Genealogy ID of the person whose ancestors you want to traverse.

By default, the script writes:

```text
mgp_ancestors.csv
mgp_ancestors.txt
```

## Recommended usage

Use a polite delay between requests:

```bash
python mgp_ancestors.py 123456 \
  --out ancestors.csv \
  --txt ancestors.txt \
  --delay 0.5
```

## Limit traversal depth

To stop after a fixed number of advisor generations:

```bash
python mgp_ancestors.py 123456 --max-depth 10
```

This is useful for testing or for avoiding a very deep historical traversal.

## Output format

The CSV file contains columns:

```text
distance,id,name,advisors,url
```

where:

- `distance` is the shortest advisor-graph distance from the starting person,
- `id` is the Math Genealogy ID,
- `name` is the person's name,
- `advisors` lists the person's advisors found by the script,
- `url` is the Math Genealogy profile URL.

Example rows may look like:

```text
0,123456,Starting Person,...
1,234567,Advisor One,...
1,345678,Advisor Two,...
```

The text file gives a simpler readable list:

```text
 0    123456  Starting Person
 1    234567  Advisor One
 1    345678  Advisor Two
```

## Progress bar

The script uses `tqdm` to show progress while crawling. The progress bar displays:

- current Math Genealogy ID,
- current depth,
- queue size,
- number of discovered people,
- number of failed pages.

Disable the progress bar with:

```bash
python mgp_ancestors.py 123456 --quiet
```

## Notes and cautions

The Mathematics Genealogy Project includes both modern doctoral-advisor relationships and older historical mentor/intellectual-lineage relationships. For very old ancestors, the edges should not be interpreted as modern PhD supervision.

The script is intentionally single-threaded and includes a configurable delay between requests. Please avoid aggressive scraping.

## Troubleshooting

### `ModuleNotFoundError`

Make sure the conda environment is active:

```bash
conda activate webscraping
```

Then reinstall the dependencies:

```bash
conda install -c conda-forge requests beautifulsoup4 lxml tqdm -y
```

### Pages fail to fetch

Try increasing the delay:

```bash
python mgp_ancestors.py 123456 --delay 1.0
```

### I only want a quick test

Use a small maximum depth:

```bash
python mgp_ancestors.py 123456 --max-depth 3
```