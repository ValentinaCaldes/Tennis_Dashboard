"""
04_compute_match_load.py

Match load and fatigue, for the Match Load tab.

NOTE on dataset limitations: the Match Charting Project doesn't include
minutes played or number of sets per match (unlike Sackmann's original
tennis_atp), so those two metrics are left out for now. What we do
have -- date, tournament and round -- is enough for the most
interesting proxy for this tab: days of rest between matches and how
it affects performance.

Generates:
  - matches_per_period.csv: matches played per player per week/month.
  - rest_days_performance.csv: win rate by days of rest since the
    player's previous match (0 = back-to-back, 1, 2+).

Usage:
    python 04_compute_match_load.py
"""
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = Path(__file__).resolve().parent.parent / "output"


def load_matches() -> pd.DataFrame:
    return pd.read_csv(DATA_DIR / "atp_matches_raw.csv", parse_dates=["match_date"])


def to_long_format(m: pd.DataFrame) -> pd.DataFrame:
    """One row per player and match (instead of winner/loser in separate
    columns), needed to compute load per player."""
    wins = m[["match_date", "tourney_name", "surface", "winner_name"]].rename(
        columns={"winner_name": "player"}
    )
    wins["won"] = 1
    losses = m[["match_date", "tourney_name", "surface", "loser_name"]].rename(
        columns={"loser_name": "player"}
    )
    losses["won"] = 0
    long_df = pd.concat([wins, losses], ignore_index=True)
    return long_df.dropna(subset=["player", "match_date"])


def matches_per_period(long_df: pd.DataFrame) -> pd.DataFrame:
    """Matches played per player, grouped by week and by month."""
    df = long_df.copy()
    df["week"] = df["match_date"].dt.to_period("W").astype(str)
    df["month"] = df["match_date"].dt.to_period("M").astype(str)

    weekly = (
        df.groupby(["player", "week"]).size().reset_index(name="matches")
    )
    weekly["period_type"] = "week"
    weekly = weekly.rename(columns={"week": "period"})

    monthly = (
        df.groupby(["player", "month"]).size().reset_index(name="matches")
    )
    monthly["period_type"] = "month"
    monthly = monthly.rename(columns={"month": "period"})

    return pd.concat([weekly, monthly], ignore_index=True)


def rest_days_performance(long_df: pd.DataFrame):
    """For each match of each player, how many days passed since their
    previous CHARTED match, bucketed, plus the win rate in each bucket.

    IMPORTANT DATASET LIMITATION: the Match Charting Project doesn't have
    every match a player has played, only a hand-picked subset. A large
    gap between two "consecutive" matches in the dataset almost always
    means there were real matches in between that weren't charted -- NOT
    that the player actually rested that long. Verified on real data: in
    the largest-rest bucket, ~65% of cases exceed 30 days and the median
    is 54 days, which is impossible as genuine rest on the pro tour.

    That's why we split out a "data gap (>30 days, unreliable)" bucket
    instead of mixing it in with real rest. Only the first 4 buckets (up
    to 30 days) are interpretable as genuine fatigue/rest.
    """
    df = long_df.sort_values(["player", "match_date"]).copy()
    df["prev_match_date"] = df.groupby("player")["match_date"].shift(1)
    df["rest_days"] = (df["match_date"] - df["prev_match_date"]).dt.days

    # Drop each player's first match in the dataset (there's no
    # previous match to compute rest from)
    df = df.dropna(subset=["rest_days"])

    df["rest_bucket"] = pd.cut(
        df["rest_days"],
        bins=[-1, 0, 1, 3, 7, 30, float("inf")],
        labels=[
            "0 days (back-to-back)",
            "1 day",
            "2-3 days",
            "4-7 days",
            "8-30 days",
            "data gap (>30 days, unreliable)",
        ],
    )

    detail = df[
        ["player", "match_date", "tourney_name", "surface", "prev_match_date",
         "rest_days", "rest_bucket", "won"]
    ].sort_values(["player", "match_date"])

    agg = (
        df.groupby("rest_bucket", observed=True)
        .agg(matches=("won", "size"), win_rate=("won", "mean"))
        .reset_index()
    )
    agg["win_rate"] = agg["win_rate"].round(3)
    return detail, agg


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    matches = load_matches()
    long_df = to_long_format(matches)

    load_df = matches_per_period(long_df)
    load_df.to_csv(OUT_DIR / "matches_per_period.csv", index=False)
    print(f"matches_per_period: {len(load_df):,} rows (player x period)")

    rest_detail, rest_df = rest_days_performance(long_df)
    rest_detail.to_csv(OUT_DIR / "rest_days_detail.csv", index=False)
    rest_df.to_csv(OUT_DIR / "rest_days_performance.csv", index=False)
    print(f"rest_days_detail: {len(rest_detail):,} rows (one per match, unaggregated)")
    print(f"rest_days_performance: {len(rest_df):,} rows (rest buckets)")
    print(rest_df.to_string(index=False))

    print(f"\nSaved to {OUT_DIR}")


if __name__ == "__main__":
    main()