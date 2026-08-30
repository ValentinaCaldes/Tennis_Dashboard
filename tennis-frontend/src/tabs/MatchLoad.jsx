import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";

const OTHER_COLOR = "#6C8CFF";
const GS_COLOR = "#F2A93C";

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

function quarterOf(dateStr) {
  const d = new Date(dateStr);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return { year: d.getFullYear(), quarter: q, label: `${d.getFullYear()} Q${q}` };
}

function quarterKey(label) {
  const [year, q] = label.split(" Q");
  return Number(year) * 4 + (Number(q) - 1);
}

const PLAYER_INJURY_NOTES = {
  "Novak Djokovic": {
    text: "Djokovic tore his meniscus in a five-set win over Cerundolo at the 2024 French Open, withdrew before the quarterfinal, and had knee surgery days later -- wiping out the rest of his clay season, though he still made it back for Wimbledon that summer.",
    url: "https://www.cbssports.com/tennis/news/novak-djokovic-injury-update-serbian-star-to-undergo-knee-surgery-after-withdrawing-from-2024-french-open",
  },
  "Rafael Nadal": {
    text: "Nadal ended his 2021 season early in August due to chronic Mueller-Weiss syndrome in his left foot, then had surgery that September -- part of a foot condition he'd quietly managed since 2005.",
    url: "https://www.flashscore.com/news/in-a-world-of-pain-rafael-nadal-s-career-long-battle-with-injuries/QmAgoPt3/",
  },
  "Carlos Alcaraz": {
    text: "Alcaraz has been sidelined since mid-April 2026 with a right wrist injury (an inflamed tendon sheath), missing the French Open, Wimbledon and Cincinnati -- he returned at the US Open after roughly a four-month layoff.",
    url: "https://www.aljazeera.com/sports/2026/8/20/carlos-alcaraz-confirms-us-open-return-after-four-month-injury-layoff",
  },
};

const QUARTER_TO_GS = {
  1: ["Australian Open"],
  2: ["Roland Garros"],
  3: ["Wimbledon", "US Open"],
  4: [],
};
// Inverso del mapa de arriba -- que trimestre le corresponde a cada
// Grand Slam, para poder filtrar grandSlamEditions por el mismo rango
// de trimestres que usa el grafico de arriba.
const GS_TO_QUARTER = { "Australian Open": 1, "Roland Garros": 2, "Wimbledon": 3, "US Open": 3 };
const ROUND_RANK = { R128: 1, R64: 2, R32: 3, R16: 4, QF: 5, SF: 6, F: 7 };
const GS_COLUMN_KEY = {
  "Australian Open": "ao",
  "Roland Garros": "rg",
  "Wimbledon": "wimbledon",
  "US Open": "usOpen",
};

function gsMarkerForQuarter(periodLabel, grandSlamEditions, player) {
  const [yearStr, qStr] = periodLabel.split(" Q");
  const year = Number(yearStr);
  const candidates = QUARTER_TO_GS[Number(qStr)] || [];
  if (!candidates.length) return null;

  const matches = grandSlamEditions.filter(
    (e) => e.player === player && e.year === year && candidates.includes(e.tourney_name)
  );
  if (!matches.length) return null;

  const best = matches.reduce((a, b) =>
    (ROUND_RANK[b.best_round] ?? 0) > (ROUND_RANK[a.best_round] ?? 0) ? b : a
  );
  if (best.won_title) return `🏆 ${best.tourney_name}`;
  if (best.best_round === "SF") return `SF ${best.tourney_name}`;
  return null;
}

