import React from "react";

export function KpiCard({ label, value, unit, accent = "#2DD4BF" }) {
  return (
    <div className="kpi-card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit ? <span className="kpi-unit"> {unit}</span> : null}
      </div>
    </div>
  );
}

export function ChartCard({ title, sub, span2 = false, children }) {
  return (
    <div className={`chart-card${span2 ? " span2" : ""}`}>
      <div className="chart-card-header">
        <h3 className="chart-card-title">{title}</h3>
        {sub ? <p className="chart-card-sub">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return <div className="section-label">{children}</div>;
}
