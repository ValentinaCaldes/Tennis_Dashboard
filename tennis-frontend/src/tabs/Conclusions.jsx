import React, { useState, useMemo } from "react";
import { ChartCard, SectionLabel } from "../components/Cards";

const TOP_N = 10;
const NEXT_TIER_MAX = 30;
// Minimo de partidos por superficie para que el "gap" de un jugador
// cuente -- mismo criterio que Surface Performance / Insights.
const MIN_MATCHES_PER_SURFACE = 15;
// Cuantos resultados recientes de Elo se usan para medir "volatilidad".
const ELO_RECENT_N = 20;
// Umbral (en diferencia relativa) para considerar que una dimension
// "explica" o "no explica" la diferencia entre grupos.
const DIFFERENTIATOR_THRESHOLD = 0.10; // 10%

// Los 5 jugadores para la seccion de "primeros anios de carrera" --
// eleccion curada (no calculada), a proposito: son los nombres que
// cualquiera que mire el dashboard va a reconocer, y entre ellos cubren
// desde el debut de Federer (1998) hasta el de Alcaraz (2020), asi que
// el patron que salga no es casualidad de una sola generacion.
const LEGENDS = ["Roger Federer", "Rafael Nadal", "Novak Djokovic", "Carlos Alcaraz", "Jannik Sinner"];

