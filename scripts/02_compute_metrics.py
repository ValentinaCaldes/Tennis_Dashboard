"""
02_compute_metrics.py

Computes:
  - Serve/return metrics per match (dominance ratio, etc.)
  - Stats aggregated by player and by player+surface
  - A simple Elo per player, used in the prediction tab.

Usage:
    python 02_compute_metrics.py
"""
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = Path(__file__).resolve().parent.parent / "output"


def load_data():
    matches = pd.read_csv(DATA_DIR / "atp_matches_raw.csv", parse_dates=["match_date"])
    return matches


def add_serve_return_metrics(m: pd.DataFrame) -> pd.DataFrame:
    """Adds derived columns per match for winner and loser."""
    for prefix in ["w", "l"]:
        svpt = m[f"{prefix}_svpt"].replace(0, np.nan)
        m[f"{prefix}_1st_in_pct"] = m[f"{prefix}_1stIn"] / svpt
        won_1st = m[f"{prefix}_1stIn"].replace(0, np.nan)
        m[f"{prefix}_1st_win_pct"] = m[f"{prefix}_1stWon"] / won_1st
        second_serves = (m[f"{prefix}_svpt"] - m[f"{prefix}_1stIn"]).replace(0, np.nan)
        m[f"{prefix}_2nd_win_pct"] = m[f"{prefix}_2ndWon"] / second_serves
        bp_faced = m[f"{prefix}_bpFaced"].replace(0, np.nan)
        m[f"{prefix}_bp_saved_pct"] = m[f"{prefix}_bpSaved"] / bp_faced

    # Winner's dominance ratio: return points won / serve points lost by
    # the opponent (>1 = won the exchange)
    w_return_pts_won = m["l_svpt"] - m["l_1stWon"] - m["l_2ndWon"]
    l_serve_pts_lost = m["w_svpt"] - m["w_1stWon"] - m["w_2ndWon"]
    m["winner_dominance_ratio"] = w_return_pts_won / l_serve_pts_lost.replace(0, np.nan)
    return m


def player_surface_stats(m: pd.DataFrame) -> pd.DataFrame:
    """Win rate by player and surface, for the Surface Performance tab."""
    wins = m[["winner_name", "surface"]].rename(columns={"winner_name": "player"})
    wins["win"] = 1
    losses = m[["loser_name", "surface"]].rename(columns={"loser_name": "player"})
    losses["win"] = 0
    all_matches = pd.concat([wins, losses], ignore_index=True)

    stats = (
        all_matches.groupby(["player", "surface"])
        .agg(matches=("win", "size"), wins=("win", "sum"))
        .reset_index()
    )
    stats["win_rate"] = (stats["wins"] / stats["matches"]).round(3)
    return stats


def player_surface_stats_by_year(m: pd.DataFrame) -> pd.DataFrame:
    """Same as player_surface_stats but also broken down by year, so the
    frontend can filter the surface chart by year range (same filter
    that already exists on the Elo chart)."""
    m = m.dropna(subset=["match_date"]).copy()
    m["year"] = pd.to_datetime(m["match_date"]).dt.year

    wins = m[["winner_name", "surface", "year"]].rename(columns={"winner_name": "player"})
    wins["win"] = 1
    losses = m[["loser_name", "surface", "year"]].rename(columns={"loser_name": "player"})
    losses["win"] = 0
    all_matches = pd.concat([wins, losses], ignore_index=True)

    stats = (
        all_matches.groupby(["player", "surface", "year"])
        .agg(matches=("win", "size"), wins=("win", "sum"))
        .reset_index()
    )
    stats["win_rate"] = (stats["wins"] / stats["matches"]).round(3)
    return stats


def player_tour_map(m: pd.DataFrame) -> pd.DataFrame:
    """Maps each player to their tour (ATP/WTA). A player could technically
    show up in both if there's bad data, so we keep the most frequent
    tour for that player."""
    if "tour" not in m.columns:
        return pd.DataFrame(columns=["player", "tour"])

    wins = m[["winner_name", "tour"]].rename(columns={"winner_name": "player"})
    losses = m[["loser_name", "tour"]].rename(columns={"loser_name": "player"})
    all_appearances = pd.concat([wins, losses], ignore_index=True).dropna()

    tour_counts = (
        all_appearances.groupby(["player", "tour"]).size().reset_index(name="n")
    )
    idx = tour_counts.groupby("player")["n"].idxmax()
    return tour_counts.loc[idx, ["player", "tour"]].reset_index(drop=True)


def compute_elo(matches: pd.DataFrame, k=32, base=1500) -> pd.DataFrame:
    """Simple Elo, one rating per player, updated match by match in
    chronological order. Doesn't differentiate by surface (could be
    extended to)."""
    m = matches.sort_values("match_date")
    ratings = {}

    def get(p):
        return ratings.get(p, base)

    history = []
    for _, row in m.iterrows():
        w, l = row["winner_name"], row["loser_name"]
        rw, rl = get(w), get(l)
        exp_w = 1 / (1 + 10 ** ((rl - rw) / 400))
        ratings[w] = rw + k * (1 - exp_w)
        ratings[l] = rl + k * (0 - (1 - exp_w))
        history.append({"date": row["match_date"], "player": w, "elo": ratings[w]})
        history.append({"date": row["match_date"], "player": l, "elo": ratings[l]})

    current = pd.DataFrame(
        [{"player": p, "elo": round(r, 1)} for p, r in ratings.items()]
    ).sort_values("elo", ascending=False)
    return current, pd.DataFrame(history)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    matches = load_data()
    matches = add_serve_return_metrics(matches)

    ps_stats = player_surface_stats(matches)
    ps_stats.to_csv(OUT_DIR / "player_surface_stats.csv", index=False)
    print(f"player_surface_stats: {len(ps_stats):,} rows")

    ps_by_year = player_surface_stats_by_year(matches)
    ps_by_year.to_csv(OUT_DIR / "player_surface_stats_by_year.csv", index=False)
    print(f"player_surface_stats_by_year: {len(ps_by_year):,} rows")

    tour_map = player_tour_map(matches)
    tour_map.to_csv(OUT_DIR / "player_tour.csv", index=False)
    print(f"player_tour: {len(tour_map):,} players")

    elo_current, elo_history = compute_elo(matches)
    elo_current = elo_current.merge(tour_map, on="player", how="left")
    elo_current.to_csv(OUT_DIR / "elo_current.csv", index=False)
    elo_history.to_csv(OUT_DIR / "elo_history.csv", index=False)
    print(f"elo_current: {len(elo_current):,} players")

    matches.to_csv(OUT_DIR / "matches_with_metrics.csv", index=False)
    print(f"\nAll done, saved to {OUT_DIR}")


if __name__ == "__main__":
    main()