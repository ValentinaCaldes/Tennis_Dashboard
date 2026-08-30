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


GRAND_SLAMS = {"Australian Open", "Roland Garros", "Wimbledon", "US Open"}

# Round order for a Grand Slam draw, worst to best -- used to find the
# furthest round a player reached in a given edition.
ROUND_RANK = {"R128": 1, "R64": 2, "R32": 3, "R16": 4, "QF": 5, "SF": 6, "F": 7}


def grand_slam_editions(matches: pd.DataFrame) -> pd.DataFrame:
    """For each player and each Grand Slam edition they played (a specific
    tournament + year), the furthest round reached and whether they won
    the title. Used for KPIs like 'busiest period' or 'GS win rate'
    context, so it's clear whether a busy stretch actually led anywhere."""
    df = matches[matches["tourney_name"].isin(GRAND_SLAMS)].dropna(subset=["match_date"]).copy()
    if df.empty or "Round" not in df.columns:
        return pd.DataFrame(columns=["player", "tourney_name", "year", "best_round", "won_title", "matches_played"])

    df["year"] = df["match_date"].dt.year

    wins = df[["winner_name", "tourney_name", "year", "Round"]].rename(columns={"winner_name": "player"})
    wins["result"] = "won"
    losses = df[["loser_name", "tourney_name", "year", "Round"]].rename(columns={"loser_name": "player"})
    losses["result"] = "lost"
    long_df = pd.concat([wins, losses], ignore_index=True).dropna(subset=["player"])
    long_df["round_rank"] = long_df["Round"].map(ROUND_RANK).fillna(0)

    rows = []
    for (player, tourney_name, year), g in long_df.groupby(["player", "tourney_name", "year"]):
        best = g.loc[g["round_rank"].idxmax()]
        won_title = bool(((g["Round"] == "F") & (g["result"] == "won")).any())
        matches_won = int((g["result"] == "won").sum())
        rows.append({
            "player": player,
            "tourney_name": tourney_name,
            "year": int(year),
            "best_round": best["Round"],
            "won_title": won_title,
            "matches_played": len(g),
            "matches_won": matches_won,
        })
    return pd.DataFrame(rows)


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
    long_df["is_grand_slam"] = long_df["tourney_name"].isin(GRAND_SLAMS)
    return long_df.dropna(subset=["player", "match_date"])


def matches_per_period(long_df: pd.DataFrame) -> pd.DataFrame:
    """Matches played per player, grouped by week and by month, plus how
    many of those were Grand Slam matches (for the GS-vs-rest breakdown
    in the frontend)."""
    df = long_df.copy()
    df["week"] = df["match_date"].dt.to_period("W").astype(str)
    df["month"] = df["match_date"].dt.to_period("M").astype(str)

    def agg_period(period_col: str, period_type: str) -> pd.DataFrame:
        out = (
            df.groupby(["player", period_col])
            .agg(matches=("player", "size"), gs_matches=("is_grand_slam", "sum"))
            .reset_index()
        )
        out["period_type"] = period_type
        return out.rename(columns={period_col: "period"})

    weekly = agg_period("week", "week")
    monthly = agg_period("month", "month")

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

    # Same thing but broken down per player too, for a per-player view in
    # the frontend. Sample sizes will be small for most players -- the
    # frontend shows the match count next to each bar so that's visible,
    # not hidden.
    by_player = (
        df.groupby(["player", "rest_bucket"], observed=True)
        .agg(matches=("won", "size"), win_rate=("won", "mean"))
        .reset_index()
    )
    by_player["win_rate"] = by_player["win_rate"].round(3)

    return detail, agg, by_player


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    matches = load_matches()
    long_df = to_long_format(matches)

    load_df = matches_per_period(long_df)
    load_df.to_csv(OUT_DIR / "matches_per_period.csv", index=False)
    print(f"matches_per_period: {len(load_df):,} rows (player x period)")

    rest_detail, rest_df, rest_by_player = rest_days_performance(long_df)
    rest_detail.to_csv(OUT_DIR / "rest_days_detail.csv", index=False)
    rest_df.to_csv(OUT_DIR / "rest_days_performance.csv", index=False)
    rest_by_player.to_csv(OUT_DIR / "rest_days_performance_by_player.csv", index=False)
    print(f"rest_days_detail: {len(rest_detail):,} rows (one per match, unaggregated)")
    print(f"rest_days_performance: {len(rest_df):,} rows (rest buckets)")
    print(f"rest_days_performance_by_player: {len(rest_by_player):,} rows (player x bucket)")
    print(rest_df.to_string(index=False))

    gs_editions = grand_slam_editions(matches)
    gs_editions.to_csv(OUT_DIR / "grand_slam_editions.csv", index=False)
    print(f"grand_slam_editions: {len(gs_editions):,} rows (player x GS x year)")

    print(f"\nSaved to {OUT_DIR}")


if __name__ == "__main__":
    main()