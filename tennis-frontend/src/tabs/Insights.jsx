import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";

const ELO_COLOR = "#2DD4BF";
const ALL_COURT_COLOR = "#6C8CFF";
const SPECIALIST_COLOR = "#FB5B5B";

const TOOLTIP_CONTENT_STYLE = {
  background: "#131A2C",
  border: "1px solid #1A2138",
  borderRadius: 8,
  color: "#E7EAF3",
};
const TOOLTIP_LABEL_STYLE = { color: "#8A93B3" };
const TOOLTIP_ITEM_STYLE = { color: "#E7EAF3" };

// Mismo piso que Surface Performance: minimo de partidos EN esa
// superficie especifica para que cuente, asi ningun "gap" de 100% sale
// de una muestra de 2 partidos.
const MIN_MATCHES_PER_SURFACE = 15;
// Top N de cada leaderboard/lista chica de esta pestana.
const TOP_N = 10;
// Sanity cap para "partido mas largo" en minutos -- el record real es
// Isner-Mahut (Wimbledon 2010, 665 min = 11h 5m). Esto es una defensa
// extra ademas del filtro que ya aplica 03_compute_h2h.py: si algun dia
// se corre 05 con un h2h_overall.csv viejo/sin ese fix, esto evita que
// un valor corrupto (vimos un caso real de "2475 minutos" = 41 horas en
// la fuente) se muestre como si fuera un record valido.
const MAX_PLAUSIBLE_MATCH_MINUTES = 700;

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function shortName(name) {
  return name ? name.split(" ").pop() : "—";
}

