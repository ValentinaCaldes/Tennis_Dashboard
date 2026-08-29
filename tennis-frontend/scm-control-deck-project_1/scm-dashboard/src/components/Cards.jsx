import React from "react";

export function KpiCard({ label, value, unit, accent }) {
  return (
    <div className="kpi-card" style={{ "--accent": accent }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit ? <span className="unit">{unit}</span> : null}
      </div>
    </div>
  );
}

export function ChartCard({ title, sub, span2, children }) {
  return (
    <div className={`chart-card${span2 ? " span-2" : ""}`}>
      {title ? <div className="chart-card-title">{title}</div> : null}
      {sub ? <div className="chart-card-sub">{sub}</div> : null}
      {children}
    </div>
  );
}

export function SectionLabel({ children }) {
  return <div className="section-label">{children}</div>;
}
