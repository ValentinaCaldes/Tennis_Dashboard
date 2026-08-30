import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";

const HIGHLIGHT_COLOR = "#FFFFFF";
const SERVE_COLOR = "#6C8CFF";
const RETURN_COLOR = "#2DD4BF";
const SCATTER_COLOR = "#F2A93C";

const TOOLTIP_CONTENT_STYLE = {
  background: "#131A2C",
  border: "1px solid #1A2138",
  borderRadius: 8,
  color: "#E7EAF3",
};
const TOOLTIP_LABEL_STYLE = { color: "#8A93B3" };
const TOOLTIP_ITEM_STYLE = { color: "#E7EAF3" };

// Solo entran al ranking los jugadores en el top N del ranking ATP/WTA
// OFICIAL ACTUAL (no de partidos jugados). Efecto secundario importante:
// como el ranking oficial actual solo existe para jugadores activos hoy
// (2026), esto deja afuera a cualquier retirado -- Sampras, Agassi,
// Federer, Nadal, etc. -- sin importar cuan dominantes hayan sido. Es
// intencional: la idea es que esta pestana muestre nombres actuales y
// reconocibles, no un archivo historico.
const TOP_N_RANKING = 50;

// Un jugador entra en los rankings de esta pestana si cumple CUALQUIERA
// de las dos condiciones:
//  1) esta hoy en el top N del ranking oficial ATP/WTA actual, o
//  2) alguna vez en su carrera llego al top N_PEAK del ranking oficial
//     (por ejemplo, un retirado como Sampras o Federer que fue top 10
//     pero hoy no tiene ranking porque no juega mas).
// No es seleccionable desde la UI -- si hace falta ajustarlo, son estos
// dos numeros.
const TOP_N_CURRENT = 50;
const TOP_N_PEAK_EVER = 10;

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function fmtNum(v, decimals = 1) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toFixed(decimals);
}

