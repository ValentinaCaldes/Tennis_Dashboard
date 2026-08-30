import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";

const COLOR_A = "#2DD4BF";
const COLOR_B = "#6C8CFF";

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

// Combobox chico (mismo patron que Player Overview): click en el input
// abre la lista completa ordenada por ranking, escribir la filtra.
function PlayerCombobox({ label, players, value, onChange, excludePlayer }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => setQuery(value), [value]);

  React.useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = players.filter((p) => p.player !== excludePlayer);
    if (!q || q === value.toLowerCase()) return pool;
    return pool.filter((p) => p.player.toLowerCase().includes(q));
  }, [players, query, value, excludePlayer]);

  function choose(p) {
    onChange(p.player);
    setQuery(p.player);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>{label}:</label>
      <input
        type="text"
        value={query}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          const match = players.find((p) => p.player === e.target.value);
          if (match) onChange(match.player);
        }}
        placeholder="Click or type a name..."
        style={{
          background: "#131A2C", border: "1px solid #1A2138", color: "#E7EAF3",
          borderRadius: 6, padding: "6px 10px", fontSize: 13, width: 220,
        }}
      />
      {open && suggestions.length > 0 && (
        <div
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4,
            background: "#131A2C", border: "1px solid #1A2138", borderRadius: 6,
            maxHeight: 260, overflowY: "auto", width: 260, zIndex: 20,
          }}
        >
          {suggestions.map((p) => (
            <div
              key={p.player}
              onClick={() => choose(p)}
              style={{
                padding: "6px 10px", fontSize: 13, cursor: "pointer",
                color: p.player === value ? "#2DD4BF" : "#E7EAF3",
                background: p.player === value ? "#16233A" : "transparent",
              }}
            >
              {p.player}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HeadToHead({ data }) {
  const { players, h2hOverall, h2hBySurface, h2hByYear, h2hGsFinalsDetail, currentRanking } = data;

  // Solo el top 50 del ranking ATP/WTA oficial ACTUAL -- mezclar ATP y
  // WTA en un cruce no tiene sentido (no juegan entre si), asi que no
  // hay opcion "ambos": se elige un tour y el pool son sus 50 mejores
  // ranqueados hoy. Se pierden los retirados aca a proposito -- si mas
  // adelante hace falta volver a incluirlos, es agregar el mismo
  // criterio de "peak top N" que se uso en Serve & Return.
  const TOP_N = 50;
  const [tourFilter, setTourFilter] = useState("ATP");

  const top50Players = useMemo(() => {
    const rankByPlayer = new Map(currentRanking.map((r) => [r.player, r.current_rank]));
    return players
      .filter((p) => p.tour === tourFilter && (rankByPlayer.get(p.player) ?? Infinity) <= TOP_N)
      .sort((a, b) => rankByPlayer.get(a.player) - rankByPlayer.get(b.player));
  }, [players, currentRanking, tourFilter]);

  const [playerA, setPlayerA] = useState(top50Players?.[0]?.player ?? "");
  const [playerB, setPlayerB] = useState(top50Players?.[1]?.player ?? "");

  // Si cambia el tour y el jugador elegido ya no esta en el nuevo top 50,
  // saltamos a los dos primeros del nuevo pool (mismo patron que el
  // reset de Tour en Player Overview).
  React.useEffect(() => {
    if (!top50Players.length) return;
    const aOk = top50Players.some((p) => p.player === playerA);
    const bOk = top50Players.some((p) => p.player === playerB);
    if (!aOk || !bOk) {
      setPlayerA(top50Players[0]?.player ?? "");
      setPlayerB(top50Players[1]?.player ?? "");
    }
  }, [top50Players]);

  function swap() {
    const a = playerA;
    setPlayerA(playerB);
    setPlayerB(a);
  }

  const availableYears = useMemo(() => {
    const years = h2hByYear.map((r) => r.year);
    return Array.from(new Set(years)).sort((a, b) => a - b);
  }, [h2hByYear]);

  const [yearFrom, setYearFrom] = useState("ALL");
  const [yearTo, setYearTo] = useState("ALL");

  // h2hOverall/h2hBySurface guardan cada par UNA sola vez, con player_a /
  // player_b en un orden que no depende de cual elegimos "A" o "B" en la
  // UI -- por eso buscamos en ambas direcciones y "damos vuelta" los
  // numeros si hace falta, para que siempre queden alineados con lo que
  // el usuario eligio como Player A / Player B.
  const overallRow = useMemo(() => {
    if (!playerA || !playerB || playerA === playerB) return null;
    const row = h2hOverall.find(
      (r) =>
        (r.player_a === playerA && r.player_b === playerB) ||
        (r.player_a === playerB && r.player_b === playerA)
    );
    if (!row) return null;
    const flipped = row.player_a !== playerA;
    return {
      total_matches: row.total_matches,
      a_wins: flipped ? row.b_wins : row.a_wins,
      b_wins: flipped ? row.a_wins : row.b_wins,
      last_meeting_date: row.last_meeting_date,
      last_surface: row.last_surface,
      last_winner: row.last_winner,
      // Estos tres (nombre, superficie, minutos) no dependen de A/B, no
      // hay que "darlos vuelta". gs_finals tampoco (es un conteo total),
      // pero gs_finals_a_wins/b_wins si son relativos al orden -- van
      // igual que a_wins/b_wins arriba.
      longest_match_minutes: row.longest_match_minutes,
      longest_match_date: row.longest_match_date,
      longest_match_surface: row.longest_match_surface,
      longest_match_winner: row.longest_match_winner,
      gs_finals: row.gs_finals,
      gs_finals_a_wins: flipped ? row.gs_finals_b_wins : row.gs_finals_a_wins,
      gs_finals_b_wins: flipped ? row.gs_finals_a_wins : row.gs_finals_b_wins,
    };
  }, [h2hOverall, playerA, playerB]);

  // Total de enfrentamientos y wins DENTRO del rango de anios elegido --
  // se arma sumando h2hByYear, separado de overallRow (que siempre es la
  // carrera completa). Last Meeting, Longest Match y GS Finals se quedan
  // en overallRow a proposito: no tenemos esos tres datos desglosados
  // por anio, asi que siempre muestran el dato de carrera completa
  // aunque el rango de anios este acotado.
  const rangedOverall = useMemo(() => {
    if (!playerA || !playerB || playerA === playerB) return null;
    const rows = h2hByYear.filter(
      (r) =>
        ((r.player_a === playerA && r.player_b === playerB) ||
          (r.player_a === playerB && r.player_b === playerA)) &&
        (yearFrom === "ALL" || r.year >= Number(yearFrom)) &&
        (yearTo === "ALL" || r.year <= Number(yearTo))
    );
    if (!rows.length) return null;
    let matches = 0, aWins = 0, bWins = 0;
    for (const r of rows) {
      const flipped = r.player_a !== playerA;
      matches += r.matches;
      aWins += flipped ? r.b_wins : r.a_wins;
      bWins += flipped ? r.a_wins : r.b_wins;
    }
    return { total_matches: matches, a_wins: aWins, b_wins: bWins };
  }, [h2hByYear, playerA, playerB, yearFrom, yearTo]);

  // Lista de finales individuales (torneo + anio + ganador) para el par
  // elegido, ordenada cronologicamente -- viene de un archivo aparte
  // porque un par puede tener mas de una final (no entra como columnas
  // en una sola fila de h2hOverall).
  const gsFinalsList = useMemo(() => {
    if (!playerA || !playerB || playerA === playerB) return [];
    return h2hGsFinalsDetail
      .filter(
        (r) =>
          (r.player_a === playerA && r.player_b === playerB) ||
          (r.player_a === playerB && r.player_b === playerA)
      )
      .slice()
      .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
  }, [h2hGsFinalsDetail, playerA, playerB]);

  const surfaceRows = useMemo(() => {
    if (!playerA || !playerB || playerA === playerB) return [];
    return h2hBySurface
      .filter(
        (r) =>
          (r.player_a === playerA && r.player_b === playerB) ||
          (r.player_a === playerB && r.player_b === playerA)
      )
      .map((r) => {
        const flipped = r.player_a !== playerA;
        return {
          surface: r.surface,
          matches: r.matches,
          aWins: flipped ? r.b_wins : r.a_wins,
          bWins: flipped ? r.a_wins : r.b_wins,
        };
      });
  }, [h2hBySurface, playerA, playerB]);

  const shortA = playerA.split(" ").pop();
  const shortB = playerB.split(" ").pop();

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Tour:</label>
          <select value={tourFilter} onChange={(e) => setTourFilter(e.target.value)}>
            <option value="ATP">ATP</option>
            <option value="WTA">WTA</option>
          </select>
        </div>
        <PlayerCombobox label="Player A" players={top50Players} value={playerA} onChange={setPlayerA} excludePlayer={playerB} />
        <button
          onClick={swap}
          title="Swap players"
          style={{
            background: "#131A2C", border: "1px solid #1A2138", color: "#8A93B3",
            borderRadius: 6, padding: "6px 12px", fontSize: 13, cursor: "pointer", height: 32,
          }}
        >
          ⇄ Swap
        </button>
        <PlayerCombobox label="Player B" players={top50Players} value={playerB} onChange={setPlayerB} excludePlayer={playerA} />
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
      </div>

      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -14, marginBottom: 20 }}>
        Showing current top {TOP_N} {tourFilter} players only. Year range applies to Total
        Meetings / win split below -- Last Meeting, Longest Match and Grand Slam Finals are
        always career totals.
      </p>

      {playerA === playerB ? (
        <p style={{ color: "#8A93B3", padding: 24 }}>Pick two different players to compare.</p>
      ) : !overallRow ? (
        <p style={{ color: "#8A93B3", padding: 24 }}>
          {shortA} and {shortB} haven't played each other at ATP Tour level in this dataset
          (2000-2026).
        </p>
      ) : !rangedOverall ? (
        <p style={{ color: "#8A93B3", padding: 24 }}>
          {shortA} and {shortB} didn't meet within the selected year range. They've played{" "}
          {overallRow.total_matches} time{overallRow.total_matches === 1 ? "" : "s"} overall --
          try widening the From/To range.
        </p>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total Meetings" value={rangedOverall.total_matches} accent="#F2A93C" />
            <KpiCard
              label={`${shortA}'s Wins`}
              value={rangedOverall.a_wins}
              unit={fmtPct(rangedOverall.a_wins / rangedOverall.total_matches)}
              accent={COLOR_A}
            />
            <KpiCard
              label={`${shortB}'s Wins`}
              value={rangedOverall.b_wins}
              unit={fmtPct(rangedOverall.b_wins / rangedOverall.total_matches)}
              accent={COLOR_B}
            />
            <KpiCard
              label="Last Meeting"
              value={fmtDate(overallRow.last_meeting_date)}
              unit={`${overallRow.last_surface} · won by ${overallRow.last_winner.split(" ").pop()}`}
              accent="#B18CFF"
            />
            <KpiCard
              label="Longest Match"
              value={fmtDuration(overallRow.longest_match_minutes)}
              unit={
                overallRow.longest_match_winner
                  ? `${overallRow.longest_match_surface} · won by ${overallRow.longest_match_winner.split(" ").pop()}`
                  : "no duration data"
              }
              accent="#F2A93C"
            />
            <KpiCard
              label="Grand Slam Finals"
              value={overallRow.gs_finals ?? 0}
              unit={
                overallRow.gs_finals > 0
                  ? `${shortA} ${overallRow.gs_finals_a_wins}-${overallRow.gs_finals_b_wins} ${shortB}`
                  : ""
              }
              accent="#FB5B5B"
            />
          </div>

          {gsFinalsList.length > 0 && (
            <div
              style={{
                marginTop: -8, marginBottom: 24, padding: "10px 14px",
                background: "#131A2C", border: "1px solid #1A2138", borderRadius: 8,
                fontSize: 12, color: "#8A93B3",
              }}
            >
              <span style={{ color: "#E7EAF3", fontWeight: 600, marginRight: 6 }}>
                Grand Slam finals:
              </span>
              {gsFinalsList.map((f, i) => (
                <span key={i}>
                  {i > 0 && <span style={{ margin: "0 6px" }}>·</span>}
                  {f.tourney_name} {f.year} (won by {f.winner.split(" ").pop()})
                </span>
              ))}
            </div>
          )}

          <SectionLabel>Wins by Surface</SectionLabel>
          <ChartCard title={`${shortA} vs ${shortB}`} sub="Head-to-head record on each surface they've played" span2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={surfaceRows} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
                <XAxis dataKey="surface" tick={{ fontSize: 13 }} />
                <YAxis allowDecimals={false} width={30} />
                <Tooltip
                  cursor={false}
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "#8A93B3" }} />
                <Bar dataKey="aWins" name={shortA} fill={COLOR_A} radius={[4, 4, 0, 0]} />
                <Bar dataKey="bWins" name={shortB} fill={COLOR_B} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}

      <p className="footnote">
        Head-to-head totals are limited to ATP Tour-level matches (Grand Slams, Masters,
        tour-level events) from Jeff Sackmann's official results archive -- Challengers/Futures
        aren't included, so very early meetings between two players (before either reached the
        main tour) may be missing.
      </p>
    </div>
  );
}