"""
03_compute_h2h.py

Computes the head-to-head (H2H) history between every pair of players
who have faced each other, for the rival-comparison tab.

Generates:
  - h2h_overall.csv: per pair of players, total meetings, wins for
    each, who won the most recent meeting, their single longest match
    (minutes + winner, when duration data is available), and how many
    Grand Slam finals they've played against each other (with the
    breakdown of who won those).
  - h2h_by_surface.csv: same core numbers broken down by surface (to
    spot "you beat him on clay but he beats you on hard", etc).
  - h2h_by_year.csv: total meetings + wins broken down by year, so the
    frontend can filter head-to-head stats to a date range (same
    From/To pattern used elsewhere in the dashboard).

Usage:
    python 03_compute_h2h.py
"""
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = Path(__file__).resolve().parent.parent / "output"

# Sanity cap for match duration in minutes. The longest professional
# match on record is Isner-Mahut at Wimbledon 2010 (665 minutes, 11h
# 5m) -- 700 gives comfortable headroom above any legitimate match
# while still catching data-entry errors in the source archive (we've
# seen a "2475 minutes" / 41-hour match that was clearly a bad value,
# not a real result).
MAX_PLAUSIBLE_MATCH_MINUTES = 700


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
    """Vectorized version -- the original used groupby().apply() with a
    custom Python function per group, which doesn't scale past a few
    thousand matches (it was taking minutes/hanging on the full
    216k-match official dataset). This does the same thing with built-in
    pandas aggregations and groupby().tail(1), both vectorized."""
    m_sorted = m.sort_values("match_date")

    counts = (
        m_sorted.groupby(["player_a", "player_b"])
        .agg(total_matches=("a_won", "size"), a_wins=("a_won", "sum"))
        .reset_index()
    )
    counts["b_wins"] = counts["total_matches"] - counts["a_wins"]

    last_cols = ["player_a", "player_b", "match_date", "a_won"]
    if "surface" in m.columns:
        last_cols.append("surface")
    last_rows = m_sorted.groupby(["player_a", "player_b"], as_index=False).tail(1)[last_cols]
    last_rows = last_rows.rename(columns={
        "match_date": "last_meeting_date",
        "a_won": "last_a_won",
        "surface": "last_surface",
    })

    out = counts.merge(last_rows, on=["player_a", "player_b"], how="left")
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


def h2h_by_year(m: pd.DataFrame) -> pd.DataFrame:
    """Same core numbers as h2h_overall, but broken down by year. Lets
    the frontend aggregate over any From/To range instead of only ever
    seeing the full-career totals."""
    m = m.dropna(subset=["match_date"]).copy()
    m["year"] = m["match_date"].dt.year
    out = m.groupby(["player_a", "player_b", "year"]).agg(
        matches=("a_won", "size"),
        a_wins=("a_won", "sum"),
    ).reset_index()
    out["b_wins"] = out["matches"] - out["a_wins"]
    return out


def h2h_longest_match(m: pd.DataFrame) -> pd.DataFrame:
    """For each pair, their single longest match against each other (by
    minutes) and who won it. Not every match has a recorded duration
    (smaller/older tournaments don't always track it) -- pairs with no
    timed matches between them are simply absent here, and the frontend
    should treat that as "no data", not zero."""
    if "minutes" not in m.columns:
        return pd.DataFrame()

    # Drop missing AND implausibly large values (data-entry errors in the
    # source -- a real match can't run 40+ hours) before picking the max,
    # so a bad row can't masquerade as a new "record".
    timed = m.dropna(subset=["minutes"])
    timed = timed[timed["minutes"] <= MAX_PLAUSIBLE_MATCH_MINUTES]
    if timed.empty:
        return pd.DataFrame()

    idx = timed.groupby(["player_a", "player_b"])["minutes"].idxmax()
    cols = ["player_a", "player_b", "minutes", "match_date", "a_won"]
    if "surface" in timed.columns:
        cols.append("surface")
    longest = timed.loc[idx, cols].copy()
    longest["winner"] = longest["player_a"].where(longest["a_won"], longest["player_b"])
    longest = longest.drop(columns=["a_won"]).rename(columns={
        "minutes": "longest_match_minutes",
        "match_date": "longest_match_date",
        "surface": "longest_match_surface",
        "winner": "longest_match_winner",
    })
    longest["longest_match_minutes"] = longest["longest_match_minutes"].astype(int)
    return longest


