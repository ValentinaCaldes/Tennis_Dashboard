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
  const { players, eloCurrent, eloHistory, playerSurfaceStatsByYear, currentRanking } = data;
  const [tourFilter, setTourFilter] = useState("ALL");

  // Ordenamos por ranking oficial ATP/WTA actual (ascendente -- #1 primero).
  // Jugadores sin ranking actual (retirados, o activos pero fuera del top
  // 1000 que trae el dataset) van al final, conservando entre ellos el
  // orden original por Elo que ya trae `players` desde el pipeline.
  const sortedPlayers = useMemo(() => {
    const rankByPlayer = new Map(currentRanking.map((r) => [r.player, r.current_rank]));
    return [...players].sort((a, b) => {
      const rankA = rankByPlayer.get(a.player);
      const rankB = rankByPlayer.get(b.player);
      const hasA = rankA !== undefined;
      const hasB = rankB !== undefined;
      if (hasA && hasB) return rankA - rankB;
      if (hasA) return -1;
      if (hasB) return 1;
      return 0; // sin ranking de ningun lado -> conserva el orden por Elo
    });
  }, [players, currentRanking]);

  const filteredPlayers = useMemo(() => {
    if (tourFilter === "ALL") return sortedPlayers;
    return sortedPlayers.filter((p) => p.tour === tourFilter);
  }, [sortedPlayers, tourFilter]);

  const [selected, setSelected] = useState(filteredPlayers?.[0]?.player ?? "");

  // Si cambia el filtro ATP/WTA y el jugador seleccionado ya no esta en
  // la lista filtrada, saltamos al primero de la nueva lista.
  React.useEffect(() => {
    if (filteredPlayers.length && !filteredPlayers.some((p) => p.player === selected)) {
      setSelected(filteredPlayers[0].player);
    }
  }, [filteredPlayers, selected]);

  // Texto del buscador de jugador -- separado de "selected" para que se
  // pueda escribir libremente, pero se mantiene sincronizado si "selected"
  // cambia desde otro lado (ej. al cambiar el filtro de Tour).
  const [playerQuery, setPlayerQuery] = useState(selected);
  React.useEffect(() => {
    setPlayerQuery(selected);
  }, [selected]);

  // Dropdown propio para el buscador de jugador (en vez de <input list> +
  // <datalist> nativo): el comportamiento de datalist al hacer click sin
  // escribir varia bastante entre navegadores (Firefox en particular no
  // siempre reabre la lista si el input ya tiene un valor exacto), asi
  // que armamos un combobox chico a mano para que sea consistente: click
  // en el input -> se abre la lista completa; escribir -> la filtra.
  const [playerDropdownOpen, setPlayerDropdownOpen] = useState(false);
  const playerDropdownRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(e) {
      if (playerDropdownRef.current && !playerDropdownRef.current.contains(e.target)) {
        setPlayerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const playerSuggestions = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    if (!q || q === selected.toLowerCase()) return filteredPlayers;
    return filteredPlayers.filter((p) => p.player.toLowerCase().includes(q));
  }, [filteredPlayers, playerQuery, selected]);

  function choosePlayer(p) {
    setSelected(p.player);
    setPlayerQuery(p.player);
    setPlayerDropdownOpen(false);
  }

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

  // Ranking oficial ATP/WTA actual -- solo existe para jugadores activos
  // ahora mismo (2026). Un retirado (Federer, Sampras, etc.) no va a
  // tener fila aca, por eso el fallback a "Unranked" en el KPI.
  const currentRankRow = currentRanking.find((r) => r.player === selected);

  // --- Surface trend insight (detector de "quiebre") ------------------
  // Para cada superficie del jugador, busca el anio que mejor separa su
  // historial en un "antes" y un "despues" con la mayor diferencia de
  // win rate -- prueba cada anio posible como punto de corte y se queda
  // con el de mayor diferencia. Usa la carrera COMPLETA del jugador
  // (no el filtro From/To de arriba), porque la idea es detectar
  // quiebres reales en su trayectoria, sin importar que rango estes
  // mirando en el resto de la pantalla.
  const MIN_MATCHES_PER_SEGMENT = 10;
  const SIGNIFICANT_SHIFT = 0.15; // 15 puntos porcentuales

  const surfaceShifts = useMemo(() => {
    const bySurface = new Map();
    for (const r of playerSurfaceStatsByYear) {
      if (r.player !== selected) continue;
      if (!bySurface.has(r.surface)) bySurface.set(r.surface, []);
      bySurface.get(r.surface).push(r);
    }

    const results = [];
    for (const [surface, rows] of bySurface) {
      const sorted = [...rows].sort((a, b) => a.year - b.year);
      const years = Array.from(new Set(sorted.map((r) => r.year))).sort((a, b) => a - b);
      if (years.length < 2) continue;

      let best = null;
      // Probamos cada anio como punto de corte, salvo el primero (para
      // que el "antes" tenga al menos un anio de datos).
      for (let i = 1; i < years.length; i++) {
        const splitYear = years[i];
        const before = sorted.filter((r) => r.year < splitYear);
        const after = sorted.filter((r) => r.year >= splitYear);
        const beforeMatches = before.reduce((s, r) => s + r.matches, 0);
        const afterMatches = after.reduce((s, r) => s + r.matches, 0);
        if (beforeMatches < MIN_MATCHES_PER_SEGMENT || afterMatches < MIN_MATCHES_PER_SEGMENT) continue;
        const beforeWins = before.reduce((s, r) => s + r.wins, 0);
        const afterWins = after.reduce((s, r) => s + r.wins, 0);
        const beforeRate = beforeWins / beforeMatches;
        const afterRate = afterWins / afterMatches;
        const diff = afterRate - beforeRate;
        if (!best || Math.abs(diff) > Math.abs(best.diff)) {
          best = { surface, splitYear, beforeRate, afterRate, diff, beforeMatches, afterMatches };
        }
      }
      if (best && Math.abs(best.diff) >= SIGNIFICANT_SHIFT) {
        results.push(best);
      }
    }
    return results.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [playerSurfaceStatsByYear, selected]);

  return (
    <div>
      <div className="player-select-row" style={{ marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Tour:</label>
          <select value={tourFilter} onChange={(e) => setTourFilter(e.target.value)}>
            <option value="ALL">ATP + WTA</option>
            <option value="ATP">ATP</option>
            <option value="WTA">WTA</option>
          </select>
        </div>
        <div ref={playerDropdownRef} style={{ position: "relative" }}>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Player:</label>
          <input
            type="text"
            value={playerQuery}
            onClick={() => setPlayerDropdownOpen(true)}
            onFocus={() => setPlayerDropdownOpen(true)}
            onChange={(e) => {
              setPlayerQuery(e.target.value);
              setPlayerDropdownOpen(true);
              const match = filteredPlayers.find((p) => p.player === e.target.value);
              if (match) setSelected(match.player);
            }}
            placeholder="Click or type a name..."
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
          {playerDropdownOpen && playerSuggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
                background: "#131A2C",
                border: "1px solid #1A2138",
                borderRadius: 6,
                maxHeight: 260,
                overflowY: "auto",
                width: 260,
                zIndex: 20,
              }}
            >
              {playerSuggestions.map((p) => (
                <div
                  key={p.player}
                  onClick={() => choosePlayer(p)}
                  style={{
                    padding: "6px 10px",
                    fontSize: 13,
                    cursor: "pointer",
                    color: p.player === selected ? "#2DD4BF" : "#E7EAF3",
                    background: p.player === selected ? "#16233A" : "transparent",
                  }}
                >
                  {p.player}
                </div>
              ))}
            </div>
          )}
        </div>
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
          (year range applies to the KPIs and both charts below)
        </span>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="ATP/WTA Ranking"
          value={currentRankRow ? `#${currentRankRow.current_rank}` : "Unranked"}
          unit={currentRankRow ? `${currentRankRow.current_rank_points} pts` : ""}
          accent="#FB5B5B"
        />
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

      {surfaceShifts.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionLabel>Surface Trend</SectionLabel>
          <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 10 }}>
            Biggest career-wide shift in win rate per surface (independent of the From/To range
            above). Needs {MIN_MATCHES_PER_SEGMENT}+ matches on each side of the split to count.
          </p>
          {surfaceShifts.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: "#131A2C", border: "1px solid #1A2138", borderRadius: 8,
                marginBottom: 8, fontSize: 13, color: "#E7EAF3",
              }}
            >
              <span style={{ fontSize: 16 }}>{s.diff > 0 ? "📈" : "📉"}</span>
              <span>
                <strong>{s.surface}:</strong> win rate {s.diff > 0 ? "improved" : "dropped"} from{" "}
                <strong>{fmtPct(s.beforeRate)}</strong> (before {s.splitYear}) to{" "}
                <strong>{fmtPct(s.afterRate)}</strong> ({s.splitYear} onward)
                <span style={{ color: "#8A93B3", marginLeft: 6 }}>
                  ({s.beforeMatches + s.afterMatches} matches analyzed)
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="chart-grid" style={{ marginBottom: 24 }}>
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

      <SectionLabel>Elo Evolution</SectionLabel>
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