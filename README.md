# Tennis Analytics Dashboard

Portfolio project: Python data pipeline + React dashboard analyzing 25+ years
of ATP/WTA tennis data from Jeff Sackmann's official match results archive
(mirrored at [Aneeshers/tennis-sackmann-archive](https://github.com/Aneeshers/tennis-sackmann-archive)).

**[Live demo](https://tennis-dashboard-beige.vercel.app/)**

## Structure

```
scripts/                                Python ETL pipeline
scripts/tennis-sackmann-archive-main/   (gitignored) local mirror of the Sackmann archive
data/                                   (gitignored) intermediate CSVs (atp_matches_raw.csv, current rankings)
output/                                 (gitignored) generated CSVs + tennisData.json
tennis-frontend/                        React + Vite + Recharts dashboard
tennis-frontend/public/tennisData.json  the dataset the frontend fetches at runtime -- the ONE
                                         exception committed despite the gitignore rule above,
                                         since the deployed site has no pipeline to generate it
```

## Setup from scratch (new machine)

### 1. Get the Sackmann archive
This repo does NOT include the raw match data (it's a separate public dataset,
not something to bundle here). Clone it separately into `scripts/`:
```bash
cd scripts
git clone https://github.com/Aneeshers/tennis-sackmann-archive.git tennis-sackmann-archive-main
```

### 2. Run the Python pipeline
```bash
cd scripts
pip install pandas numpy

python 01_fetch_atp_matches.py --start-year 2000 --end-year 2026 --min-matches 300
python 02_compute_metrics.py
python 03_compute_h2h.py
python 04_compute_match_load.py
python 05_export_dashboard_json.py --min-matches 300
```
The last script writes `output/tennisData.json` AND copies it directly into
`tennis-frontend/public/tennisData.json` -- no manual copying needed. Run the
whole sequence in order, and let each step finish before touching the
terminal -- some steps (Elo, the H2H join) process hundreds of thousands of
matches and can take a minute or two.

`--min-matches` controls how many players make the cut (career matches,
either tour): a match is kept if at least one of the two players involved
has that many. Lower = more (obscure) players and a bigger `tennisData.json`;
higher = fewer, more recognizable names and a lighter file. 300 keeps the
production build under ~50 MB; for local exploration with more depth, 100-150
is a reasonable middle ground.

### 3. Run the frontend
```bash
cd tennis-frontend
npm install
npm run dev
```
Open http://localhost:5173

## Pipeline scripts

| Script | What it does |
|---|---|
| `01_fetch_atp_matches.py` | Reads the local Sackmann archive mirror (official match-level results + serve stats, ATP Tour level), consolidates into `data/atp_matches_raw.csv`, and applies the `--min-matches` player filter at the source so every downstream script works on the trimmed dataset |
| `02_compute_metrics.py` | Serve/return stats, dominance ratio, Elo ratings (vectorized with `itertuples`), win rate by surface and by specific tournament (career + by-year), tournament titles won, tour (ATP/WTA) per player |
| `03_compute_h2h.py` | Head-to-head records between player pairs (overall, by surface, by year), each pair's longest match on record, and Grand Slam finals contested between them (with per-final detail: tournament, year, winner) |
| `04_compute_match_load.py` | Matches per week/quarter, Grand Slam results per edition (round reached, title), win rate by rest days |
| `05_export_dashboard_json.py` | Applies the same `--min-matches` filter as a safety net, joins every CSV into a single `output/tennisData.json` (and copies it to `tennis-frontend/public/`) -- also downsamples Elo history and match-load history to one point per player per quarter (the frontend charts never show finer detail than that anyway), and drops fields no component actually uses, to keep the file light |
| `check_gs_coverage.py` | Diagnostic: compares detected Grand Slam titles per player against known real totals, to catch pipeline/data issues |

## Dashboard tabs

1. **Player Overview** -- Elo rating & history, win rate by surface, career-wide "surface trend" breakpoint detector, for one selected player (searchable combobox, sortable by current ranking)
2. **Surface Performance** -- cross-player rankings by surface, all-court vs. specialist index, ranking-status filter (currently ranked / retired-but-peaked-top-10 / both)
3. **Serve & Return** -- serve/return metric rankings by year range, aces vs. double faults, same ranking-status filter
4. **Head-to-Head** -- direct record between any two current top-50 players (per tour): total meetings, wins by surface, longest match, Grand Slam finals contested (with per-final detail), and an auto-generated "what separates them" summary for pairs with a long enough history
5. **Match Load** -- matches per quarter (Grand Slam vs. other events), Grand Slam leaderboard by titles, both filterable by date range and ranking status
6. **Insights & Rankings** -- Elo leaderboard, current-top-10 titles won by tournament (color-coded), surface specialists (all-court vs. specialized, limited to the current top 20), and a handful of notable findings computed live (peak Elo ever, biggest rivalry, longest match on record, most Grand Slam finals in a single rivalry)
7. **Conclusions** -- data-driven comparison of the current top 10 vs. the next tier (#11-30, either tour): which dimensions actually separate them (titles, Grand Slam win rate, match volume) and which don't (surface versatility, Elo stability, how often they play each other) -- computed live, not written by hand, plus cited external research and an early-career Elo trajectory comparison across five generations of #1s (Federer to Alcaraz/Sinner)

## Data notes

- Source is Jeff Sackmann's official ATP/WTA match results archive, **ATP Tour
  level only** (Grand Slams, Masters, tour-level events) -- Challengers and
  Futures aren't included, so very early-career matches (before a player
  reached the main tour) may be missing from their charted history.
- Elo ratings are custom-calculated (K=32, base 1500), not the official
  ATP/WTA ranking -- shown alongside the real current ranking, not instead
  of it.
- "Currently ranked top 50" and "retired top 10" (used as eligibility filters
  in a few tabs) are two separate signals: an official ranking today, vs. the
  best official ranking a player ever reached in their career. A player can
  qualify by either, which is how retired greats without a current ranking
  (Federer, Sampras, etc.) still show up where relevant.
- A handful of known data-quality issues in the source archive are guarded
  against explicitly -- e.g. a corrupted "2,475-minute match" (41 hours,
  physically impossible) is capped out via a sanity limit on match duration,
  and a tournament-name casing inconsistency in some years of the archive
  ("Us Open" vs "US Open", same event) is normalized at the earliest pipeline
  stage -- without that fix, several real Grand Slam titles (two of
  Alcaraz's, Djokovic's 2023 US Open, Osaka's 2020, Sabalenka's 2024) were
  silently dropped from every downstream export, since the tournament-name
  match against the exact string "US Open" simply failed for those years.
- `--min-matches` has a real side effect worth knowing about if you're
  auditing "who won X" against an outside source: it excludes players with a
  genuine Grand Slam title but a shorter career (e.g. Ashleigh Barty, who
  retired at 25 after 2021 Wimbledon and 2022 Australian Open). At
  `--min-matches 300` (used for the production build), this affects a
  handful of past champions with brief or injury-shortened careers -- lower
  the threshold if completeness for less-prolific champions matters more
  than file size for your use case.
- The Sackmann archive mirror this project reads from is community-maintained
  and lags behind real-world results by a few months -- as of this writing,
  it covers matches through roughly the 2026 Australian Open, but not later
  2026 events yet (e.g. Wimbledon 2026 is missing entirely, confirmed absent
  even in the raw source files, not something our pipeline dropped). If a
  recent title looks missing, check whether the underlying archive file for
  that tournament/year actually contains it before assuming it's a pipeline
  bug -- re-clone `tennis-sackmann-archive-main` periodically to catch up.

## Deployment

The frontend is a static build (Vite) that fetches `tennisData.json` at
runtime -- there's no backend, so it deploys as a static site on
[Vercel](https://vercel.com) (or Netlify/GitHub Pages).

1. Generate `tennisData.json` with `--min-matches 300` (or higher) so the
   file stays well under GitHub's 100 MB hard limit -- check the actual file
   size after generating it (`ls -lh tennis-frontend/public/tennisData.json`).
2. Commit `tennis-frontend/public/tennisData.json` -- this one file is a
   deliberate exception to the gitignore rule for `output/`/`public/`: the
   deployed site has no pipeline to generate it at build time, so it has to
   already be in the repo.
3. On Vercel: "New Project" -> import this GitHub repo -> set **Root
   Directory** to `tennis-frontend` -> framework preset should auto-detect
   as Vite -> Deploy.
4. Any time the data or code changes: rerun the pipeline locally, commit the
   updated `tennisData.json` + code, push -- Vercel redeploys automatically
   on every push to `main`.