export default function MatchLoad({ data }) {
  const { players, matchesPerPeriod, grandSlamEditions, currentRanking, bestCareerRank } = data;
  const [tourFilter, setTourFilter] = useState("ALL");
  const [rankStatusFilter, setRankStatusFilter] = useState("ALL"); // ALL | CURRENT | RETIRED
  const [quarterFrom, setQuarterFrom] = useState("ALL");
  const [quarterTo, setQuarterTo] = useState("ALL");
  const [tableSearch, setTableSearch] = useState("");

  const tourByPlayer = useMemo(() => {
    const map = new Map();
    for (const p of players) map.set(p.player, p.tour);
    return map;
  }, [players]);

  // Mismo criterio que Serve & Return / Surface Performance: un jugador
  // entra si esta HOY en el top 50 del ranking oficial, o si alguna vez
  // llego al top 10 en su carrera -- asi los retirados relevantes
  // (Federer, Sampras, etc.) no desaparecen solo por no tener ranking
  // actual.
  const TOP_N_CURRENT = 50;
  const TOP_N_PEAK_EVER = 10;

  const currentRankByPlayer = useMemo(() => {
    const map = new Map();
    for (const r of currentRanking) map.set(r.player, r.current_rank);
    return map;
  }, [currentRanking]);

  const bestRankByPlayer = useMemo(() => {
    const map = new Map();
    for (const r of bestCareerRank) map.set(r.player, r.best_rank);
    return map;
  }, [bestCareerRank]);

  function isEligibleByRanking(player) {
    const current = currentRankByPlayer.get(player);
    const peak = bestRankByPlayer.get(player);
    const meetsCurrentTop = current !== undefined && current <= TOP_N_CURRENT;
    const meetsPeakTop = peak !== undefined && peak <= TOP_N_PEAK_EVER;

    if (rankStatusFilter === "CURRENT") return meetsCurrentTop;
    if (rankStatusFilter === "RETIRED") return current === undefined && meetsPeakTop;
    return meetsCurrentTop || meetsPeakTop; // ALL
  }

  const filteredPlayers = useMemo(
    () =>
      players.filter(
        (p) => (tourFilter === "ALL" || p.tour === tourFilter) && isEligibleByRanking(p.player)
      ),
    [players, tourFilter, currentRankByPlayer, bestRankByPlayer, rankStatusFilter]
  );

  const [selected, setSelected] = useState(filteredPlayers[0]?.player ?? "");
  React.useEffect(() => {
    if (filteredPlayers.length && !filteredPlayers.some((p) => p.player === selected)) {
      setSelected(filteredPlayers[0].player);
    }
  }, [filteredPlayers, selected]);

  const weeklyRows = useMemo(() => {
    return matchesPerPeriod
      .filter((r) => r.player === selected && r.period_type === "week")
      .map((r) => {
        const startDate = r.period.split("/")[0];
        const q = quarterOf(startDate);
        return { ...r, quarterLabel: q.label, other_matches: r.matches - (r.gs_matches ?? 0) };
      })
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [matchesPerPeriod, selected]);

  const quarterlyData = useMemo(() => {
    const byQuarter = new Map();
    for (const row of weeklyRows) {
      const prev = byQuarter.get(row.quarterLabel) || { matches: 0, gs_matches: 0 };
      byQuarter.set(row.quarterLabel, {
        matches: prev.matches + row.matches,
        gs_matches: prev.gs_matches + (row.gs_matches ?? 0),
      });
    }
    return Array.from(byQuarter, ([period, v]) => ({
      period,
      matches: v.matches,
      gs_matches: v.gs_matches,
      other_matches: v.matches - v.gs_matches,
    })).sort((a, b) => a.period.localeCompare(b.period));
  }, [weeklyRows]);

  const availableQuarters = useMemo(
    () => quarterlyData.map((r) => r.period),
    [quarterlyData]
  );

  React.useEffect(() => {
    if (quarterFrom !== "ALL" && !availableQuarters.includes(quarterFrom)) setQuarterFrom("ALL");
    if (quarterTo !== "ALL" && !availableQuarters.includes(quarterTo)) setQuarterTo("ALL");
  }, [availableQuarters, quarterFrom, quarterTo]);

  const isRangeActive = quarterFrom !== "ALL" || quarterTo !== "ALL";

  const chartData = useMemo(() => {
    if (!isRangeActive) return quarterlyData;
    const fromKey = quarterFrom === "ALL" ? -Infinity : quarterKey(quarterFrom);
    const toKey = quarterTo === "ALL" ? Infinity : quarterKey(quarterTo);
    return quarterlyData.filter((r) => {
      const k = quarterKey(r.period);
      return k >= fromKey && k <= toKey;
    });
  }, [isRangeActive, quarterlyData, quarterFrom, quarterTo]);

  const scopeMatches = chartData.reduce((sum, r) => sum + r.matches, 0);
  const scopeGs = chartData.reduce((sum, r) => sum + (r.gs_matches ?? 0), 0);
  const gsPct = scopeMatches > 0 ? scopeGs / scopeMatches : null;
  const busiest = chartData.length ? chartData.reduce((a, b) => (b.matches > a.matches ? b : a)) : null;

  // grandSlamEditions filtrado por el MISMO rango de trimestres que el
  // grafico de arriba (Quarter from/to) -- sin esto, el grafico podia
  // mostrar un rango acotado mientras la tabla de abajo (Grand Slam
  // Leaderboard) seguia mostrando la carrera completa, dando numeros
  // que no coincidian entre si en la misma pantalla.
  const editionsInRange = useMemo(() => {
    if (!isRangeActive) return grandSlamEditions;
    const fromKey = quarterFrom === "ALL" ? -Infinity : quarterKey(quarterFrom);
    const toKey = quarterTo === "ALL" ? Infinity : quarterKey(quarterTo);
    return grandSlamEditions.filter((e) => {
      const q = GS_TO_QUARTER[e.tourney_name];
      if (!q) return false;
      const k = quarterKey(`${e.year} Q${q}`);
      return k >= fromKey && k <= toKey;
    });
  }, [isRangeActive, grandSlamEditions, quarterFrom, quarterTo]);

  const quarterMarkers = useMemo(() => {
    const map = {};
    for (const row of chartData) {
      const marker = gsMarkerForQuarter(row.period, grandSlamEditions, selected);
      if (marker) map[row.period] = marker;
    }
    return map;
  }, [chartData, grandSlamEditions, selected]);

  const busiestPeriodGsContext = useMemo(() => {
    if (!busiest) return null;
    const [yearStr, qStr] = busiest.period.split(" Q");
    const year = Number(yearStr);
    const quarter = Number(qStr);
    // Antes filtraba solo por anio, asi que podia mostrar un resultado de
    // un Grand Slam de OTRO trimestre del mismo anio como si fuera el
    // contexto del trimestre mas ocupado (ej. "Busiest Period: 2025 Q2"
    // mostrando el Australian Open, que siempre es Q1). Ahora exige que
    // el trimestre del propio Slam coincida con el del "busiest period".
    const editionsThisQuarter = editionsInRange.filter(
      (e) => e.player === selected && e.year === year && GS_TO_QUARTER[e.tourney_name] === quarter
    );
    if (!editionsThisQuarter.length) return null;
    const best = editionsThisQuarter.reduce((a, b) =>
      (ROUND_RANK[b.best_round] ?? 0) > (ROUND_RANK[a.best_round] ?? 0) ? b : a
    );
    return best.won_title
      ? `Won ${best.tourney_name} ${year}`
      : `Reached ${best.best_round} at ${best.tourney_name} ${year}`;
  }, [busiest, editionsInRange, selected]);

  const gsSummary = useMemo(() => {
    const editions = editionsInRange.filter((e) => e.player === selected);
    const matchesPlayed = editions.reduce((sum, e) => sum + e.matches_played, 0);
    const matchesWon = editions.reduce((sum, e) => sum + (e.matches_won ?? 0), 0);
    const titles = editions.filter((e) => e.won_title).length;
    const semisPlus = editions.filter((e) => e.best_round === "SF" || e.best_round === "F").length;
    return {
      winRate: matchesPlayed > 0 ? matchesWon / matchesPlayed : null,
      titles,
      semisPlus,
      editions: editions.length,
    };
  }, [editionsInRange, selected]);

  const gsLeaderboard = useMemo(() => {
    const byPlayer = new Map();
    for (const e of editionsInRange) {
      if (!byPlayer.has(e.player)) {
        byPlayer.set(e.player, {
          player: e.player,
          ao: 0, rg: 0, wimbledon: 0, usOpen: 0,
          titles: 0, finals: 0, semisPlus: 0, editions: 0,
          matchesPlayed: 0, matchesWon: 0,
        });
      }
      const row = byPlayer.get(e.player);
      row.editions += 1;
      row.matchesPlayed += e.matches_played;
      row.matchesWon += e.matches_won ?? 0;
      if (e.won_title) {
        row.titles += 1;
        const col = GS_COLUMN_KEY[e.tourney_name];
        if (col) row[col] += 1;
      }
      if (e.best_round === "F") row.finals += 1;
      if (e.best_round === "SF" || e.best_round === "F") row.semisPlus += 1;
    }

    const q = tableSearch.trim().toLowerCase();
    return Array.from(byPlayer.values())
      .filter((r) => tourFilter === "ALL" || tourByPlayer.get(r.player) === tourFilter)
      .filter((r) => isEligibleByRanking(r.player))
      .filter((r) => !q || r.player.toLowerCase().includes(q))
      .map((r) => ({
        ...r,
        tour: tourByPlayer.get(r.player) ?? "—",
        winRate: r.matchesPlayed > 0 ? r.matchesWon / r.matchesPlayed : null,
      }))
      .sort((a, b) => b.titles - a.titles || (b.winRate ?? 0) - (a.winRate ?? 0));
  }, [editionsInRange, tourFilter, tourByPlayer, tableSearch, currentRankByPlayer, bestRankByPlayer, rankStatusFilter]);

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
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Quarter from:</label>
          <select value={quarterFrom} onChange={(e) => setQuarterFrom(e.target.value)}>
            <option value="ALL">All</option>
            {availableQuarters.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>to:</label>
          <select value={quarterTo} onChange={(e) => setQuarterTo(e.target.value)}>
            <option value="ALL">All</option>
            {availableQuarters.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Player:</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {filteredPlayers.map((p) => (
              <option key={p.player} value={p.player}>{p.player}</option>
            ))}
          </select>
        </div>
      </div>

      {PLAYER_INJURY_NOTES[selected] && (
        <div
          style={{
            background: "#16233A",
            border: "1px solid #FB5B5B",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "#E7EAF3",
          }}
        >
          {PLAYER_INJURY_NOTES[selected].text}{" "}
          <a
            href={PLAYER_INJURY_NOTES[selected].url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#2DD4BF" }}
          >
            (source)
          </a>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard label="Matches in View" value={scopeMatches} accent="#2DD4BF" />
        <KpiCard label="Grand Slam Matches" value={scopeGs} unit={fmtPct(gsPct)} accent="#F2A93C" />
        <KpiCard
          label="Grand Slam Record"
          value={fmtPct(gsSummary.winRate)}
          unit={`${gsSummary.titles} title${gsSummary.titles === 1 ? "" : "s"} · ${gsSummary.semisPlus} SF+`}
          accent="#FB5B5B"
        />
        <KpiCard label="Non-Grand-Slam Matches" value={scopeMatches - scopeGs} accent="#6C8CFF" />
        <KpiCard
          label="Busiest Period"
          value={busiest ? busiest.period : "—"}
          unit={busiest ? `${busiest.matches} matches${busiestPeriodGsContext ? ` · ${busiestPeriodGsContext}` : ""}` : ""}
          accent="#B18CFF"
        />
      </div>

      <SectionLabel>Match Load Over Time</SectionLabel>
      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        One bar per quarter. 🏆 marks a Grand Slam title that quarter, "SF" marks a semifinal
        reached without winning the title. Use the range filters above to zoom into a specific
        stretch of the career.
      </p>
      <ChartCard title="Matches per Quarter" sub={selected} span2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ left: -10, top: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 10 }}
              interval={Math.max(0, Math.floor(chartData.length / 15))}
            />
            <YAxis allowDecimals={false} width={30} />
            <Tooltip
              cursor={false}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="gs_matches" name="Grand Slam" stackId="a" fill={GS_COLOR} />
            <Bar dataKey="other_matches" name="Other tournaments" stackId="a" fill={OTHER_COLOR} radius={[2, 2, 0, 0]}>
              <LabelList
                dataKey="period"
                position="top"
                content={({ x, y, width, value }) => {
                  const marker = quarterMarkers[value];
                  if (!marker) return null;
                  return (
                    <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="#F2A93C">
                      {marker}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <p className="footnote">
        Source is Jeff Sackmann's official ATP/WTA match results archive, ATP Tour level (Grand
        Slams, Masters, tour-level events) -- Challengers/Futures aren't included, so a gap
        between two matches doesn't necessarily mean real rest; the player may have played
        Challenger-level events that aren't in this dataset. Grand Slam tournaments are
        Australian Open, Roland Garros, Wimbledon and US Open.
      </p>

      <SectionLabel>Grand Slam Leaderboard</SectionLabel>
      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        Sorted by titles won. Click a row to select that player for the KPIs and chart above.
        Respects the same Quarter from/to range as the chart -- narrow the range and this table
        (and the "Grand Slam Record" KPI) update to match. Counts come from Grand Slam finals in
        Jeff Sackmann's official results archive.
      </p>
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
          placeholder="Search player..."
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
      </div>
      <ChartCard title="Players by Grand Slam Titles" sub={`${gsLeaderboard.length} players`} span2>
        <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 720, fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#8A93B3", textAlign: "left", position: "sticky", top: 0, background: "#131A2C" }}>
                <th style={{ padding: "6px 8px" }}>Player</th>
                <th style={{ padding: "6px 8px" }}>Tour</th>
                <th style={{ padding: "6px 8px" }}>AO</th>
                <th style={{ padding: "6px 8px" }}>RG</th>
                <th style={{ padding: "6px 8px" }}>Wimbledon</th>
                <th style={{ padding: "6px 8px" }}>US Open</th>
                <th style={{ padding: "6px 8px" }}>Titles</th>
                <th style={{ padding: "6px 8px" }}>Finals</th>
                <th style={{ padding: "6px 8px" }}>SF+</th>
                <th style={{ padding: "6px 8px" }}>Editions</th>
                <th style={{ padding: "6px 8px" }}>Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {gsLeaderboard.map((r) => (
                <tr
                  key={r.player}
                  onClick={() => setSelected(r.player)}
                  style={{
                    borderTop: "1px solid #1A2138",
                    cursor: "pointer",
                    background: r.player === selected ? "#16233A" : undefined,
                    color: r.player === selected ? "#F2A93C" : "#E7EAF3",
                  }}
                >
                  <td style={{ padding: "6px 8px", fontWeight: r.player === selected ? 600 : 400 }}>{r.player}</td>
                  <td style={{ padding: "6px 8px" }}>{r.tour}</td>
                  <td style={{ padding: "6px 8px" }}>{r.ao || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{r.rg || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{r.wimbledon || "—"}</td>
                  <td style={{ padding: "6px 8px" }}>{r.usOpen || "—"}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{r.titles}</td>
                  <td style={{ padding: "6px 8px" }}>{r.finals}</td>
                  <td style={{ padding: "6px 8px" }}>{r.semisPlus}</td>
                  <td style={{ padding: "6px 8px" }}>{r.editions}</td>
                  <td style={{ padding: "6px 8px" }}>{fmtPct(r.winRate)}</td>
                </tr>
              ))}
              {gsLeaderboard.length === 0 && (
                <tr><td colSpan={11} style={{ padding: "12px 8px", color: "#8A93B3" }}>No players match that search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}