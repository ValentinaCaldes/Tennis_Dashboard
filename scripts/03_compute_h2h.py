"""
03_compute_h2h.py

Computes the head-to-head (H2H) history between every pair of players
who have faced each other, for the rival-comparison tab.

Generates:
  - h2h_overall.csv: per pair of players, total meetings, wins for
    each, and who won the most recent meeting.
  - h2h_by_surface.csv: same thing broken down by surface (to spot
    "you beat him on clay but he beats you on hard", etc).

Usage:
    python 03_compute_h2h.py
"""
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = Path(__file__).resolve().parent.parent / "output"


def load_matches() -> pd.DataFrame:
    return pd.read_csv(DATA_DIR / "atp_matches_raw.csv", parse_dates=["match_date"])


def make_pair_key(m: pd.DataFrame) -> pd.DataFrame:
    """Alphabetically orders each pair (player_a, player_b) so that
    'Nadal vs Federer' and 'Federer vs Nadal' land on the same row, and
    flags whether player_a or player_b won."""
    m = m.copy()
    a_is_winner = m["winner_name"] < m["loser_name"]
    m["player_a"] = m["winner_name"].where(a_is_winner, m["loser_name"])
    m["player_b"] = m["loser_name"].where(a_is_winner, m["winner_name"])
    m["a_won"] = a_is_winner
    return m


def h2h_overall(m: pd.DataFrame) -> pd.DataFrame:
    """Pandas 2.2+/3.0 excludes the grouping columns inside apply(), so
    we don't build 'last_winner' inside the function -- we return
    last_a_won (bool) and resolve it outside, once player_a/player_b
    are available as normal columns again."""
    grouped = m.groupby(["player_a", "player_b"])

    def summarize(g):
        g = g.sort_values("match_date")
        last = g.iloc[-1]
        return pd.Series(
            {
                "total_matches": len(g),
                "a_wins": int(g["a_won"].sum()),
                "b_wins": int((~g["a_won"]).sum()),
                "last_meeting_date": last["match_date"],
                "last_a_won": bool(last["a_won"]),
                "last_surface": last["surface"] if "surface" in g.columns else None,
            }
        )

    out = grouped.apply(summarize).reset_index()
    out["last_winner"] = out["player_a"].where(out["last_a_won"], out["player_b"])
    out = out.drop(columns=["last_a_won"])
    return out.sort_values("total_matches", ascending=False)


def h2h_by_surface(m: pd.DataFrame) -> pd.DataFrame:
    if "surface" not in m.columns:
        return pd.DataFrame()

    grouped = m.groupby(["player_a", "player_b", "surface"])
    out = grouped.agg(
        matches=("a_won", "size"),
        a_wins=("a_won", "sum"),
    ).reset_index()
    out["b_wins"] = out["matches"] - out["a_wins"]
    return out.sort_values("matches", ascending=False)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    matches = load_matches()
    matches = matches.dropna(subset=["winner_name", "loser_name"])
    m = make_pair_key(matches)

    overall = h2h_overall(m)
    overall.to_csv(OUT_DIR / "h2h_overall.csv", index=False)
    print(f"h2h_overall: {len(overall):,} player pairs")

    by_surface = h2h_by_surface(m)
    if not by_surface.empty:
        by_surface.to_csv(OUT_DIR / "h2h_by_surface.csv", index=False)
        print(f"h2h_by_surface: {len(by_surface):,} rows (pair + surface)")
    else:
        print("h2h_by_surface: no 'surface' column, skipped")

    print(f"\nSaved to {OUT_DIR}")


if __name__ == "__main__":
    main()