"""
01_fetch_atp_matches.py

Reads Jeff Sackmann's official season-results datasets (tennis_atp /
tennis_wta -- match-level results with serve stats, NOT point-by-point)
from a local mirror, consolidates them into a single DataFrame, and
saves the result to data/atp_matches_raw.csv

We switched to this source from the Match Charting Project because MCP
only covers a hand-picked subset of matches (volunteers choosing what
to chart) -- check_gs_coverage.py showed top players missing 13-23% of
their real Grand Slam titles in that dataset. This source is Sackmann's
own maintained results database: near-complete official results, with
match-level serve/return stats (aces, double faults, 1st serve %, break
points) for most matches from the early 1990s onward. It does NOT have
shot-by-shot / point-by-point detail -- that tradeoff is why we don't
need to derive the winner from points anymore, the winner is given
directly.

Also filters out players with fewer than MIN_MATCHES total appearances
(as winner or loser, across the whole fetched date range) -- moved here
from 05_export_dashboard_json.py so that EVERY downstream script (Elo,
H2H, match load) works on the smaller, relevant dataset too, instead of
only the final JSON export. A match is kept if AT LEAST ONE of the two
players qualifies -- not both -- so a top player's matches against a
lower-ranked opponent aren't dropped from their own career record (that
would silently undercount their real matches played / win rate).

Expects a local folder with this structure (an archival mirror or a
clone of the original repos both work, as long as the folder layout and
column names match):
    <source_dir>/atp/atp_matches_YYYY.csv
    <source_dir>/wta/wta_matches_YYYY.csv   (optional, skipped if absent)

Usage:
    python 01_fetch_atp_matches.py --source-dir "/path/to/tennis-sackmann-archive"
    python 01_fetch_atp_matches.py --source-dir "/path/to/tennis-sackmann-archive" --start-year 2000
    python 01_fetch_atp_matches.py --min-matches 30
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DEFAULT_SOURCE_DIR = Path(__file__).resolve().parent / "tennis-sackmann-archive-main"
DEFAULT_MIN_MATCHES = 50

# subfolder -> (tour label, filename prefix)
TOURS = {
    "atp": ("ATP", "atp_matches_"),
    "wta": ("WTA", "wta_matches_"),
}

# Sackmann's column names -> what the rest of the pipeline expects.
# Most names are already identical; only "round" needs capitalizing to
# match what 04_compute_match_load.py looks for.
RENAME_COLS = {"round": "Round", "best_of": "Best of"}

# tourney_level and minutes are needed for head-to-head extras (longest
# match duration, Grand Slam finals count) computed in 03_compute_h2h.py.
# tourney_level == "G" identifies Grand Slams specifically (more robust
# than matching on tourney_name strings, which vary -- "Roland Garros" vs
# "French Open" depending on the source year).
KEEP_COLS = (
    ["tourney_id", "tourney_name", "tourney_level", "surface", "tourney_date", "Round",
     "Best of", "minutes", "winner_name", "loser_name", "winner_rank", "loser_rank"]
    + [f"{p}_{v}" for p in "wl" for v in ["ace", "df", "svpt", "1stIn", "1stWon", "2ndWon", "bpSaved", "bpFaced"]]
)


def load_tour(source_dir: Path, folder: str, prefix: str, start_year: int, end_year: int) -> pd.DataFrame:
    tour_dir = source_dir / folder
    files = sorted(tour_dir.glob(f"{prefix}*.csv")) if tour_dir.exists() else []
    frames = []
    for path in files:
        # filename is like "atp_matches_2023.csv" -- pull the year back out
        try:
            year = int(path.stem.replace(prefix, ""))
        except ValueError:
            continue
        if year < start_year or year > end_year:
            continue
        df = pd.read_csv(path, low_memory=False)
        df["source_year"] = year
        frames.append(df)

    if not frames:
        return pd.DataFrame()

    matches = pd.concat(frames, ignore_index=True)
    print(f"  {folder}: {len(matches):,} matches from {len(frames)} file(s)")
    return matches


def filter_by_min_matches(matches: pd.DataFrame, min_matches: int) -> pd.DataFrame:
    """Keeps a match if at least one of the two players has >= min_matches
    total appearances (winner + loser) across the whole fetched dataset.
    Counts across ATP and WTA together, since a player only ever shows up
    under one tour label in practice."""
    if matches.empty or min_matches <= 0:
        return matches

    counts = pd.concat([matches["winner_name"], matches["loser_name"]]).value_counts()
    qualified = set(counts[counts >= min_matches].index)

    before_matches, before_players = len(matches), counts.size
    keep_mask = matches["winner_name"].isin(qualified) | matches["loser_name"].isin(qualified)
    filtered = matches[keep_mask].reset_index(drop=True)

    print(
        f"  min-matches filter (>= {min_matches}): {before_players:,} players -> "
        f"{len(qualified):,} qualified; {before_matches:,} matches -> {len(filtered):,} matches kept"
    )
    return filtered


def load_current_ranking(source_dir: Path, folder: str, tour_label: str) -> pd.DataFrame:
    """Cross-references <folder>_players.csv (player_id -> name) with
    <folder>_rankings_current.csv (player_id -> rank/points) to get each
    player's current official ranking. Returns empty if either file is
    missing (not every mirror/clone includes them)."""
    players_path = source_dir / folder / f"{folder}_players.csv"
    rankings_path = source_dir / folder / f"{folder}_rankings_current.csv"
    if not players_path.exists() or not rankings_path.exists():
        print(f"  {folder}: no players/rankings files found, skipping current ranking")
        return pd.DataFrame()

    players = pd.read_csv(players_path, low_memory=False)
    players["player"] = (
        players["name_first"].fillna("") + " " + players["name_last"].fillna("")
    ).str.strip()

    rankings = pd.read_csv(rankings_path, low_memory=False)
    rankings = rankings.rename(columns={"player": "player_id"})
    # Keep the most recent snapshot per player, just in case the "current"
    # file has more than one date in it.
    rankings = rankings.sort_values("ranking_date").drop_duplicates(subset="player_id", keep="last")

    merged = rankings.merge(players[["player_id", "player"]], on="player_id", how="inner")
    merged = merged.rename(columns={"rank": "current_rank", "points": "current_rank_points"})
    merged["tour"] = tour_label
    print(f"  {folder}: {len(merged):,} players with a current ranking")
    return merged[["player", "tour", "current_rank", "current_rank_points", "ranking_date"]]


def main(source_dir: Path, start_year: int, end_year: int, min_matches: int):
    if not source_dir.exists():
        print(f"Folder {source_dir} does not exist.", file=sys.stderr)
        sys.exit(1)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Reading official results from {source_dir}...")

    frames = []
    for folder, (tour_label, prefix) in TOURS.items():
        tour_matches = load_tour(source_dir, folder, prefix, start_year, end_year)
        if tour_matches.empty:
            print(f"  {folder}: nothing found (skipped)")
            continue
        tour_matches["tour"] = tour_label
        frames.append(tour_matches)

    if not frames:
        print(
            f"No atp_matches_YYYY.csv or wta_matches_YYYY.csv files found under {source_dir}.\n"
            "  Check that this points at the archive folder that CONTAINS the atp/ and wta/ subfolders.",
            file=sys.stderr,
        )
        sys.exit(1)

    matches = pd.concat(frames, ignore_index=True)
    matches = matches.rename(columns=RENAME_COLS)
    matches["match_date"] = pd.to_datetime(matches["tourney_date"].astype(str), format="%Y%m%d", errors="coerce")

    print(f"\nApplying player filter...")
    matches = filter_by_min_matches(matches, min_matches)

    keep = ["tour", "match_date"] + [c for c in KEEP_COLS if c in matches.columns]
    matches = matches[keep]

    out_path = DATA_DIR / "atp_matches_raw.csv"
    matches.to_csv(out_path, index=False)
    print(f"\nTotal: {len(matches):,} matches saved to {out_path}")

    print("\nReading current official rankings...")
    ranking_frames = []
    for folder, (tour_label, _) in TOURS.items():
        r = load_current_ranking(source_dir, folder, tour_label)
        if not r.empty:
            ranking_frames.append(r)

    if ranking_frames:
        rankings = pd.concat(ranking_frames, ignore_index=True)
        rankings_out_path = DATA_DIR / "player_current_rank.csv"
        rankings.to_csv(rankings_out_path, index=False)
        print(f"Total: {len(rankings):,} players' current rankings saved to {rankings_out_path}")
    else:
        print("No current ranking files found -- skipping (winner_rank/loser_rank per match are still saved above).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-dir",
        type=str,
        default=str(DEFAULT_SOURCE_DIR),
        help="Local folder containing atp/ and wta/ subfolders with atp_matches_YYYY.csv / wta_matches_YYYY.csv "
        f"[default: {DEFAULT_SOURCE_DIR}]",
    )
    parser.add_argument("--start-year", type=int, default=1990)
    parser.add_argument("--end-year", type=int, default=2026)
    parser.add_argument(
        "--min-matches", type=int, default=DEFAULT_MIN_MATCHES,
        help="Minimum career appearances (as winner+loser, within the fetched "
             "date range) for AT LEAST ONE player in a match for that match to "
             "be kept. Set to 0 to disable filtering. Default: %(default)s.",
    )
    args = parser.parse_args()
    main(Path(args.source_dir), args.start_year, args.end_year, args.min_matches)