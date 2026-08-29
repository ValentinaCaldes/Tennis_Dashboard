import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";

const BAR_COLOR = "#6C8CFF";
const RELIABLE_COLOR = "#2DD4BF";
const UNRELIABLE_COLOR = "#3A4258"; // mismo tono que el fondo de panel, mas apagado

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

export default function MatchLoad({ data }) {
  const { players, matchesPerPeriod, restDaysPerformance } = data;
  const [tourFilter, setTourFilter] = useState("ALL");
  const [periodType, setPeriodType] = useState("month");

  const tourByPlayer = useMemo(() => {
    const map = new Map();
    for (const p of players) map.set(p.player, p.tour);
    return map;
  }, [players]);

  const filteredPlayers = useMemo(
    () => (tourFilter === "ALL" ? players : players.filter((p) => p.tour === tourFilter)),
    [players, tourFilter]
  );

  const [selected, setSelected] = useState(filteredPlayers[0]?.player ?? "");
  React.useEffect(() => {
    if (filteredPlayers.length && !filteredPlayers.some((p) => p.player === selected)) {
      setSelected(filteredPlayers[0].player);
    }
  }, [filteredPlayers, selected]);

  const playerLoad = useMemo(() => {
    return matchesPerPeriod
      .filter((r) => r.player === selected && r.period_type === periodType)
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [matchesPerPeriod, selected, periodType]);

  const totalMatches = playerLoad.reduce((sum, r) => sum + r.matches, 0);
  const busiest = playerLoad.length
    ? playerLoad.reduce((a, b) => (b.matches > a.matches ? b : a))
    : null;
  const avgPerPeriod = playerLoad.length ? totalMatches / playerLoad.length : null;

  // El bucket de "hueco de datos" no es descanso real (ver footnote) -- lo
  // mostramos aparte, mas apagado, para no mezclarlo visualmente con los
  // buckets que si son interpretables como descanso genuino.
  const reliableBuckets = restDaysPerformance.filter((r) => !r.rest_bucket.includes("data gap"));
  const unreliableBucket = restDaysPerformance.find((r) => r.rest_bucket.includes("data gap"));

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
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Player:</label>
          <select value={selected} onChange={(e) => setSelected(e.target.value)}>
            {filteredPlayers.map((p) => (
              <option key={p.player} value={p.player}>{p.player}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ marginRight: 8, fontSize: 12, color: "#8A93B3" }}>Group by:</label>
          <select value={periodType} onChange={(e) => setPeriodType(e.target.value)}>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Total Matches (charted)" value={totalMatches} accent="#2DD4BF" />
        <KpiCard label={`Active ${periodType === "week" ? "Weeks" : "Months"}`} value={playerLoad.length} accent="#6C8CFF" />
        <KpiCard label={`Avg. Matches / ${periodType === "week" ? "Week" : "Month"}`} value={avgPerPeriod ? avgPerPeriod.toFixed(1) : "—"} accent="#B18CFF" />
        <KpiCard label="Busiest Period" value={busiest ? busiest.period : "—"} unit={busiest ? `${busiest.matches} matches` : ""} accent="#F2A93C" />
      </div>

      <SectionLabel>Match Load Over Time</SectionLabel>
      <ChartCard title={`Matches per ${periodType === "week" ? "Week" : "Month"}`} sub={selected} span2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={playerLoad} margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 9 }} interval={Math.max(0, Math.floor(playerLoad.length / 15))} />
            <YAxis allowDecimals={false} width={30} />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <Bar dataKey="matches" fill={BAR_COLOR} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <SectionLabel>Win Rate by Days of Rest (all players, aggregate)</SectionLabel>
      <p style={{ fontSize: 11, color: "#8A93B3", marginTop: -6, marginBottom: 12 }}>
        This chart is not player-specific -- it's aggregated across every charted match, because
        per-player rest samples are too small to mean anything. The greyed-out bar on the right
        isn't real rest (see note below) -- only the colored bars are interpretable.
      </p>
      <ChartCard title="Win Rate by Rest Bucket" span2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={restDaysPerformance}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
            <XAxis dataKey="rest_bucket" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={70} />
            <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 1]} width={40} />
            <Tooltip
              formatter={(v) => fmtPct(v)}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
            />
            <Bar dataKey="win_rate" radius={[3, 3, 0, 0]}>
              {restDaysPerformance.map((r, i) => (
                <Cell key={i} fill={r.rest_bucket.includes("data gap") ? UNRELIABLE_COLOR : RELIABLE_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <p className="footnote">
        The Match Charting Project only covers a hand-picked subset of matches, not every match a
        player has played. A large gap between two "consecutive" charted matches almost always
        means real matches happened in between that just weren't charted -- not that the player
        actually rested that long
        {unreliableBucket ? ` (median gap in that bucket is around 50+ days, which is impossible as genuine rest on tour)` : ""}.
        Only the 0-30 day buckets are treated as real rest here. Coverage reflects the Match
        Charting Project dataset, not the full tour, so a player's charted matches don't
        necessarily reflect their real schedule.
      </p>
    </div>
  );
}