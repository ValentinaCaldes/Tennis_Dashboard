# Tennis Analytics Dashboard

Portfolio project: Python data pipeline + React dashboard analyzing ATP/WTA
tennis data from Jeff Sackmann's [Match Charting Project](https://github.com/JeffSackmann/tennis_MatchChartingProject).

## Structure

```
tennis-dashboard-pipeline/
  scripts/            Python ETL pipeline
  docs/               KPI planning notes
  data/               (gitignored) local copy of Match Charting Project CSVs
  output/             (gitignored) generated CSVs + tennisData.js
  tennis-frontend/    React + Vite + Recharts dashboard
```

## Setup from scratch (new machine)

### 1. Get the Match Charting Project data
This repo does NOT include the raw match data (it's a separate public dataset,
not something to bundle here). Clone it separately:
```bash
git clone https://github.com/JeffSackmann/tennis_MatchChartingProject.git
```

### 2. Run the Python pipeline
```bash
cd tennis-dashboard-pipeline/scripts
pip install pandas numpy

python 01_fetch_atp_matches.py --source-dir "/path/to/tennis_MatchChartingProject"
python 02_compute_metrics.py
python 03_compute_h2h.py
python 04_compute_match_load.py
python 05_export_dashboard_json.py
```
The last script writes `output/tennisData.js` AND copies it directly into
`tennis-frontend/src/tennisData.js` -- no manual copying needed.

### 3. Run the frontend
```bash
cd ../tennis-frontend
npm install
npm run dev
```
Open http://localhost:5173

## Pipeline scripts

| Script | What it does |
|---|---|
| `01_fetch_atp_matches.py` | Reads local Match Charting Project CSVs, derives match winners from point-by-point data, consolidates into `data/atp_matches_raw.csv` |
| `02_compute_metrics.py` | Serve/return stats, dominance ratio, win rate by surface (career + by-year), Elo ratings, tour (ATP/WTA) per player |
| `03_compute_h2h.py` | Head-to-head records between player pairs, overall and by surface |
| `04_compute_match_load.py` | Matches per week/month, win rate by rest days (with a "data gap" bucket to filter out charting coverage gaps) |
| `05_export_dashboard_json.py` | Joins everything into `tennisData.js` for the frontend |

## Dashboard tabs

1. **Player Overview** -- Elo rating & history, win rate by surface, for one selected player
2. **Surface Performance** -- cross-player rankings by surface, all-court vs. specialist index
3. **Serve & Return** -- serve/return metric rankings, aces vs. double faults
4. **Head-to-Head** -- direct record between any two players
5. **Match Load & Fatigue** -- *in progress*
6. **Insights & Rankings** -- *in progress*

## Data notes

- Source is the Match Charting Project, a volunteer-charted subset of matches
  (not full tour coverage) -- treat absolute numbers as directional, not
  exhaustive.
- Elo ratings are custom-calculated (K=32, base 1500), not official ATP/WTA
  rankings.