export default function ServeReturn({ data }) {
  const { players, serveReturnByPlayerYear, currentRanking, bestCareerRank } = data;
  const [tourFilter, setTourFilter] = useState("ALL");
  const [rankStatusFilter, setRankStatusFilter] = useState("ALL"); // ALL | CURRENT | RETIRED
  const [nameQuery, setNameQuery] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const tourByPlayer = useMemo(() => {
    const map = new Map();
    for (const p of players) map.set(p.player, p.tour);
    return map;
  }, [players]);

  const availableYears = useMemo(() => {
    const years = serveReturnByPlayerYear.map((r) => r.year);
    return Array.from(new Set(years)).sort((a, b) => a - b);
  }, [serveReturnByPlayerYear]);

  // Ranking oficial ACTUAL por jugador -- current_rank es dentro de su
  // propio tour (ATP 1-N y WTA 1-N son listas separadas), asi que
  // filtrar por current_rank <= TOP_N_CURRENT ya da el top N de cada
  // tour por separado, sin mezclar ambas listas. Solo existe fila para
  // jugadores activos hoy (2026) -- un retirado no aparece aca.
  const currentRankByPlayer = useMemo(() => {
    const map = new Map();
    for (const r of currentRanking) map.set(r.player, r.current_rank);
    return map;
  }, [currentRanking]);

  // Mejor ranking oficial alcanzado ALGUNA VEZ en la carrera (viene de
  // winner_rank/loser_rank de cada partido, calculado en el script 05).
  // Esto es lo que trae de vuelta a los retirados que fueron top 10.
  const bestRankByPlayer = useMemo(() => {
    const map = new Map();
    for (const r of bestCareerRank) map.set(r.player, r.best_rank);
    return map;
  }, [bestCareerRank]);

  // "Retirado" en este selector significa: NO tiene ranking oficial hoy
  // (no aparece en currentRanking) pero si llego al top TOP_N_PEAK_EVER
  // en algun momento de su carrera. Un jugador activo que ya esta en el
  // top 10 actual no cuenta como "retirado", aunque tambien cumpla el
  // pico historico.
  function isEligibleByRanking(player) {
    const current = currentRankByPlayer.get(player);
    const peak = bestRankByPlayer.get(player);
    const meetsCurrentTop = current !== undefined && current <= TOP_N_CURRENT;
    const meetsPeakTop = peak !== undefined && peak <= TOP_N_PEAK_EVER;

    if (rankStatusFilter === "CURRENT") return meetsCurrentTop;
    if (rankStatusFilter === "RETIRED") return current === undefined && meetsPeakTop;
    return meetsCurrentTop || meetsPeakTop; // ALL
  }

  const [yearFrom, setYearFrom] = useState("ALL");
  const [yearTo, setYearTo] = useState("ALL");

  // Agregamos las stats por jugador dentro del rango de anios elegido.
  // serveReturnByPlayerYear ya trae los porcentajes promediados POR ANIO
  // (no los puntos crudos), asi que para combinar varios anios hacemos un
  // promedio ponderado por cantidad de partidos de cada anio -- no es
  // matematicamente identico a recalcular desde cero con los puntos
  // originales, pero es una muy buena aproximacion y el mismo criterio que
  // ya usamos para agregar por rango de anios en Surface Performance.
  const statsInRange = useMemo(() => {
    const filtered = serveReturnByPlayerYear.filter((r) => {
      if (yearFrom !== "ALL" && r.year < Number(yearFrom)) return false;
      if (yearTo !== "ALL" && r.year > Number(yearTo)) return false;
      return true;
    });

    const FIELDS = [
      "first_in_pct", "first_win_pct", "second_win_pct", "bp_saved_pct",
      "aces_avg", "double_faults_avg", "dominance_ratio_avg",
    ];

    const acc = new Map();
    for (const r of filtered) {
      if (!acc.has(r.player)) {
        const init = { player: r.player, matches: 0 };
        for (const f of FIELDS) { init[`${f}__sum`] = 0; init[`${f}__w`] = 0; }
        acc.set(r.player, init);
      }
      const prev = acc.get(r.player);
      prev.matches += r.matches;
      for (const f of FIELDS) {
        if (r[f] !== null && r[f] !== undefined) {
          prev[`${f}__sum`] += r[f] * r.matches;
          prev[`${f}__w`] += r.matches;
        }
      }
    }

    return Array.from(acc.values()).map((r) => {
      const row = { player: r.player, matches: r.matches };
      for (const f of FIELDS) {
        row[f] = r[`${f}__w`] > 0 ? r[`${f}__sum`] / r[`${f}__w`] : null;
      }
      return row;
    });
  }, [serveReturnByPlayerYear, yearFrom, yearTo]);

  const eligibleRows = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return statsInRange.filter((r) => {
      if (!isEligibleByRanking(r.player)) return false;
      if (tourFilter !== "ALL" && tourByPlayer.get(r.player) !== tourFilter) return false;
      if (q && !r.player.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [statsInRange, currentRankByPlayer, bestRankByPlayer, rankStatusFilter, tourFilter, tourByPlayer, nameQuery]);

  const allPlayerNames = useMemo(
    () => Array.from(new Set(serveReturnByPlayerYear.map((r) => r.player))).sort(),
    [serveReturnByPlayerYear]
  );

  const topServers = useMemo(
    () =>
      [...eligibleRows]
        .filter((r) => r.first_win_pct !== null)
        .sort((a, b) => b.first_win_pct - a.first_win_pct)
        .slice(0, 10)
        .map((r) => ({ ...r, shortName: r.player.split(" ").pop() })),
    [eligibleRows]
  );

  const topReturners = useMemo(
    () =>
      [...eligibleRows]
        .filter((r) => r.dominance_ratio_avg !== null)
        .sort((a, b) => b.dominance_ratio_avg - a.dominance_ratio_avg)
        .slice(0, 10)
        .map((r) => ({ ...r, shortName: r.player.split(" ").pop() })),
    [eligibleRows]
  );

  const scatterData = useMemo(
    () =>
      eligibleRows
        .filter((r) => r.aces_avg !== null && r.double_faults_avg !== null)
        .map((r) => ({ player: r.player, aces: r.aces_avg, doubleFaults: r.double_faults_avg })),
    [eligibleRows]
  );

  const bestServerOverall = topServers[0];
  const bestReturnerOverall = topReturners[0];
  const mostAces = [...eligibleRows].sort((a, b) => (b.aces_avg ?? 0) - (a.aces_avg ?? 0))[0];
  const fewestDoubleFaults = [...eligibleRows]
    .filter((r) => r.double_faults_avg !== null)
    .sort((a, b) => a.double_faults_avg - b.double_faults_avg)[0];

  const handleBarClick = (payload) => {
    if (!payload) return;
    setSelectedPlayer((prev) => (prev === payload.player ? null : payload.player));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Tour:</label>
          <select value={tourFilter} onChange={(e) => setTourFilter(e.target.value)}>
            <option value="ALL">ATP + WTA</option>
            <option value="ATP">ATP</option>
            <option value="WTA">WTA</option>
          </select>
        </div>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Ranking status:</label>
          <select value={rankStatusFilter} onChange={(e) => setRankStatusFilter(e.target.value)}>
            <option value="ALL">All (current top {TOP_N_CURRENT} + retired top {TOP_N_PEAK_EVER})</option>
            <option value="CURRENT">Currently ranked (top {TOP_N_CURRENT})</option>
            <option value="RETIRED">Retired (peak top {TOP_N_PEAK_EVER})</option>
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
        {selectedPlayer && (
          <button
            onClick={() => setSelectedPlayer(null)}
            style={{
              fontSize: 11, color: "#8A93B3", background: "transparent",
              border: "1px solid #1A2138", borderRadius: 6, padding: "5px 10px", cursor: "pointer",
            }}
          >
            Clear highlight: {selectedPlayer} ✕
          </button>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Search player:</label>
        <input
          type="text"
          list="serve-player-list"
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="Type a name..."
          style={{
            background: "#131A2C", border: "1px solid #1A2138", color: "#E7EAF3",
            borderRadius: 6, padding: "6px 10px", fontSize: 13, width: 220,
          }}
        />
        <datalist id="serve-player-list">
          {allPlayerNames.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      <div className="kpi-grid">
        <KpiCard
          label="Best Server (1st serve win %)"
          value={bestServerOverall?.player.split(" ").pop() ?? "—"}
          unit={bestServerOverall ? fmtPct(bestServerOverall.first_win_pct) : ""}
          accent="#6C8CFF"
        />
        <KpiCard
          label="Best Returner (dominance ratio)"
          value={bestReturnerOverall?.player.split(" ").pop() ?? "—"}
          unit={bestReturnerOverall ? fmtNum(bestReturnerOverall.dominance_ratio_avg, 2) : ""}
          accent="#2DD4BF"
        />
        <KpiCard
          label="Most Aces / Match"
          value={mostAces?.player.split(" ").pop() ?? "—"}
          unit={mostAces ? fmtNum(mostAces.aces_avg) : ""}
          accent="#F2A93C"
        />
        <KpiCard
          label="Fewest Double Faults / Match"
          value={fewestDoubleFaults?.player.split(" ").pop() ?? "—"}
          unit={fewestDoubleFaults ? fmtNum(fewestDoubleFaults.double_faults_avg) : ""}
          accent="#B18CFF"
        />
      </div>

      <SectionLabel>Top 10</SectionLabel>
      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        Click a bar to highlight that player across both charts and the scatter plot below.
      </p>
      <div className="chart-grid">
        <ChartCard title="Best Servers" sub="Ranked by 1st serve win %" span2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topServers} layout="vertical" margin={{ left: 10 }}>
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
              <Bar dataKey="first_win_pct" radius={[0, 4, 4, 0]} onClick={handleBarClick} style={{ cursor: "pointer" }}>
                {topServers.map((r, i) => (
                  <Cell key={i} fill={r.player === selectedPlayer ? HIGHLIGHT_COLOR : SERVE_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Best Returners" sub="Ranked by dominance ratio (return points won / opponent's lost serve points, on matches won)" span2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={topReturners} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" horizontal={false} />
              <XAxis type="number" />
              <YAxis type="category" dataKey="shortName" width={110} tick={{ fontSize: 12 }} />
              <Tooltip
                cursor={false}
                formatter={(v) => fmtNum(v, 2)}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.player ?? ""}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Bar dataKey="dominance_ratio_avg" radius={[0, 4, 4, 0]} onClick={handleBarClick} style={{ cursor: "pointer" }}>
                {topReturners.map((r, i) => (
                  <Cell key={i} fill={r.player === selectedPlayer ? HIGHLIGHT_COLOR : RETURN_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <SectionLabel>Aces vs. Double Faults</SectionLabel>
      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        Each point is one player, averaged per match. Top-right = big server who also gives away
        free points; bottom-right = big server with clean service games.
      </p>
      <ChartCard title="Aces vs. Double Faults per Match" span2>
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
            <XAxis
              type="number"
              dataKey="doubleFaults"
              name="Double Faults"
              label={{ value: "Double Faults / Match", position: "insideBottom", offset: -5, fontSize: 11, fill: "#8A93B3" }}
            />
            <YAxis
              type="number"
              dataKey="aces"
              name="Aces"
              width={40}
              label={{ value: "Aces / Match", angle: -90, position: "insideLeft", fontSize: 11, fill: "#8A93B3" }}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return (
                  <div style={{ ...TOOLTIP_CONTENT_STYLE, padding: 8 }}>
                    <div style={{ color: "#E7EAF3", fontWeight: 600, marginBottom: 4 }}>{p.player}</div>
                    <div style={TOOLTIP_LABEL_STYLE}>Aces/match: <span style={TOOLTIP_ITEM_STYLE}>{fmtNum(p.aces)}</span></div>
                    <div style={TOOLTIP_LABEL_STYLE}>DF/match: <span style={TOOLTIP_ITEM_STYLE}>{fmtNum(p.doubleFaults)}</span></div>
                  </div>
                );
              }}
            />
            <Scatter data={scatterData} fillOpacity={0.8}>
              {scatterData.map((r, i) => (
                <Cell key={i} fill={r.player === selectedPlayer ? HIGHLIGHT_COLOR : SCATTER_COLOR} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      <p className="footnote">
        "Dominance ratio" is only computed on matches the player won (the underlying formula
        needs return points won vs. the opponent's lost serve points, which is only tracked for
        the winner in this dataset) -- so it reflects return quality when winning, not an
        average across every match played. Players appear in these rankings if they're
        currently in the top {TOP_N_CURRENT} of the official ATP/WTA ranking, or if they ever
        reached the top {TOP_N_PEAK_EVER} at any point in their career -- so retired greats
        (Sampras, Federer, etc.) still show up even without a ranking today. Source: Jeff
        Sackmann's official ATP/WTA match results archive, ATP Tour level (Grand Slams,
        Masters, tour-level events) -- Challengers/Futures aren't included, so a player's
        charted matches don't necessarily reflect their full career.
      </p>
    </div>
  );
}