def h2h_grand_slam_finals(m: pd.DataFrame) -> pd.DataFrame:
    """Grand Slam FINALS the pair have played against each other
    (tourney_level == 'G' and Round == 'F'), with the win split. Needs
    tourney_level and Round, both added to atp_matches_raw.csv by
    01_fetch_atp_matches.py -- if you're on an older version of that
    script's output, re-run it first or this comes back empty."""
    if "tourney_level" not in m.columns or "Round" not in m.columns:
        return pd.DataFrame()

    finals = m[(m["tourney_level"] == "G") & (m["Round"] == "F")]
    if finals.empty:
        return pd.DataFrame()

    out = finals.groupby(["player_a", "player_b"]).agg(
        gs_finals=("a_won", "size"),
        gs_finals_a_wins=("a_won", "sum"),
    ).reset_index()
    out["gs_finals_b_wins"] = out["gs_finals"] - out["gs_finals_a_wins"]
    return out


def h2h_grand_slam_finals_detail(m: pd.DataFrame) -> pd.DataFrame:
    """One row per individual Grand Slam final the pair has played
    against each other -- tournament, year, surface and who won. This is
    a separate file (not columns on h2h_overall) because a pair can have
    played more than one final, so it doesn't fit as a single row's
    worth of columns. Feeds the "which ones" list on the frontend's
    Grand Slam Finals card, which otherwise only shows the aggregate
    count from h2h_overall.gs_finals."""
    if "tourney_level" not in m.columns or "Round" not in m.columns:
        return pd.DataFrame()

    finals = m[(m["tourney_level"] == "G") & (m["Round"] == "F")].copy()
    if finals.empty:
        return pd.DataFrame()

    finals["winner"] = finals["player_a"].where(finals["a_won"], finals["player_b"])
    finals["year"] = finals["match_date"].dt.year

    cols = ["player_a", "player_b", "match_date", "tourney_name", "year", "winner"]
    if "surface" in finals.columns:
        cols.append("surface")
    return finals[cols].sort_values(["player_a", "player_b", "match_date"])


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    matches = load_matches()
    matches = matches.dropna(subset=["winner_name", "loser_name"])
    m = make_pair_key(matches)

    overall = h2h_overall(m)

    longest = h2h_longest_match(m)
    if not longest.empty:
        overall = overall.merge(longest, on=["player_a", "player_b"], how="left")
        print(f"h2h longest match: computed for {len(longest):,} pairs")
    else:
        print("h2h longest match: no 'minutes' data available (re-run 01_fetch_atp_matches.py if this is unexpected), skipped")

    gs_finals = h2h_grand_slam_finals(m)
    if not gs_finals.empty:
        overall = overall.merge(gs_finals, on=["player_a", "player_b"], how="left")
        fill_cols = ["gs_finals", "gs_finals_a_wins", "gs_finals_b_wins"]
        overall[fill_cols] = overall[fill_cols].fillna(0).astype(int)
        print(f"h2h Grand Slam finals: {int(gs_finals['gs_finals'].sum()):,} finals across {len(gs_finals):,} pairs")
    else:
        overall["gs_finals"] = 0
        overall["gs_finals_a_wins"] = 0
        overall["gs_finals_b_wins"] = 0
        print("h2h Grand Slam finals: no 'tourney_level'/'Round' data available (re-run 01_fetch_atp_matches.py if this is unexpected), skipped")

    overall.to_csv(OUT_DIR / "h2h_overall.csv", index=False)
    print(f"h2h_overall: {len(overall):,} player pairs")

    by_surface = h2h_by_surface(m)
    if not by_surface.empty:
        by_surface.to_csv(OUT_DIR / "h2h_by_surface.csv", index=False)
        print(f"h2h_by_surface: {len(by_surface):,} rows (pair + surface)")
    else:
        print("h2h_by_surface: no 'surface' column, skipped")

    by_year = h2h_by_year(m)
    by_year.to_csv(OUT_DIR / "h2h_by_year.csv", index=False)
    print(f"h2h_by_year: {len(by_year):,} rows (pair + year)")

    gs_finals_detail = h2h_grand_slam_finals_detail(m)
    if not gs_finals_detail.empty:
        gs_finals_detail.to_csv(OUT_DIR / "h2h_gs_finals_detail.csv", index=False)
        print(f"h2h_gs_finals_detail: {len(gs_finals_detail):,} individual finals")
    else:
        print("h2h_gs_finals_detail: no Grand Slam finals data available, skipped")

    print(f"\nSaved to {OUT_DIR}")


if __name__ == "__main__":
    main()