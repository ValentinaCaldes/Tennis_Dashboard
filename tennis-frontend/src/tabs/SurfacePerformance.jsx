import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";

const SURFACE_COLORS = { Hard: "#6C8CFF", Clay: "#F2A93C", Grass: "#2DD4BF" };
const HIGHLIGHT_COLOR = "#FFFFFF";
const SURFACES = ["Hard", "Clay", "Grass"];

const TOOLTIP_CONTENT_STYLE = {
  background: "#131A2C",
  border: "1px solid #1A2138",
  borderRadius: 8,
  color: "#E7EAF3",
};
const TOOLTIP_LABEL_STYLE = { color: "#8A93B3" };
const TOOLTIP_ITEM_STYLE = { color: "#E7EAF3" };

// Curated context notes for a few players -- purely a fun/human touch for
// the portfolio, not a data-driven metric. Quotes kept short (<15 words)
// and sourced, per copyright practice: paraphrase the context, quote only
// the short line itself, always link back to the original article.
const PLAYER_FUN_FACTS = {
  "Daniil Medvedev": {
    text: 'Medvedev has been famously vocal about disliking clay -- during a 2021 Rome Masters loss he muttered, "If you like to play in the dirt like a dog, then I don\'t judge."',
    url: "https://www.tennis.com/news/articles/daniil-medvedev-s-war-on-clay-continues-but-it-may-provide-him-an-advantage-down",
  },
  "Rafael Nadal": {
    text: "Nadal's roughly 91% career win rate on clay -- the highest of any player in the Open Era, built on 14 French Open titles -- is why the sport simply calls him the \"King of Clay.\"",
    url: "https://www.si.com/tennis/2016/05/24/daily-data-viz-rafael-nadal-atp-career-titles-clay",
  },
  "Roger Federer": {
    text: 'Despite growing up on clay, Federer has openly called grass his favorite surface, once telling a crowd, "As you might have heard, grass is my favorite surface."',
    url: "https://www.essentiallysports.com/atp-tennis-news-grass-is-my-favourite-surface-dr-roger-federer-brings-out-his-comical-side-to-entertain-scores-of-students-at-the-big-green/",
  },
  "Boris Becker": {
    text: 'Becker won Wimbledon in 1985 at just 17 -- still the youngest men\'s champion in tournament history, and unseeded at the time. Looking back, he\'s said: "I was still a child."',
    url: "https://gulfnews.com/sport/tennis/boris-becker-regrets-winning-wimbledon-as-a-teenager-1.500281932",
  },
};

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export default function SurfacePerformance({ data }) {
  const { players, playerSurfaceStatsByYear } = data;
  const [tourFilter, setTourFilter] = useState("ALL");
  const [minMatches, setMinMatches] = useState(15);
  const [nameQuery, setNameQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const tourByPlayer = useMemo(() => {
    const map = new Map();
    for (const p of players) map.set(p.player, p.tour);
    return map;
  }, [players]);

  const availableYears = useMemo(() => {
    const years = playerSurfaceStatsByYear.map((r) => r.year);
    return Array.from(new Set(years)).sort((a, b) => a - b);
  }, [playerSurfaceStatsByYear]);

  const [yearFrom, setYearFrom] = useState("ALL");
  const [yearTo, setYearTo] = useState("ALL");

  // Agregamos player+surface sumando matches/wins dentro del rango de anios
  // elegido (si "Todos", esto reproduce exactamente el total de carrera).
  const statsInRange = useMemo(() => {
    const filtered = playerSurfaceStatsByYear.filter((r) => {
      if (yearFrom !== "ALL" && r.year < Number(yearFrom)) return false;
      if (yearTo !== "ALL" && r.year > Number(yearTo)) return false;
      return true;
    });

    const key = (player, surface) => `${player}__${surface}`;
    const acc = new Map();
    for (const r of filtered) {
      const k = key(r.player, r.surface);
      const prev = acc.get(k) || { player: r.player, surface: r.surface, matches: 0, wins: 0 };
      prev.matches += r.matches;
      prev.wins += r.wins;
      acc.set(k, prev);
    }
    return Array.from(acc.values()).map((r) => ({
      ...r,
      win_rate: r.matches > 0 ? Math.round((r.wins / r.matches) * 1000) / 1000 : 0,
    }));
  }, [playerSurfaceStatsByYear, yearFrom, yearTo]);

  // Filtramos por tour y por un minimo de partidos en ESA superficie, para
  // que el ranking no se llene de jugadores con 2 partidos y 100% win rate.
  const eligibleRows = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return statsInRange.filter((r) => {
      if (r.matches < minMatches) return false;
      if (tourFilter !== "ALL" && tourByPlayer.get(r.player) !== tourFilter) return false;
      if (q && !r.player.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [statsInRange, minMatches, tourFilter, tourByPlayer, nameQuery]);

  const allPlayerNames = useMemo(
    () => Array.from(new Set(statsInRange.map((r) => r.player))).sort(),
    [statsInRange]
  );

  const topBySurface = useMemo(() => {
    const result = {};
    for (const surface of SURFACES) {
      result[surface] = eligibleRows
        .filter((r) => r.surface === surface)
        .sort((a, b) => b.win_rate - a.win_rate)
        .slice(0, 10)
        .map((r) => ({ ...r, shortName: r.player.split(" ").pop() }));
    }
    return result;
  }, [eligibleRows]);

  // Indice todo-terreno vs especialista: solo jugadores con datos
  // elegibles en las 3 superficies. gap = mejor - peor win rate.
  const versatilityIndex = useMemo(() => {
    const byPlayer = new Map();
    for (const r of eligibleRows) {
      if (!byPlayer.has(r.player)) byPlayer.set(r.player, {});
      byPlayer.get(r.player)[r.surface] = r.win_rate;
    }

    const rows = [];
    for (const [player, rates] of byPlayer) {
      if (SURFACES.every((s) => rates[s] !== undefined)) {
        const values = SURFACES.map((s) => rates[s]);
        const best = Math.max(...values);
        const worst = Math.min(...values);
        rows.push({ player, ...rates, gap: Math.round((best - worst) * 1000) / 1000 });
      }
    }
    return rows;
  }, [eligibleRows]);

  const mostBalanced = [...versatilityIndex].sort((a, b) => a.gap - b.gap).slice(0, 5);
  const mostSpecialized = [...versatilityIndex].sort((a, b) => b.gap - a.gap).slice(0, 5);

  const handleBarClick = (payload) => {
    if (!payload) return;
    setSelectedPlayer((prev) => (prev === payload.player ? null : payload.player));
  };

  const rowHighlightStyle = (player) =>
    player === selectedPlayer ? { background: "#16233A" } : undefined;

  return (
    <div>
      <div style={{ display: "flex", gap: 20, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Tour:</label>
          <select value={tourFilter} onChange={(e) => setTourFilter(e.target.value)}>
            <option value="ALL">ATP + WTA</option>
            <option value="ATP">ATP</option>
            <option value="WTA">WTA</option>
          </select>
        </div>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Min. matches on surface:</label>
          <select value={minMatches} onChange={(e) => setMinMatches(Number(e.target.value))}>
            <option value={5}>5+</option>
            <option value={15}>15+</option>
            <option value={30}>30+</option>
            <option value={50}>50+</option>
          </select>
        </div>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>From:</label>
          <select value={yearFrom} onChange={(e) => setYearFrom(e.target.value)}>
            <option value="ALL">All</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>To:</label>
          <select value={yearTo} onChange={(e) => setYearTo(e.target.value)}>
            <option value="ALL">All</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Search player:</label>
        <input
          type="text"
          list="surface-player-list"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Type a name..."
          style={{
            background: "#131A2C",
            border: "1px solid #1A2138",
            color: "#E7EAF3",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 13,
            width: 220,
          }}
        />
        <datalist id="surface-player-list">
          {allPlayerNames.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        {selectedPlayer && (
          <button
            onClick={() => setSelectedPlayer(null)}
            style={{
              marginLeft: 10, fontSize: 11, color: "#8A93B3", background: "transparent",
              border: "1px solid #1A2138", borderRadius: 6, padding: "5px 10px", cursor: "pointer",
            }}
          >
            Clear highlight: {selectedPlayer} ✕
          </button>
        )}
      </div>

      {selectedPlayer && PLAYER_FUN_FACTS[selectedPlayer] && (
        <div
          style={{
            background: "#16233A",
            border: "1px solid #2DD4BF",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "#E7EAF3",
          }}
        >
          {PLAYER_FUN_FACTS[selectedPlayer].text}{" "}
          <a
            href={PLAYER_FUN_FACTS[selectedPlayer].url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#2DD4BF" }}
          >
            (source)
          </a>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard label="Eligible on Any Surface" value={new Set(eligibleRows.map((r) => r.player)).size} accent="#2DD4BF" />
        <KpiCard label="Eligible on All 3 Surfaces" value={versatilityIndex.length} accent="#6C8CFF" />
        <KpiCard
          label="Most All-Court"
          value={mostBalanced[0]?.player.split(" ").pop() ?? "—"}
          unit={mostBalanced[0] ? `gap ${fmtPct(mostBalanced[0].gap)}` : ""}
          accent="#B18CFF"
        />
        <KpiCard
          label="Most Specialized"
          value={mostSpecialized[0]?.player.split(" ").pop() ?? "—"}
          unit={mostSpecialized[0] ? `gap ${fmtPct(mostSpecialized[0].gap)}` : ""}
          accent="#FB5B5B"
        />
      </div>

      <SectionLabel>Top 10 by Surface (min. {minMatches} matches)</SectionLabel>
      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        Click a bar to highlight that player across all three charts and the tables below.
      </p>
      <div className="chart-grid">
        {SURFACES.map((surface) => (
          <ChartCard key={surface} title={`Top 10 — ${surface}`} span2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topBySurface[surface]} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} />
                <YAxis type="category" dataKey="shortName" width={110} tick={{ fontSize: 12 }} />
                <Tooltip
                  cursor={false}
                  formatter={(v) => fmtPct(v)}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.player ?? ""}
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
                <Bar
                  dataKey="win_rate"
                  radius={[0, 4, 4, 0]}
                  onClick={(payload) => handleBarClick(payload)}
                  style={{ cursor: "pointer" }}
                >
                  {topBySurface[surface].map((r, i) => (
                    <Cell
                      key={i}
                      fill={r.player === selectedPlayer ? HIGHLIGHT_COLOR : SURFACE_COLORS[surface]}
                      stroke={r.player === selectedPlayer ? SURFACE_COLORS[surface] : "none"}
                      strokeWidth={2}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}
      </div>

      <SectionLabel>All-Court vs. Specialist</SectionLabel>
      <p style={{ fontSize: 12, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        Gap = win rate on best surface minus win rate on worst surface. Smaller gap = more
        all-court; larger gap = more surface-dependent. Only players with {minMatches}+ matches
        on all three surfaces (within the selected date range) are included.
      </p>
      <div className="chart-grid">
        <ChartCard title="Most All-Court" sub="Smallest gap between best and worst surface">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#8A93B3", textAlign: "left" }}>
                <th style={{ padding: "4px 0" }}>Player</th>
                <th>Hard</th>
                <th>Clay</th>
                <th>Grass</th>
                <th>Gap</th>
              </tr>
            </thead>
            <tbody>
              {mostBalanced.map((r) => (
                <tr key={r.player} style={{ borderTop: "1px solid #1A2138", ...rowHighlightStyle(r.player) }}>
                  <td style={{ padding: "6px 0" }}>{r.player}</td>
                  <td>{fmtPct(r.Hard)}</td>
                  <td>{fmtPct(r.Clay)}</td>
                  <td>{fmtPct(r.Grass)}</td>
                  <td>{fmtPct(r.gap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>

        <ChartCard title="Most Specialized" sub="Largest gap between best and worst surface">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#8A93B3", textAlign: "left" }}>
                <th style={{ padding: "4px 0" }}>Player</th>
                <th>Hard</th>
                <th>Clay</th>
                <th>Grass</th>
                <th>Gap</th>
              </tr>
            </thead>
            <tbody>
              {mostSpecialized.map((r) => (
                <tr key={r.player} style={{ borderTop: "1px solid #1A2138", ...rowHighlightStyle(r.player) }}>
                  <td style={{ padding: "6px 0" }}>{r.player}</td>
                  <td>{fmtPct(r.Hard)}</td>
                  <td>{fmtPct(r.Clay)}</td>
                  <td>{fmtPct(r.Grass)}</td>
                  <td>{fmtPct(r.gap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ChartCard>
      </div>

      <p className="footnote">
        Rankings are limited to players with the selected minimum number of charted matches on
        that surface, to avoid small-sample outliers (e.g. a player who is 2-0 on grass showing
        as a "100% win rate specialist"). A highlighted player only appears colored on a chart if
        they rank in that surface's top 10 -- otherwise the highlight has nothing to show there.
        Coverage reflects the Match Charting Project dataset, not the full tour.
      </p>
    </div>
  );
}