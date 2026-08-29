import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";

const PALETTE = ["#2DD4BF", "#6C8CFF", "#F2A93C", "#B18CFF", "#FB5B5B"];
const SURFACE_COLORS = { Hard: "#6C8CFF", Clay: "#F2A93C", Grass: "#2DD4BF" };

// Estilo compartido para los tooltips de Recharts, para que combinen con
// el tema oscuro del dashboard en vez del blanco default.
const TOOLTIP_CONTENT_STYLE = {
  background: "#131A2C",
  border: "1px solid #1A2138",
  borderRadius: 8,
  color: "#E7EAF3",
};
const TOOLTIP_LABEL_STYLE = { color: "#8A93B3" };
const TOOLTIP_ITEM_STYLE = { color: "#E7EAF3" };

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtNum(v, decimals = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(decimals);
}

export default function PlayerOverview({ data }) {
  const { players, eloCurrent, eloHistory, playerSurfaceStatsByYear } = data;
  const [tourFilter, setTourFilter] = useState("ALL");

  const filteredPlayers = useMemo(() => {
    if (tourFilter === "ALL") return players;
    return players.filter((p) => p.tour === tourFilter);
  }, [players, tourFilter]);

  const [selected, setSelected] = useState(filteredPlayers?.[0]?.player ?? "");

  // Si cambia el filtro ATP/WTA y el jugador seleccionado ya no esta en
  // la lista filtrada, saltamos al primero de la nueva lista.
  React.useEffect(() => {
    if (filteredPlayers.length && !filteredPlayers.some((p) => p.player === selected)) {
      setSelected(filteredPlayers[0].player);
    }
  }, [filteredPlayers, selected]);

  const eloRow = useMemo(
    () => eloCurrent.find((r) => r.player === selected),
    [eloCurrent, selected]
  );

  const eloTrendFull = useMemo(() => {
    return eloHistory
      .filter((r) => r.player === selected)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [eloHistory, selected]);

  const availableYears = useMemo(() => {
    const years = eloTrendFull.map((r) => new Date(r.date).getFullYear());
    return Array.from(new Set(years)).sort((a, b) => a - b);
  }, [eloTrendFull]);

  const [yearFrom, setYearFrom] = useState("ALL");
  const [yearTo, setYearTo] = useState("ALL");

  // Si cambia el jugador y el rango de anios elegido ya no tiene sentido
  // para su historial, lo reseteamos a "todos".
  React.useEffect(() => {
    setYearFrom("ALL");
    setYearTo("ALL");
  }, [selected]);

  const eloTrend = useMemo(() => {
    const filtered = eloTrendFull.filter((r) => {
      const y = new Date(r.date).getFullYear();
      if (yearFrom !== "ALL" && y < Number(yearFrom)) return false;
      if (yearTo !== "ALL" && y > Number(yearTo)) return false;
      return true;
    });

    // Agrupamos por trimestre (tomamos el ultimo Elo de cada trimestre)
    // para que el eje X sea legible -- un partido por partido queda
    // ilegible cuando hay muchos años de historial.
    const byQuarter = new Map();
    for (const row of filtered) {
      const d = new Date(row.date);
      const q = Math.floor(d.getMonth() / 3) + 1;
      const label = `${d.getFullYear()} Q${q}`;
      byQuarter.set(label, row.elo); // se sobre-escribe -> queda el ultimo del trimestre
    }
    return Array.from(byQuarter, ([quarter, elo]) => ({ quarter, elo }));
  }, [eloTrendFull, yearFrom, yearTo]);

  // Version filtrada por año (mismo rango que el filtro Desde/Hasta), usada
  // tanto para el grafico de superficie como para los KPIs de arriba
  // (Partidos jugados, Win Rate, Mejor superficie) -- todo el tab responde
  // al mismo rango de fechas.
  const surfaceRowsFiltered = useMemo(() => {
    const rows = playerSurfaceStatsByYear.filter((r) => {
      if (r.player !== selected) return false;
      if (yearFrom !== "ALL" && r.year < Number(yearFrom)) return false;
      if (yearTo !== "ALL" && r.year > Number(yearTo)) return false;
      return true;
    });

    const bySurface = new Map();
    for (const row of rows) {
      const prev = bySurface.get(row.surface) || { matches: 0, wins: 0 };
      bySurface.set(row.surface, {
        matches: prev.matches + row.matches,
        wins: prev.wins + row.wins,
      });
    }

    return Array.from(bySurface, ([surface, { matches, wins }]) => ({
      surface,
      matches,
      wins,
      win_rate: matches > 0 ? Math.round((wins / matches) * 1000) / 1000 : 0,
    }));
  }, [playerSurfaceStatsByYear, selected, yearFrom, yearTo]);

  const totalMatches = surfaceRowsFiltered.reduce((sum, r) => sum + r.matches, 0);
  const totalWins = surfaceRowsFiltered.reduce((sum, r) => sum + r.wins, 0);
  const careerWinRate = totalMatches > 0 ? totalWins / totalMatches : null;
  const bestSurface = surfaceRowsFiltered.length
    ? surfaceRowsFiltered.reduce((a, b) => (b.win_rate > a.win_rate ? b : a))
    : null;

  const eloRank = eloCurrent.findIndex((r) => r.player === selected) + 1;

  return (
    <div>
      <div className="player-select-row" style={{ marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Tour:</label>
          <select value={tourFilter} onChange={(e) => setTourFilter(e.target.value)}>
            <option value="ALL">ATP + WTA</option>
            <option value="ATP">ATP</option>
            <option value="WTA">WTA</option>
          </select>
        </div>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Player:</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {filteredPlayers.map((p) => (
              <option key={p.player} value={p.player}>
                {p.player}{p.tour ? ` (${p.tour})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Elo Rating" value={eloRow ? fmtNum(eloRow.elo, 0) : "—"} accent="#2DD4BF" />
        <KpiCard label="Elo Ranking (dataset)" value={eloRank ? `#${eloRank}` : "—"} accent="#6C8CFF" />
        <KpiCard label="Matches Played" value={fmtNum(totalMatches)} accent="#B18CFF" />
        <KpiCard label={yearFrom === "ALL" && yearTo === "ALL" ? "Career Win Rate" : "Win Rate (period)"} value={fmtPct(careerWinRate)} accent="#F2A93C" />
        <KpiCard
          label="Best Surface"
          value={bestSurface ? bestSurface.surface : "—"}
          unit={bestSurface ? fmtPct(bestSurface.win_rate) : ""}
          accent="#FB5B5B"
        />
      </div>

      <SectionLabel>Elo Evolution</SectionLabel>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div>
          <label style={{ marginRight: 6, fontSize: 11, color: "#8A93B3" }}>From:</label>
          <select value={yearFrom} onChange={(e) => setYearFrom(e.target.value)}>
            <option value="ALL">All</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ marginRight: 6, fontSize: 11, color: "#8A93B3" }}>To:</label>
          <select value={yearTo} onChange={(e) => setYearTo(e.target.value)}>
            <option value="ALL">All</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: 11, color: "#8A93B3", alignSelf: "center" }}>
          (applies to both charts below)
        </span>
      </div>
      <div className="chart-grid">
        <ChartCard title="Elo Rating Over Time" sub={`History for ${selected}`} span2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={eloTrend} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="quarter" tick={{ fontSize: 10 }} />
              <YAxis
                domain={[(min) => Math.floor(min - 30), (max) => Math.ceil(max + 30)]}
                tickFormatter={(v) => Math.round(v)}
                width={50}
              />
              <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} itemStyle={TOOLTIP_ITEM_STYLE} />
              <Line type="monotone" dataKey="elo" stroke="#2DD4BF" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Win Rate by Surface" span2>
          <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -4, marginBottom: 10 }}>
            {yearFrom === "ALL" && yearTo === "ALL"
              ? "Full career"
              : `${yearFrom === "ALL" ? "start" : yearFrom} — ${yearTo === "ALL" ? "present" : yearTo}`}
          </p>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={surfaceRowsFiltered} barSize={160} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="surface" tick={{ fontSize: 14 }} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} width={45} domain={[0, 1]} />
              <Tooltip
                cursor={false}
                formatter={(v) => fmtPct(v)}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Bar dataKey="win_rate" radius={[6, 6, 0, 0]}>
                {surfaceRowsFiltered.map((r, i) => (
                  <Cell key={i} fill={SURFACE_COLORS[r.surface] || PALETTE[i % PALETTE.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <p className="footnote">
        Elo is a custom rating calculated match by match (K=32, base 1500),
        not the official ATP ranking. The ranking shown above is this
        player's position within the Elo calculated over the Match Charting
        Project dataset, not full tour coverage.
      </p>
    </div>
  );
}