export default function Insights({ data }) {
  const { players, eloCurrent, eloHistory, playerSurfaceStatsByYear, playerTitles, h2hOverall, currentRanking } = data;
  const [tourFilter, setTourFilter] = useState("ALL");
  const tourLabel = tourFilter === "ALL" ? "ATP + WTA" : tourFilter;

  const tourByPlayer = useMemo(() => {
    const map = new Map();
    for (const p of players) map.set(p.player, p.tour);
    return map;
  }, [players]);

  // --- Elo Leaderboard ---------------------------------------------
  const eloLeaderboard = useMemo(() => {
    return eloCurrent
      .filter((r) => tourFilter === "ALL" || r.tour === tourFilter)
      .slice()
      .sort((a, b) => b.elo - a.elo)
      .slice(0, TOP_N)
      .map((r) => ({ ...r, shortName: shortName(r.player) }));
  }, [eloCurrent, tourFilter]);

  const peakEloEver = useMemo(() => {
    const filtered = tourFilter === "ALL" ? eloHistory : eloHistory.filter((r) => tourByPlayer.get(r.player) === tourFilter);
    if (!filtered.length) return null;
    return filtered.reduce((best, r) => (!best || r.elo > best.elo ? r : best), null);
  }, [eloHistory, tourByPlayer, tourFilter]);

  // --- Surface Specialists -------------------------------------------
  // Agregamos playerSurfaceStatsByYear a nivel de carrera completa (sumamos
  // todos los anios) para tener win rate por superficie de cada jugador,
  // igual que hace Surface Performance -- pero aca solo nos interesan los
  // extremos (mas todo-terreno / mas especializado), no el ranking entero.
  const surfaceGaps = useMemo(() => {
    const bySurface = new Map(); // player -> Map(surface -> {matches, wins})
    for (const r of playerSurfaceStatsByYear) {
      if (!bySurface.has(r.player)) bySurface.set(r.player, new Map());
      const surfaces = bySurface.get(r.player);
      const prev = surfaces.get(r.surface) || { matches: 0, wins: 0 };
      surfaces.set(r.surface, { matches: prev.matches + r.matches, wins: prev.wins + r.wins });
    }

    const out = [];
    for (const [player, surfaces] of bySurface) {
      const rates = [];
      for (const [surface, { matches, wins }] of surfaces) {
        if (matches >= MIN_MATCHES_PER_SURFACE) {
          rates.push({ surface, win_rate: wins / matches });
        }
      }
      if (rates.length < 3) continue; // necesita las 3 superficies con muestra suficiente
      const best = rates.reduce((a, b) => (b.win_rate > a.win_rate ? b : a));
      const worst = rates.reduce((a, b) => (b.win_rate < a.win_rate ? b : a));
      out.push({
        player,
        shortName: shortName(player),
        gap: best.win_rate - worst.win_rate,
        bestSurface: best.surface,
        bestRate: best.win_rate,
        worstSurface: worst.surface,
        worstRate: worst.win_rate,
      });
    }
    return out;
  }, [playerSurfaceStatsByYear]);

  // Ambas listas se limitan a jugadores en el top 20 del ranking oficial
  // ACTUAL (ATP o WTA, cada uno dentro del suyo) -- sin esto, salian
  // nombres de archivo sin relevancia actual (ej. jugadores retirados
  // hace anios) simplemente porque su carrera entera fue muy pareja o
  // muy dispareja entre superficies.
  const TOP_N_CURRENT_FOR_SPECIALISTS = 20;
  const currentTop20 = useMemo(() => {
    const tours = tourFilter === "ALL" ? ["ATP", "WTA"] : [tourFilter];
    return new Set(
      currentRanking.filter((r) => tours.includes(r.tour) && r.current_rank <= TOP_N_CURRENT_FOR_SPECIALISTS).map((r) => r.player)
    );
  }, [currentRanking, tourFilter]);

  const mostAllCourt = useMemo(
    () => [...surfaceGaps].filter((r) => currentTop20.has(r.player)).sort((a, b) => a.gap - b.gap).slice(0, 5),
    [surfaceGaps, currentTop20]
  );
  const mostSpecialized = useMemo(
    () => [...surfaceGaps].filter((r) => currentTop20.has(r.player)).sort((a, b) => b.gap - a.gap).slice(0, 5),
    [surfaceGaps, currentTop20]
  );

  // --- Notable Findings (calculadas en vivo sobre h2hOverall) --------
  // --- Titles won by the current Top 10 (del tour elegido) -----------
  const currentTop10Pool = useMemo(() => {
    const tours = tourFilter === "ALL" ? ["ATP", "WTA"] : [tourFilter];
    return new Set(
      currentRanking.filter((r) => tours.includes(r.tour) && r.current_rank <= 10).map((r) => r.player)
    );
  }, [currentRanking, tourFilter]);

  const tourneyAvailableYears = useMemo(() => {
    const years = playerTitles.map((r) => r.year);
    return Array.from(new Set(years)).sort((a, b) => a - b);
  }, [playerTitles]);

  const [tourneyYearFrom, setTourneyYearFrom] = useState("ALL");
  const [tourneyYearTo, setTourneyYearTo] = useState("ALL");

  // Titulos reales (gano la final de esa edicion), no solo "buen win
  // rate" -- filtrados al top 10 actual y al rango de anios elegido.
  const titlesInRange = useMemo(() => {
    return playerTitles.filter((r) => {
      if (!currentTop10Pool.has(r.player)) return false;
      if (tourneyYearFrom !== "ALL" && r.year < Number(tourneyYearFrom)) return false;
      if (tourneyYearTo !== "ALL" && r.year > Number(tourneyYearTo)) return false;
      return true;
    });
  }, [playerTitles, currentTop10Pool, tourneyYearFrom, tourneyYearTo]);

  // Un color estable por torneo (por orden de aparicion en el rango
  // elegido), asi el mismo torneo se ve siempre del mismo color si
  // aparece para mas de un jugador -- para detectar de un vistazo si
  // dos del top 10 ganaron el mismo torneo en el mismo periodo.
  const TOURNEY_PALETTE = ["#2DD4BF", "#6C8CFF", "#F2A93C", "#B18CFF", "#FB5B5B", "#4ADE80", "#F472B6", "#38BDF8", "#FACC15", "#A78BFA"];
  const tourneyColorMap = useMemo(() => {
    const map = new Map();
    for (const r of titlesInRange) {
      if (!map.has(r.tourney_name)) map.set(r.tourney_name, TOURNEY_PALETTE[map.size % TOURNEY_PALETTE.length]);
    }
    return map;
  }, [titlesInRange]);

  // Lista de titulos (ordenados por anio) para CADA jugador del top 10
  // actual, en orden de ranking -- incluye a los que no ganaron nada en
  // el rango elegido, para que el listado siempre muestre a los 10.
  const titlesByPlayer = useMemo(() => {
    const byPlayer = new Map();
    for (const r of titlesInRange) {
      if (!byPlayer.has(r.player)) byPlayer.set(r.player, []);
      byPlayer.get(r.player).push(r);
    }
    for (const list of byPlayer.values()) list.sort((a, b) => a.year - b.year);

    const rankByPlayer = new Map(currentRanking.map((r) => [r.player, r.current_rank]));
    return Array.from(currentTop10Pool)
      .map((player) => ({ player, shortName: shortName(player), titles: byPlayer.get(player) || [] }))
      .sort((a, b) => rankByPlayer.get(a.player) - rankByPlayer.get(b.player));
  }, [titlesInRange, currentTop10Pool, currentRanking]);

  // h2hOverall filtrado por tour -- los pares nunca cruzan ATP/WTA en
  // los datos (no juegan entre si), asi que alcanza con chequear el
  // tour de player_a para saber el del par entero.
  const h2hScoped = useMemo(() => {
    if (tourFilter === "ALL") return h2hOverall;
    return h2hOverall.filter((r) => tourByPlayer.get(r.player_a) === tourFilter);
  }, [h2hOverall, tourByPlayer, tourFilter]);

  const biggestRivalry = useMemo(() => {
    if (!h2hScoped.length) return null;
    return h2hScoped.reduce((best, r) => (!best || r.total_matches > best.total_matches ? r : best), null);
  }, [h2hScoped]);

  const longestMatchOverall = useMemo(() => {
    const timed = h2hScoped.filter(
      (r) =>
        r.longest_match_minutes !== null &&
        r.longest_match_minutes !== undefined &&
        r.longest_match_minutes <= MAX_PLAUSIBLE_MATCH_MINUTES
    );
    if (!timed.length) return null;
    return timed.reduce((best, r) => (r.longest_match_minutes > best.longest_match_minutes ? r : best));
  }, [h2hScoped]);

  const mostSlamFinalsRivalry = useMemo(() => {
    const withFinals = h2hScoped.filter((r) => r.gs_finals > 0);
    if (!withFinals.length) return null;
    return withFinals.reduce((best, r) => (r.gs_finals > best.gs_finals ? r : best));
  }, [h2hScoped]);

  return (
    <div>
      <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ fontSize: 12, color: "#8A93B3" }}>Tour:</label>
          <select value={tourFilter} onChange={(e) => setTourFilter(e.target.value)}>
            <option value="ALL">ATP + WTA</option>
            <option value="ATP">ATP</option>
            <option value="WTA">WTA</option>
          </select>
          <span style={{ fontSize: 11, color: "#8A93B3" }}>(applies to every chart on this page)</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div>
            <label style={{ marginRight: 6, fontSize: 11, color: "#8A93B3" }}>From:</label>
            <select value={tourneyYearFrom} onChange={(e) => setTourneyYearFrom(e.target.value)}>
              <option value="ALL">All</option>
              {tourneyAvailableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ marginRight: 6, fontSize: 11, color: "#8A93B3" }}>To:</label>
            <select value={tourneyYearTo} onChange={(e) => setTourneyYearTo(e.target.value)}>
              <option value="ALL">All</option>
              {tourneyAvailableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <span style={{ fontSize: 11, color: "#8A93B3" }}>(applies to Titles Won below)</span>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Peak Elo Ever Recorded"
          value={peakEloEver ? Math.round(peakEloEver.elo) : "—"}
          unit={peakEloEver ? `${shortName(peakEloEver.player)} · ${fmtDate(peakEloEver.date)}` : ""}
          accent={ELO_COLOR}
        />
        <KpiCard
          label="Most Contested Rivalry"
          value={biggestRivalry ? `${shortName(biggestRivalry.player_a)} vs ${shortName(biggestRivalry.player_b)}` : "—"}
          unit={biggestRivalry ? `${biggestRivalry.total_matches} meetings` : ""}
          accent="#F2A93C"
        />
        <KpiCard
          label="Longest Match on Record"
          value={longestMatchOverall ? fmtDuration(longestMatchOverall.longest_match_minutes) : "—"}
          unit={
            longestMatchOverall
              ? `${shortName(longestMatchOverall.player_a)} vs ${shortName(longestMatchOverall.player_b)} · ${longestMatchOverall.longest_match_surface}`
              : ""
          }
          accent="#B18CFF"
        />
        <KpiCard
          label="Most Grand Slam Finals (single rivalry)"
          value={mostSlamFinalsRivalry ? mostSlamFinalsRivalry.gs_finals : "—"}
          unit={
            mostSlamFinalsRivalry
              ? `${shortName(mostSlamFinalsRivalry.player_a)} ${mostSlamFinalsRivalry.gs_finals_a_wins}-${mostSlamFinalsRivalry.gs_finals_b_wins} ${shortName(mostSlamFinalsRivalry.player_b)}`
              : ""
          }
          accent="#FB5B5B"
        />
      </div>

      <SectionLabel>Elo Leaderboard</SectionLabel>
      <ChartCard title={`Top ${TOP_N} by Elo Rating`} sub="Custom rating calculated match by match (K=32, base 1500), not the official ranking" span2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={eloLeaderboard} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" horizontal={false} />
            <XAxis type="number" domain={["dataMin - 50", "dataMax + 50"]} tickFormatter={(v) => Math.round(v)} />
            <YAxis type="category" dataKey="shortName" width={110} tick={{ fontSize: 12 }} />
            <Tooltip
              cursor={false}
              formatter={(v) => Math.round(v)}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.player ?? ""}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <Bar dataKey="elo" fill={ELO_COLOR} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <SectionLabel>Best Tournaments — Current {tourLabel} Top 10</SectionLabel>
      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        Titles actually won (finals won, not just win rate) by each current ATP top 10 player,
        within the selected years -- color = tournament, so the same event lights up the same
        color if more than one of them won it.
      </p>
      <ChartCard
        title="Titles Won by the Current Top 10"
        sub={
          currentTop10Pool.size
            ? `Current ${tourLabel} top 10 (${currentTop10Pool.size} players with a Top 10 ranking today)`
            : "No current ATP top 10 players found in this dataset"
        }
        span2
      >
        {titlesByPlayer.every((p) => p.titles.length === 0) ? (
          <p style={{ color: "#8A93B3", padding: 16 }}>No titles for the current top 10 in this range.</p>
        ) : (
          <div>
            {titlesByPlayer.map((p, i) => (
              <div
                key={p.player}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 4px",
                  borderBottom: i < titlesByPlayer.length - 1 ? "1px solid #1A2138" : "none",
                }}
              >
                <span style={{ color: "#E7EAF3", fontSize: 13, width: 90, flexShrink: 0 }}>{p.shortName}</span>
                {p.titles.length === 0 ? (
                  <span style={{ color: "#8A93B3", fontSize: 12 }}>No titles in this period</span>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {p.titles.map((t, j) => (
                      <span
                        key={j}
                        style={{
                          fontSize: 11, color: "#0B0F1A", fontWeight: 600, padding: "3px 8px",
                          borderRadius: 12, background: tourneyColorMap.get(t.tourney_name),
                        }}
                      >
                        {t.tourney_name} '{String(t.year).slice(-2)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ChartCard>

      <SectionLabel>Surface Specialists</SectionLabel>
      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        Gap = win rate on best surface minus win rate on worst surface, career-wide. Limited to
        players in the current {tourLabel} top {TOP_N_CURRENT_FOR_SPECIALISTS} with {MIN_MATCHES_PER_SURFACE}+
        matches on all three surfaces.
      </p>
      <div className="chart-grid">
        <ChartCard title="Most All-Court" sub="Smallest gap between best and worst surface" span2>
          {mostAllCourt.length === 0 ? (
            <p style={{ color: "#8A93B3", padding: 16 }}>Not enough data yet.</p>
          ) : (
            <div>
              {mostAllCourt.map((r, i) => (
                <div
                  key={r.player}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 4px", borderBottom: i < mostAllCourt.length - 1 ? "1px solid #1A2138" : "none",
                  }}
                >
                  <span style={{ color: "#E7EAF3", fontSize: 13 }}>
                    <span style={{ color: "#8A93B3", marginRight: 8 }}>#{i + 1}</span>
                    {r.player}
                  </span>
                  <span style={{ color: ALL_COURT_COLOR, fontSize: 13, fontWeight: 600 }}>
                    {fmtPct(r.gap)} gap
                  </span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="Most Specialized" sub="Largest gap between best and worst surface" span2>
          {mostSpecialized.length === 0 ? (
            <p style={{ color: "#8A93B3", padding: 16 }}>Not enough data yet.</p>
          ) : (
            <div>
              {mostSpecialized.map((r, i) => (
                <div
                  key={r.player}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 4px", borderBottom: i < mostSpecialized.length - 1 ? "1px solid #1A2138" : "none",
                  }}
                >
                  <span style={{ color: "#E7EAF3", fontSize: 13 }}>
                    <span style={{ color: "#8A93B3", marginRight: 8 }}>#{i + 1}</span>
                    {r.player}
                  </span>
                  <span style={{ color: SPECIALIST_COLOR, fontSize: 13, fontWeight: 600 }}>
                    {fmtPct(r.gap)} gap · {r.bestSurface} {fmtPct(r.bestRate)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <p className="footnote">
        Elo is a custom rating calculated match by match (K=32, base 1500), not the official
        ATP/WTA ranking. All figures on this page are computed live from the same filtered
        dataset used across the rest of the dashboard (ATP Tour-level matches, Jeff Sackmann's
        official results archive).
      </p>
    </div>
  );
}