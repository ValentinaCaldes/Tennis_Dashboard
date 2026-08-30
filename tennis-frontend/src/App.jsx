import React, { useState, useEffect } from "react";
import PlayerOverview from "./tabs/PlayerOverview";
import SurfacePerformance from "./tabs/SurfacePerformance";
import ServeReturn from "./tabs/ServeReturn";
import HeadToHead from "./tabs/HeadToHead";
import MatchLoad from "./tabs/MatchLoad";
import Insights from "./tabs/Insights";
import Conclusions from "./tabs/Conclusions";

const TABS = [
  { id: "overview", idx: "01", stage: "PROFILE", label: "Player Overview", Component: PlayerOverview },
  { id: "surface", idx: "02", stage: "SURFACE", label: "Surface Performance", Component: SurfacePerformance },
  { id: "serve", idx: "03", stage: "SERVE", label: "Serve & Return", Component: ServeReturn },
  { id: "h2h", idx: "04", stage: "RIVALS", label: "Head-to-Head", Component: HeadToHead },
  { id: "load", idx: "05", stage: "SCHEDULE", label: "Match Load & Fatigue", Component: MatchLoad },
  { id: "insights", idx: "06", stage: "INSIGHTS", label: "Insights & Rankings", Component: Insights },
  { id: "conclusions", idx: "07", stage: "ANALYSIS", label: "Conclusions", Component: Conclusions },
];

const TAB_META = {
  overview: { eyebrow: "Elo · History", subtitle: "A player's profile: own Elo rating, evolution over time, matches and streak." },
  surface: { eyebrow: "Hard · Clay · Grass", subtitle: "Win rate by surface -- who's a specialist and who's all-court." },
  serve: { eyebrow: "Dominance Ratio · Break Points", subtitle: "Serve and return metrics by player." },
  h2h: { eyebrow: "Head to Head", subtitle: "Direct history between two players, overall and by surface." },
  load: { eyebrow: "Rest · Fatigue", subtitle: "Matches played per week/month and how rest affects performance." },
  insights: { eyebrow: "Rankings · Findings", subtitle: "Elo leaderboard, surface specialists, and the analysis findings." },
  conclusions: { eyebrow: "Top 10 · Why", subtitle: "What actually separates the current top 10 from the next tier, computed live from the data." },
};

export default function App() {
  const [active, setActive] = useState("overview");

  // Los datos ya no se importan como modulo JS (`tennisData.js` llego a
  // pesar 80+ MB, y Vite/esbuild se quedaban sin memoria intentando
  // parsearlo como codigo). Ahora vive en public/tennisData.json y se
  // pide con fetch al arrancar -- el navegador lo parsea nativo como
  // JSON, mucho mas liviano que parsearlo como AST de JavaScript.
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    // cache: "no-store" -- sin esto, el navegador puede quedarse con una
    // copia vieja de tennisData.json en cache y no darse cuenta de que
    // el archivo cambio en disco (regenerarlo con 05_export_dashboard_
    // json.py no alcanza para verlo reflejado si el fetch sirve la
    // version cacheada). Como este archivo se regenera seguido durante
    // el desarrollo, siempre pedimos la version mas nueva.
    fetch("/tennisData.json", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err) => setLoadError(err.message));
  }, []);

  const activeTab = TABS.find((t) => t.id === active);
  const meta = TAB_META[active];
  const ActiveComponent = activeTab.Component;

  if (loadError) {
    return (
      <div className="scm-root">
        <p style={{ color: "#FB5B5B", padding: 24 }}>
          Couldn't load tennisData.json ({loadError}). Make sure it exists in
          the frontend's public/ folder -- run 05_export_dashboard_json.py to
          generate it.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="scm-root">
        <p style={{ color: "#8A93B3", padding: 24 }}>Loading data...</p>
      </div>
    );
  }

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
        {/* Le pasamos TODO el objeto data (el JSON ya parseado) -- cada
            pestana toma solo los campos que necesita (ver imports arriba
            de cada tab). */}
        <ActiveComponent data={data} />
      </main>
    </div>
  );
}