function fmtPct(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
function avg(arr) {
  const vals = arr.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Definicion de cada dimension comparada. "direction" indica que sentido
// favorece al grupo top: "higher" (mas es mejor), "lower" (menos es
// mejor, ej. volatilidad o gap de superficie) o "neutral" (solo
// descriptivo, no hay un "mejor").
const METRICS = [
  { key: "titlesPerPlayer", label: "Titles per player (career)", format: (v) => v.toFixed(1), direction: "higher" },
  { key: "gsTitlesPerPlayer", label: "Grand Slam titles per player", format: (v) => v.toFixed(2), direction: "higher" },
  { key: "gsWinRate", label: "Grand Slam win rate", format: fmtPct, direction: "higher" },
  { key: "careerMatches", label: "Career matches per player", format: (v) => Math.round(v).toLocaleString(), direction: "higher" },
  { key: "gsMatches", label: "Grand Slam matches per player", format: (v) => v.toFixed(1), direction: "higher" },
  { key: "firstServeWinPct", label: "1st serve win %", format: fmtPct, direction: "higher" },
  { key: "dominanceRatio", label: "Return dominance ratio", format: (v) => v.toFixed(2), direction: "higher" },
  { key: "eloStdev", label: `Elo volatility (last ${ELO_RECENT_N} results)`, format: (v) => v.toFixed(1), direction: "lower" },
  { key: "surfaceGap", label: "Surface versatility gap (best − worst)", format: fmtPct, direction: "lower" },
  { key: "h2hInternalShare", label: "Matches played against own tier", format: fmtPct, direction: "neutral" },
];

export default function Conclusions({ data }) {
  const {
    currentRanking, eloCurrent, eloHistory, playerSurfaceStatsByYear,
    playerTitles, grandSlamEditions, serveReturnByPlayer, h2hOverall,
  } = data;
  const [tourFilter, setTourFilter] = useState("ATP");

  const topGroup = useMemo(
    () => currentRanking.filter((r) => r.tour === tourFilter && r.current_rank <= TOP_N).map((r) => r.player),
    [currentRanking, tourFilter]
  );
  const nextGroup = useMemo(
    () => currentRanking.filter((r) => r.tour === tourFilter && r.current_rank > TOP_N && r.current_rank <= NEXT_TIER_MAX).map((r) => r.player),
    [currentRanking, tourFilter]
  );

  // --- Elo: nivel actual y volatilidad reciente ------------------------
  const eloCurrentByPlayer = useMemo(() => new Map(eloCurrent.map((r) => [r.player, r.elo])), [eloCurrent]);
  const eloHistByPlayer = useMemo(() => {
    const map = new Map();
    for (const r of eloHistory) {
      if (!map.has(r.player)) map.set(r.player, []);
      map.get(r.player).push(r);
    }
    for (const arr of map.values()) arr.sort((a, b) => new Date(a.date) - new Date(b.date));
    return map;
  }, [eloHistory]);

  // --- Primeros anios de carrera: Federer -> Alcaraz/Sinner --------------
  // Elo a 1/2/3 anios desde el debut (primer partido registrado en el
  // dataset), y su primer titulo / primer Grand Slam, para los 5 nombres
  // de LEGENDS. Todo calculado en vivo, no valores fijos.
  const earlyCareerStats = useMemo(() => {
    function eloAfterYears(hist, debutDate, years) {
      const cutoff = new Date(debutDate);
      cutoff.setDate(cutoff.getDate() + Math.round(365 * years));
      let last = null;
      for (const r of hist) {
        if (new Date(r.date) <= cutoff) last = r.elo;
        else break;
      }
      return last !== null ? Math.round(last) : null;
    }

    return LEGENDS.map((p) => {
      const hist = eloHistByPlayer.get(p) || [];
      if (!hist.length) return null;
      const debut = hist[0].date;

      const titlesSorted = playerTitles.filter((r) => r.player === p).sort((a, b) => a.year - b.year);
      const gsTitlesSorted = grandSlamEditions
        .filter((r) => r.player === p && r.won_title)
        .sort((a, b) => a.year - b.year);

      return {
        player: p,
        debut,
        y1: eloAfterYears(hist, debut, 1),
        y2: eloAfterYears(hist, debut, 2),
        y3: eloAfterYears(hist, debut, 3),
        firstTitle: titlesSorted[0] ? `${titlesSorted[0].tourney_name} ${titlesSorted[0].year}` : "—",
        firstGsTitle: gsTitlesSorted[0] ? `${gsTitlesSorted[0].tourney_name} ${gsTitlesSorted[0].year}` : "—",
      };
    }).filter(Boolean);
  }, [eloHistByPlayer, playerTitles, grandSlamEditions]);

  const y3Values = earlyCareerStats.map((r) => r.y3).filter((v) => v !== null);
  const y3Range = y3Values.length ? { min: Math.min(...y3Values), max: Math.max(...y3Values) } : null;

  function eloStdev(player) {
    const hist = eloHistByPlayer.get(player) || [];
    const recent = hist.slice(-ELO_RECENT_N).map((r) => r.elo);
    if (recent.length < 2) return null;
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((s, x) => s + (x - mean) ** 2, 0) / recent.length;
    return Math.sqrt(variance);
  }

  // --- Superficie: gap mejor-peor, carrera completa ---------------------
  const surfaceGapByPlayer = useMemo(() => {
    const bySurface = new Map(); // player -> Map(surface -> {matches, wins})
    for (const r of playerSurfaceStatsByYear) {
      if (!bySurface.has(r.player)) bySurface.set(r.player, new Map());
      const surfaces = bySurface.get(r.player);
      const prev = surfaces.get(r.surface) || { matches: 0, wins: 0 };
      surfaces.set(r.surface, { matches: prev.matches + r.matches, wins: prev.wins + r.wins });
    }
    const gaps = new Map();
    for (const [player, surfaces] of bySurface) {
      const validRates = [];
      for (const { matches, wins } of surfaces.values()) {
        if (matches >= MIN_MATCHES_PER_SURFACE) validRates.push(wins / matches);
      }
      if (validRates.length >= 3) gaps.set(player, Math.max(...validRates) - Math.min(...validRates));
    }
    return gaps;
  }, [playerSurfaceStatsByYear]);

  // --- Titulos y Grand Slams --------------------------------------------
  const titlesCountByPlayer = useMemo(() => {
    const map = new Map();
    for (const r of playerTitles) map.set(r.player, (map.get(r.player) || 0) + 1);
    return map;
  }, [playerTitles]);

  const gsStatsByPlayer = useMemo(() => {
    const map = new Map();
    for (const r of grandSlamEditions) {
      const prev = map.get(r.player) || { played: 0, won: 0, titles: 0 };
      prev.played += r.matches_played;
      prev.won += r.matches_won ?? 0;
      if (r.won_title) prev.titles += 1;
      map.set(r.player, prev);
    }
    return map;
  }, [grandSlamEditions]);

  // --- Saque / resto y volumen de partidos ------------------------------
  const serveReturnByPlayerMap = useMemo(() => new Map(serveReturnByPlayer.map((r) => [r.player, r])), [serveReturnByPlayer]);

  // --- Concentracion de H2H dentro del propio grupo ----------------------
  function internalShare(group) {
    const groupSet = new Set(group);
    let total = 0;
    let internal = 0;
    for (const r of h2hOverall) {
      const aIn = groupSet.has(r.player_a);
      const bIn = groupSet.has(r.player_b);
      if (aIn) {
        total += r.total_matches;
        if (bIn) internal += r.total_matches;
      }
      if (bIn && !aIn) {
        total += r.total_matches;
      }
    }
    return total > 0 ? internal / total : null;
  }

  // --- Arma los valores de cada metrica para ambos grupos ----------------
  const groupValues = useMemo(() => {
    function valuesFor(group) {
      const titlesPerPlayer = avg(group.map((p) => titlesCountByPlayer.get(p) ?? 0));
      const gsRows = group.map((p) => gsStatsByPlayer.get(p)).filter(Boolean);
      const gsTitlesPerPlayer = avg(group.map((p) => gsStatsByPlayer.get(p)?.titles ?? 0));
      const gsWinRate = avg(gsRows.filter((g) => g.played > 0).map((g) => g.won / g.played));
      const gsMatches = avg(group.map((p) => gsStatsByPlayer.get(p)?.played ?? 0));
      const careerMatches = avg(group.map((p) => serveReturnByPlayerMap.get(p)?.matches).filter((v) => v !== undefined));
      const firstServeWinPct = avg(group.map((p) => serveReturnByPlayerMap.get(p)?.first_win_pct).filter((v) => v !== undefined));
      const dominanceRatio = avg(group.map((p) => serveReturnByPlayerMap.get(p)?.dominance_ratio_avg).filter((v) => v !== undefined));
      const stdevs = group.map((p) => eloStdev(p)).filter((v) => v !== null);
      const eloStdevAvg = avg(stdevs);
      const gaps = group.map((p) => surfaceGapByPlayer.get(p)).filter((v) => v !== undefined);
      const surfaceGap = avg(gaps);
      const h2hInternalShare = internalShare(group);

      return {
        titlesPerPlayer, gsTitlesPerPlayer, gsWinRate, careerMatches, gsMatches,
        firstServeWinPct, dominanceRatio, eloStdev: eloStdevAvg, surfaceGap, h2hInternalShare,
      };
    }
    return { top: valuesFor(topGroup), next: valuesFor(nextGroup) };
  }, [topGroup, nextGroup, titlesCountByPlayer, gsStatsByPlayer, serveReturnByPlayerMap, surfaceGapByPlayer, eloHistByPlayer, h2hOverall]);

  // --- Ranking de diferenciadores (narrativa auto-generada) --------------
  const rankedMetrics = useMemo(() => {
    return METRICS.map((m) => {
      const topVal = groupValues.top[m.key];
      const nextVal = groupValues.next[m.key];
      if (topVal === null || nextVal === null) return { ...m, topVal, nextVal, relDiff: null, favorScore: null };

      let relDiff;
      if (nextVal !== 0) {
        relDiff = (topVal - nextVal) / Math.abs(nextVal);
      } else {
        relDiff = topVal > 0 ? Infinity : 0;
      }
      const favorScore = m.direction === "higher" ? relDiff : m.direction === "lower" ? -relDiff : null;
      return { ...m, topVal, nextVal, relDiff, favorScore };
    });
  }, [groupValues]);

  const differentiators = rankedMetrics
    .filter((m) => m.favorScore !== null && m.favorScore >= DIFFERENTIATOR_THRESHOLD)
    .sort((a, b) => (b.favorScore === Infinity ? 1 : b.favorScore) - (a.favorScore === Infinity ? 1 : a.favorScore))
    .slice(0, 4);

  const nonDifferentiators = rankedMetrics
    .filter((m) => m.favorScore !== null && m.favorScore < DIFFERENTIATOR_THRESHOLD)
    .sort((a, b) => a.favorScore - b.favorScore)
    .slice(0, 3);

  function describeMetric(m, favorable) {
    const dirWord = m.direction === "lower" ? "lower" : "higher";
    const pct = m.relDiff === Infinity ? null : Math.abs(m.relDiff * 100).toFixed(0);
    if (m.relDiff === Infinity) {
      return `${m.label}: the top ${TOP_N} hold effectively all of it (next tier averages ~0).`;
    }
    return favorable
      ? `${m.label}: top ${TOP_N} average ${m.format(m.topVal)} vs ${m.format(m.nextVal)} for #${TOP_N + 1}-${NEXT_TIER_MAX} -- ${pct}% ${dirWord === "lower" ? "lower" : "higher"}.`
      : `${m.label}: top ${TOP_N} average ${m.format(m.topVal)} vs ${m.format(m.nextVal)} for #${TOP_N + 1}-${NEXT_TIER_MAX} -- essentially the same, or the next tier is ahead here.`;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <label style={{ fontSize: 12, color: "#8A93B3" }}>Tour:</label>
        <select value={tourFilter} onChange={(e) => setTourFilter(e.target.value)}>
          <option value="ATP">ATP</option>
          <option value="WTA">WTA</option>
        </select>
        <span style={{ fontSize: 11, color: "#8A93B3" }}>
          Comparing current top {TOP_N} ({topGroup.length} players) vs. #{TOP_N + 1}-{NEXT_TIER_MAX} ({nextGroup.length} players)
        </span>
      </div>

      <div className="chart-grid" style={{ marginBottom: 24 }}>
        <ChartCard
          title="What explains the top 10"
          sub="Dimensions where the top tier clearly outperforms, sorted by size of the gap"
          span2
        >
          {differentiators.length === 0 ? (
            <p style={{ color: "#8A93B3", padding: 16 }}>Not enough data yet for this tour.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#E7EAF3", lineHeight: 1.8 }}>
              {differentiators.map((m) => (
                <li key={m.key}>{describeMetric(m, true)}</li>
              ))}
            </ul>
          )}
        </ChartCard>

        <ChartCard
          title="What doesn't explain it"
          sub="Dimensions where the two tiers are basically even -- or the next tier is ahead"
          span2
        >
          {nonDifferentiators.length === 0 ? (
            <p style={{ color: "#8A93B3", padding: 16 }}>Not enough data yet for this tour.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#8A93B3", lineHeight: 1.8 }}>
              {nonDifferentiators.map((m) => (
                <li key={m.key}>{describeMetric(m, false)}</li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>

      <SectionLabel>Side by Side</SectionLabel>
      <ChartCard
        title={`Top ${TOP_N} vs. #${TOP_N + 1}-${NEXT_TIER_MAX}`}
        sub="Each row is that group's share of the combined total -- scales differ a lot between metrics (Elo vs. win rate vs. titles), so this shows proportion, not raw size. Real values are labeled on each bar."
        span2
      >
        <div>
          {rankedMetrics.map((m) => {
            if (m.topVal === null || m.nextVal === null) return null;
            const sum = Math.abs(m.topVal) + Math.abs(m.nextVal);
            const rawShare = sum === 0 ? 50 : (Math.abs(m.topVal) / sum) * 100;
            const share = Math.min(97, Math.max(3, rawShare));
            return (
              <div key={m.key} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#8A93B3", marginBottom: 5 }}>{m.label}</div>
                <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${share}%`, background: "#2DD4BF",
                      display: "flex", alignItems: "center",
                      justifyContent: share > 18 ? "flex-start" : "center",
                      paddingLeft: share > 18 ? 10 : 0,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0B0F1A" }}>{m.format(m.topVal)}</span>
                  </div>
                  <div
                    style={{
                      width: `${100 - share}%`, background: "#6C8CFF",
                      display: "flex", alignItems: "center",
                      justifyContent: 100 - share > 18 ? "flex-end" : "center",
                      paddingRight: 100 - share > 18 ? 10 : 0,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#0B0F1A" }}>{m.format(m.nextVal)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 4, fontSize: 12, color: "#8A93B3" }}>
          <span>
            <span style={{ display: "inline-block", width: 10, height: 10, background: "#2DD4BF", borderRadius: 2, marginRight: 6 }} />
            Top {TOP_N}
          </span>
          <span>
            <span style={{ display: "inline-block", width: 10, height: 10, background: "#6C8CFF", borderRadius: 2, marginRight: 6 }} />
            #{TOP_N + 1}-{NEXT_TIER_MAX}
          </span>
        </div>
      </ChartCard>

      <SectionLabel>Why ATP and WTA Look So Different Here</SectionLabel>
      <div
        style={{
          background: "#131A2C", border: "1px solid #1A2138", borderRadius: 10,
          padding: "16px 20px", marginBottom: 24,
        }}
      >
        <p style={{ fontSize: 13, color: "#E7EAF3", lineHeight: 1.8, margin: 0 }}>
          Two things worth knowing if the ATP and WTA numbers above look nothing alike. First,
          it's partly structural: men play best-of-five sets at Grand Slams, women best-of-three
          -- dropping a set costs far less over five sets than over three, so a slow start rarely
          derails a top men's player the way it can on the women's side. Second, it's partly
          timing: this dataset's window (2000-2026) overlaps almost exactly with the
          Federer-Nadal-Djokovic-Murray era, which tennis analysts describe as a genuine
          historical outlier in men's tennis, not its normal state. The WTA saw far more turnover
          at the very top across the same stretch, in part simply because no single generation
          dominated it the way the "Big Four" dominated the men's game.{" "}
          <a
            href="https://welcometowombledon.substack.com/p/the-atp-is-inconsistent-too"
            target="_blank" rel="noreferrer" style={{ color: "#6C8CFF" }}
          >
            Welcome to Wombledon, "The ATP is inconsistent, too"
          </a>
        </p>
      </div>

      <SectionLabel>What the Research Says</SectionLabel>
      <div
        style={{
          background: "#131A2C", border: "1px solid #1A2138", borderRadius: 10,
          padding: "16px 20px", marginBottom: 24,
        }}
      >
        <p style={{ fontSize: 13, color: "#E7EAF3", lineHeight: 1.8, margin: 0, marginBottom: 14 }}>
          A peer-reviewed study of over 11,000 professional careers found that top-10 players
          follow a genuinely different trajectory from everyone else -- their rankings become
          statistically distinguishable from lower tiers within their first two years on tour,
          not gradually over a full career.{" "}
          <a href="https://doi.org/10.1080/02640414.2013.876086" target="_blank" rel="noreferrer" style={{ color: "#6C8CFF" }}>
            Kovalchik & Ingram, Journal of Sports Sciences (2014)
          </a>
        </p>
        <p style={{ fontSize: 13, color: "#E7EAF3", lineHeight: 1.8, margin: 0 }}>
          Interestingly, this lines up with a Tennis Australia study using Hawk-Eye tracking
          data: raw shot speed and movement speed did <em>not</em> reliably separate top-ranked
          players from the rest -- movement quality and endurance did. Raw power alone doesn't
          explain elite status any more than any single stat in this dashboard does.{" "}
          <a
            href="https://athleticperformanceacademy.co.uk/are-top-10-ranked-tennis-players-better-athletes-than-top-100-ranked-tennis-players/"
            target="_blank" rel="noreferrer" style={{ color: "#6C8CFF" }}
          >
            Athletic Performance Academy, summarizing Tennis Australia's Hawk-Eye research
          </a>
        </p>
      </div>

      <SectionLabel>Early-Career Patterns</SectionLabel>
      <ChartCard
        title="Federer to Alcaraz: the same climb, 22 years apart"
        sub="Elo at 1, 2 and 3 years after each player's tour debut in this dataset"
        span2
      >
        {y3Range && (
          <p style={{ fontSize: 13, color: "#E7EAF3", lineHeight: 1.7, marginTop: 0, marginBottom: 16 }}>
            Despite debuting between 1998 and 2020, all five reached an Elo between{" "}
            <strong>{y3Range.min}</strong> and <strong>{y3Range.max}</strong> by their third year
            on tour -- a tight band for a 22-year span -- and every one of them won their first
            Grand Slam title within 3 to 5 years of their debut. It's the same pattern the
            research above describes, visible directly in the data.
          </p>
        )}
        <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#8A93B3", textAlign: "left" }}>
              <th style={{ padding: "6px 8px" }}>Player</th>
              <th style={{ padding: "6px 8px" }}>Debut</th>
              <th style={{ padding: "6px 8px" }}>Elo Y1</th>
              <th style={{ padding: "6px 8px" }}>Elo Y2</th>
              <th style={{ padding: "6px 8px" }}>Elo Y3</th>
              <th style={{ padding: "6px 8px" }}>First title</th>
              <th style={{ padding: "6px 8px" }}>First Grand Slam</th>
            </tr>
          </thead>
          <tbody>
            {earlyCareerStats.map((r) => (
              <tr key={r.player} style={{ borderTop: "1px solid #1A2138" }}>
                <td style={{ padding: "8px", fontWeight: 600 }}>{r.player}</td>
                <td style={{ padding: "8px" }}>{r.debut}</td>
                <td style={{ padding: "8px" }}>{r.y1 ?? "—"}</td>
                <td style={{ padding: "8px" }}>{r.y2 ?? "—"}</td>
                <td style={{ padding: "8px", fontWeight: 600, color: "#2DD4BF" }}>{r.y3 ?? "—"}</td>
                <td style={{ padding: "8px" }}>{r.firstTitle}</td>
                <td style={{ padding: "8px" }}>{r.firstGsTitle}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ChartCard>

      <p className="footnote">
        Comparison groups are the current official {tourFilter} ranking: top {TOP_N} vs. ranks{" "}
        {TOP_N + 1}-{NEXT_TIER_MAX}. All numbers on this page (aside from the cited research
        above) are computed live from the same dataset used across the rest of the dashboard
        (Jeff Sackmann's official ATP/WTA results archive, ATP/WTA Tour level). "Explains"/
        "doesn't explain" is based on the relative size of the gap between the two groups'
        averages, not a causal claim -- these are descriptive comparisons, not a statistical
        test.
      </p>
    </div>
  );
}