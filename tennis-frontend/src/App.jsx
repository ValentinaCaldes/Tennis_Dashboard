import React, { useState } from "react";
import * as tennisData from "./tennisData";
import PlayerOverview from "./tabs/PlayerOverview";
import SurfacePerformance from "./tabs/SurfacePerformance";
import ServeReturn from "./tabs/ServeReturn";
import HeadToHead from "./tabs/HeadToHead";
import MatchLoad from "./tabs/MatchLoad";
import Insights from "./tabs/Insights";

const TABS = [
  { id: "overview", idx: "01", stage: "PROFILE", label: "Player Overview", Component: PlayerOverview },
  { id: "surface", idx: "02", stage: "SURFACE", label: "Surface Performance", Component: SurfacePerformance },
  { id: "serve", idx: "03", stage: "SERVE", label: "Serve & Return", Component: ServeReturn },
  { id: "h2h", idx: "04", stage: "RIVALS", label: "Head-to-Head", Component: HeadToHead },
  { id: "load", idx: "05", stage: "SCHEDULE", label: "Match Load & Fatigue", Component: MatchLoad },
  { id: "insights", idx: "06", stage: "INSIGHTS", label: "Insights & Rankings", Component: Insights },
];

const TAB_META = {
  overview: { eyebrow: "Elo · History", subtitle: "A player's profile: own Elo rating, evolution over time, matches and streak." },
  surface: { eyebrow: "Hard · Clay · Grass", subtitle: "Win rate by surface -- who's a specialist and who's all-court." },
  serve: { eyebrow: "Dominance Ratio · Break Points", subtitle: "Serve and return metrics by player." },
  h2h: { eyebrow: "Head to Head", subtitle: "Direct history between two players, overall and by surface." },
  load: { eyebrow: "Rest · Fatigue", subtitle: "Matches played per week/month and how rest affects performance." },
  insights: { eyebrow: "Rankings · Findings", subtitle: "Elo leaderboard, surface specialists, and the analysis findings." },
};

export default function App() {
  const [active, setActive] = useState("overview");
  const activeTab = TABS.find((t) => t.id === active);
  const meta = TAB_META[active];
  const ActiveComponent = activeTab.Component;

  return (
    <div className="scm-root">
      <nav className="flow-rail">
        {TABS.map((t, i) => (
          <React.Fragment key={t.id}>
            <button className={`flow-node${active === t.id ? " active" : ""}`} onClick={() => setActive(t.id)}>
              <span className="idx">{t.idx}</span>
              <span>
                <span className="label-top">{t.stage}</span>
                <span className="label-main">{t.label}</span>
              </span>
            </button>
            {i < TABS.length - 1 && <span className="flow-chevron">›</span>}
          </React.Fragment>
        ))}
      </nav>

      <header className="scm-header">
        <div className="scm-eyebrow">{activeTab.idx}-{activeTab.stage} · {meta.eyebrow}</div>
        <h1 className="scm-title">{activeTab.label}</h1>
        <p className="scm-subtitle">{meta.subtitle}</p>
      </header>

      <main className="scm-body">
        {/* Le pasamos TODO el objeto tennisData -- cada pestana toma solo
            los arrays que necesita (ver imports arriba de cada tab). */}
        <ActiveComponent data={tennisData} />
      </main>
    </div>
  );
}