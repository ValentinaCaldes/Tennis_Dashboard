import React, { useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ReferenceLine, BarChart, ScatterChart, Scatter,
} from "recharts";
import { ChartCard, SectionLabel } from "../components/Cards";
import {
  paretoBySku, costBreakdown, generateInsights,
  suppliersDrivingDefects, suppliersDrivingCost, demandVariabilityByProductType,
  eoqSafetyStockReorder, correlationPairs, whatIfShippingLeadTime, defectRootCause, kpiTree,
  fmtUSD, fmtNum, fmtPct,
} from "../utils/calculations";

const PALETTE = ["#F2A93C", "#6C8CFF", "#2DD4BF", "#B18CFF", "#FB5B5B"];
const SEVERITY_COLOR = { positive: "#2DD4BF", risk: "#FB5B5B", info: "#6C8CFF" };

function corrBadge(r) {
  const cls = r > 0.4 ? "corr-strong-pos" : r < -0.4 ? "corr-strong-neg" : "corr-weak";
  return <span className={`corr-badge ${cls}`}>r = {r.toFixed(2)}</span>;
}

export default function OptimizationRecs({ rows }) {
  const pareto = paretoBySku(rows);
  const costs = costBreakdown(rows);
  const insights = generateInsights(rows);

  const defectDrivers = suppliersDrivingDefects(rows).slice(0, 8);
  const costDrivers = suppliersDrivingCost(rows).slice(0, 8);
  const demandVar = demandVariabilityByProductType(rows);
  const eoqTable = eoqSafetyStockReorder(rows);
  const eoqTotals = eoqTable.reduce(
    (acc, d) => ({
      eoq: acc.eoq + d.eoq,
      safetyStock: acc.safetyStock + d.safetyStock,
      reorderPoint: acc.reorderPoint + d.reorderPoint,
    }),
    { eoq: 0, safetyStock: 0, reorderPoint: 0 }
  );
  const correlations = correlationPairs(rows);
  const rootCause = defectRootCause(rows);
  const tree = kpiTree(rows);

  const [shipChange, setShipChange] = useState(0);
  const [leadChange, setLeadChange] = useState(0);
  const whatIf = whatIfShippingLeadTime(rows, shipChange, leadChange);

  return (
    <div>
      <SectionLabel>Pareto Analysis</SectionLabel>
      <div className="chart-grid">
        <ChartCard title="Revenue Pareto by SKU" sub="80/20 rule — cumulative revenue share across all SKUs" span2>
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart data={pareto} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="sku" tick={{ fontSize: 9 }} interval={4} angle={-45} textAnchor="end" height={55} />
              <YAxis yAxisId="left" tickFormatter={(v) => `$${v / 1000}k`} width={50} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
              <Tooltip formatter={(v, n) => (n === "cumulativePct" ? fmtPct(v) : fmtUSD(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#6C8CFF" radius={[2, 2, 0, 0]} />
              <Line yAxisId="right" dataKey="cumulativePct" name="Cumulative %" stroke="#2DD4BF" strokeWidth={2} dot={false} />
              <ReferenceLine yAxisId="right" y={80} stroke="#F2A93C" strokeDasharray="4 4" label={{ value: "80%", fontSize: 10, fill: "#F2A93C" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Cost Breakdown" sub="Manufacturing vs Shipping vs Logistics">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={costs} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                {costs.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtUSD(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <SectionLabel>Suppliers Driving Risk</SectionLabel>
      <div className="chart-grid">
        <ChartCard title="Suppliers Driving Defects" sub="Impact = avg defect rate × revenue supported ($ at risk)">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={defectDrivers} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${v.toFixed(0)}`} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtUSD(v, 0)} />
              <Bar dataKey="impact" fill="#FB5B5B" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Suppliers Driving Cost" sub="Manufacturing + shipping cost attributable">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={costDrivers} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${v / 1000}k`} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtUSD(v, 0)} />
              <Bar dataKey="totalCost" fill="#F2A93C" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Demand Variability by Product Type" sub="Coefficient of variation of units sold across SKUs (proxy — no time series available)">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={demandVar}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis width={40} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <Tooltip formatter={(v) => fmtPct(v)} />
              <Bar dataKey="cv" fill="#B18CFF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <SectionLabel>EOQ · Safety Stock · Reorder Point</SectionLabel>
      <ChartCard
        sub={
          <>Assumption-based (dataset lacks ordering/holding cost fields): order cost = $50/order, holding cost = 20% of unit price/yr, service level Z = 1.65 (~95%). Snapshot demand ("Number of products sold") treated as an annual proxy; demand variability proxied via the product-type CV above.</>
        }
      >
        <div className="kpi-grid" style={{ marginBottom: 14 }}>
          <div className="kpi-card" style={{ "--accent": "#6C8CFF" }}>
            <div className="kpi-label">Total EOQ (all SKUs)</div>
            <div className="kpi-value" style={{ fontSize: 17 }}>{fmtNum(eoqTotals.eoq)} <span className="unit">units</span></div>
          </div>
          <div className="kpi-card" style={{ "--accent": "#F2A93C" }}>
            <div className="kpi-label">Total Safety Stock</div>
            <div className="kpi-value" style={{ fontSize: 17 }}>{fmtNum(eoqTotals.safetyStock)} <span className="unit">units</span></div>
          </div>
          <div className="kpi-card" style={{ "--accent": "#2DD4BF" }}>
            <div className="kpi-label">Total Reorder Point</div>
            <div className="kpi-value" style={{ fontSize: 17 }}>{fmtNum(eoqTotals.reorderPoint)} <span className="unit">units</span></div>
          </div>
        </div>
        <div className="table-scroll">
          <table className="scm-table">
            <thead>
              <tr><th>SKU</th><th>Product Type</th><th>Annual Demand</th><th>Lead Time</th><th>EOQ</th><th>Safety Stock</th><th>Reorder Point</th></tr>
            </thead>
            <tbody>
              {eoqTable.map((d) => (
                <tr key={d.sku}>
                  <td className="name-cell">{d.sku}</td>
                  <td>{d.productType}</td>
                  <td>{fmtNum(d.annualDemand)}</td>
                  <td>{d.leadTime}d</td>
                  <td>{fmtNum(d.eoq, 1)}</td>
                  <td>{fmtNum(d.safetyStock, 1)}</td>
                  <td style={{ color: "#2DD4BF" }}>{fmtNum(d.reorderPoint, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <SectionLabel>Correlation Analysis</SectionLabel>
      <div className="chart-grid">
        {correlations.map((c) => (
          <ChartCard key={c.key} title={c.title} sub={corrBadge(c.r)}>
            <ResponsiveContainer width="100%" height={210}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
                <XAxis type="number" dataKey="x" tick={{ fontSize: 10 }} />
                <YAxis type="number" dataKey="y" width={35} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Scatter data={c.data} fill="#6C8CFF" fillOpacity={0.65} />
              </ScatterChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}
      </div>

      <SectionLabel>What-If Analysis</SectionLabel>
      <ChartCard sub="Model the profit and inventory impact of a shipping-cost or lead-time change">
        <div className="what-if-grid">
          <div>
            <div className="slider-row">
              <span style={{ fontSize: 12, color: "var(--text-dim)", minWidth: 120 }}>Shipping cost change</span>
              <input type="range" min={-50} max={50} value={shipChange} onChange={(e) => setShipChange(Number(e.target.value))} />
              <span className="slider-value">{shipChange > 0 ? "+" : ""}{shipChange}%</span>
            </div>
            <div className="slider-row">
              <span style={{ fontSize: 12, color: "var(--text-dim)", minWidth: 120 }}>Lead time change</span>
              <input type="range" min={-50} max={50} value={leadChange} onChange={(e) => setLeadChange(Number(e.target.value))} />
              <span className="slider-value">{leadChange > 0 ? "+" : ""}{leadChange}%</span>
            </div>
          </div>
          <div className="kpi-grid" style={{ marginBottom: 0 }}>
            <div className="kpi-card" style={{ "--accent": whatIf.profitImpact >= 0 ? "#2DD4BF" : "#FB5B5B" }}>
              <div className="kpi-label">Profit Impact</div>
              <div className="kpi-value" style={{ fontSize: 17 }}>{whatIf.profitImpact >= 0 ? "+" : ""}{fmtUSD(whatIf.profitImpact)}</div>
            </div>
            <div className="kpi-card" style={{ "--accent": "#6C8CFF" }}>
              <div className="kpi-label">Total Reorder Point</div>
              <div className="kpi-value" style={{ fontSize: 17 }}>{fmtNum(whatIf.newReorderTotal)} <span className="unit">units</span></div>
              <div className="footnote">{whatIf.reorderDelta >= 0 ? "+" : ""}{fmtNum(whatIf.reorderDelta, 1)} vs baseline</div>
            </div>
          </div>
        </div>
      </ChartCard>

      <SectionLabel>Root Cause — High Defect Rate</SectionLabel>
      <div className="chart-grid">
        <ChartCard title="Where defects concentrate">
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
            <strong style={{ color: "var(--text)" }}>{rootCause.topSupplier?.name}</strong> has the highest average defect rate at {fmtPct(rootCause.topSupplier?.defectRate)}.
            By product type, <strong style={{ color: "var(--text)" }}>{rootCause.topProductType?.name}</strong> leads at {fmtPct(rootCause.topProductType?.defectRate)},
            and by route, <strong style={{ color: "var(--text)" }}>{rootCause.topRoute?.name}</strong> leads at {fmtPct(rootCause.topRoute?.defectRate)}.
            {" "}{rootCause.highDefectCount} SKUs run at 1.5× the fleet average defect rate ({fmtPct(rootCause.overallAvg)}) or higher.
          </p>
          <div style={{ marginTop: 10 }}>{corrBadge(rootCause.leadDefectCorrelation)} <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 8 }}>mfg lead time → defect rate correlation</span></div>
        </ChartCard>
        <ChartCard title="KPI Tree" sub="Revenue and its component drivers">
          <div className="kpi-tree-wrap">
            <div className="kpi-tree-root">
              <div className="kpi-label">Total Revenue</div>
              <div className="kpi-value">{fmtUSD(tree.revenue)}</div>
            </div>
            <div className="kpi-tree-stem" />
            <div className="kpi-tree-row">
              {tree.children.map((c) => (
                <div key={c.label} className="kpi-tree-node">
                  <div className="kpi-label">{c.label}</div>
                  <div className="kpi-value">{c.value}</div>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      <SectionLabel>AI / Analytics Recommendations</SectionLabel>
      {insights.map((ins, i) => (
        <div key={i} className="insight-card" style={{ "--accent": SEVERITY_COLOR[ins.severity] }}>
          <span className="insight-tag">{ins.type}</span>
          <span>{ins.text}</span>
        </div>
      ))}
    </div>
  );
}
