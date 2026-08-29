"""
01_fetch_atp_matches.py

Reads the Match Charting Project CSVs (charting-m/w-matches.csv +
charting-m/w-stats-Overview.csv + charting-m/w-points-*.csv) that you
already have downloaded in tennis_MatchChartingProject, consolidates
them into a single DataFrame compatible with the rest of the pipeline,
and saves the result to data/atp_matches_raw.csv

Unlike Sackmann's tennis_atp dataset (season results), the Match
Charting Project brings hand-"charted" matches, point by point: far
fewer matches, but with serve/return stats already aggregated per
match (charting-*-stats-Overview.csv, "Total" row). It doesn't
directly say who won each match, so we derive that by looking at the
last charted point of each match_id (in practice, the point that
closes the match) in charting-*-points-*.csv.

Usage:
    python 01_fetch_atp_matches.py
    python 01_fetch_atp_matches.py --source-dir "/other/path/tennis_MatchChartingProject"
"""
import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_SOURCE_DIR = Path("/home/vcaldes/Documents/Tennis_Dashoboard/tennis_MatchChartingProject")

TOURS = {"m": "ATP", "w": "WTA"}
POINTS_SUFFIXES = ["to-2009", "2010s", "2020s"]

# Column in charting-*-stats-Overview.csv (row set == "Total") -> w_/l_
# suffix expected by the rest of the pipeline (same naming Sackmann used).
STAT_COLS = {
    "serve_pts": "svpt",
    "aces": "ace",
    "dfs": "df",
    "first_in": "1stIn",
    "first_won": "1stWon",
    "second_won": "2ndWon",
    "bk_pts": "bpFaced",
    "bp_saved": "bpSaved",
}


def load_matches(source_dir: Path, tour: str) -> pd.DataFrame:
    path = source_dir / f"charting-{tour}-matches.csv"
    df = pd.read_csv(path)
    df["tour"] = TOURS[tour]
    return df


def load_overview_totals(source_dir: Path, tour: str) -> pd.DataFrame:
    path = source_dir / f"charting-{tour}-stats-Overview.csv"
    df = pd.read_csv(path)
    df = df[df["set"] == "Total"].drop_duplicates(subset=["match_id", "player"])
    return df


def last_point_winner(source_dir: Path, tour: str) -> pd.DataFrame:
    """For each match_id, who won the last charted point -- a reliable
    proxy for who won the match, since the last point loaded is the
    converted match point."""
    frames = []
    for suffix in POINTS_SUFFIXES:
        path = source_dir / f"charting-{tour}-points-{suffix}.csv"
        if not path.exists():
            continue
        df = pd.read_csv(path, usecols=["match_id", "Pt", "PtWinner"], low_memory=False)
        df["Pt"] = pd.to_numeric(df["Pt"], errors="coerce")
        df = df.dropna(subset=["Pt", "PtWinner"])
        idx = df.groupby("match_id")["Pt"].idxmax()
        frames.append(df.loc[idx])
        print(f"    read {path.name}: {len(df):,} points")

    if not frames:
        return pd.DataFrame(columns=["match_id", "PtWinner"])

    combined = pd.concat(frames, ignore_index=True)
    idx = combined.groupby("match_id")["Pt"].idxmax()
    return combined.loc[idx, ["match_id", "PtWinner"]]


def build_tour(source_dir: Path, tour: str) -> pd.DataFrame:
    print(f"\n  Processing tour '{TOURS[tour]}' (charting-{tour}-*)...")
    matches = load_matches(source_dir, tour)
    overview = load_overview_totals(source_dir, tour)
    winners = last_point_winner(source_dir, tour)
    print(f"  {tour}: {len(matches):,} matches, {len(overview):,} total-stats rows, "
          f"{len(winners):,} matches with a detected winner")

    m = matches.merge(winners, on="match_id", how="left")
    m = m.dropna(subset=["PtWinner"]).copy()
    m["PtWinner"] = m["PtWinner"].astype(int)

    stat_src_cols = list(STAT_COLS.keys())
    p1_stats = overview[["match_id", "player"] + stat_src_cols].merge(
        m[["match_id", "Player 1"]].rename(columns={"Player 1": "player"}),
        on=["match_id", "player"],
        how="inner",
    ).rename(columns={c: f"p1_{v}" for c, v in STAT_COLS.items()})
    p2_stats = overview[["match_id", "player"] + stat_src_cols].merge(
        m[["match_id", "Player 2"]].rename(columns={"Player 2": "player"}),
        on=["match_id", "player"],
        how="inner",
    ).rename(columns={c: f"p2_{v}" for c, v in STAT_COLS.items()})

    m = m.merge(p1_stats[["match_id"] + [f"p1_{v}" for v in STAT_COLS.values()]], on="match_id", how="left")
    m = m.merge(p2_stats[["match_id"] + [f"p2_{v}" for v in STAT_COLS.values()]], on="match_id", how="left")

    p1_won = m["PtWinner"] == 1
    m["winner_name"] = np.where(p1_won, m["Player 1"], m["Player 2"])
    m["loser_name"] = np.where(p1_won, m["Player 2"], m["Player 1"])

    for v in STAT_COLS.values():
        m[f"w_{v}"] = np.where(p1_won, m[f"p1_{v}"], m[f"p2_{v}"])
        m[f"l_{v}"] = np.where(p1_won, m[f"p2_{v}"], m[f"p1_{v}"])
        m.drop(columns=[f"p1_{v}", f"p2_{v}"], inplace=True)

    m["match_date"] = pd.to_datetime(m["Date"].astype(str), format="%Y%m%d", errors="coerce")
    m["tourney_name"] = m["Tournament"]
    m["tourney_id"] = m["Tournament"].astype(str) + "_" + m["match_date"].dt.year.astype("Int64").astype(str)
    m["surface"] = m["Surface"]

    return m


def main(source_dir: Path):
    if not source_dir.exists():
        print(f"Folder {source_dir} does not exist.", file=sys.stderr)
        sys.exit(1)

    available_tours = [t for t in TOURS if (source_dir / f"charting-{t}-matches.csv").exists()]
    if not available_tours:
        print(
            f"Couldn't find charting-m-matches.csv or charting-w-matches.csv in {source_dir}.\n"
            "  Check that this is the tennis_MatchChartingProject repo folder.",
            file=sys.stderr,
        )
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Reading charted matches from {source_dir}...")

    frames = [build_tour(source_dir, tour) for tour in available_tours]
    matches = pd.concat(frames, ignore_index=True)

    keep_cols = (
        ["match_id", "tour", "tourney_id", "tourney_name", "match_date", "Round",
         "surface", "Best of", "winner_name", "loser_name"]
        + [f"{p}_{v}" for p in "wl" for v in STAT_COLS.values()]
    )
    matches = matches[[c for c in keep_cols if c in matches.columns]]

    out_path = DATA_DIR / "atp_matches_raw.csv"
    matches.to_csv(out_path, index=False)
    print(f"\nTotal: {len(matches):,} matches saved to {out_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=str,
        default=str(DEFAULT_SOURCE_DIR),
        help="Local folder for the tennis_MatchChartingProject repo (charting-*-matches.csv, etc.) "
        f"[default: {DEFAULT_SOURCE_DIR}]",
    )
    args = parser.parse_args()
    main(Path(args.source_dir))