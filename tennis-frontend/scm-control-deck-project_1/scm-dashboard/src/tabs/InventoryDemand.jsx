import React from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";
import {
  getInventoryKpis, stockBySkuTop, stockVsSold, inventoryByProductType, availabilityHeatmap,
  stockSalesBubble, abcAnalysis, fmtUSD, fmtNum, fmtPct,
} from "../utils/calculations";

const PALETTE = ["#2DD4BF", "#6C8CFF", "#F2A93C", "#B18CFF", "#FB5B5B"];
const CLASS_COLOR = { A: "#2DD4BF", B: "#F2A93C", C: "#FB5B5B" };

function heatColor(pct) {
  // 0-100 availability score -> red (low) through amber to teal (high)
  if (pct === null || pct === undefined) return "transparent";
  const t = Math.max(0, Math.min(1, pct / 100));
  const stops = [
    [251, 91, 91], [242, 169, 60], [45, 212, 191],
  ];
  const seg = t < 0.5 ? 0 : 1;
  const localT = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const [r1, g1, b1] = stops[seg];
  const [r2, g2, b2] = stops[seg + 1] || stops[seg];
  const r = Math.round(r1 + (r2 - r1) * localT);
  const g = Math.round(g1 + (g2 - g1) * localT);
  const b = Math.round(b1 + (b2 - b1) * localT);
  return `rgb(${r},${g},${b})`;
}

export default function InventoryDemand({ rows }) {
  const kpi = getInventoryKpis(rows);
  const stockTop = stockBySkuTop(rows, 15);
  const stockSold = stockVsSold(rows);
  const invByType = inventoryByProductType(rows);
  const heat = availabilityHeatmap(rows);
  const bubble = stockSalesBubble(rows);
  const { classed, summary } = abcAnalysis(rows);

  return (
    <div>
      <div className="kpi-grid">
        <KpiCard label="Inventory Dollar Amount" value={fmtUSD(kpi.inventoryDollarAmount)} accent="#2DD4BF" />
        <KpiCard label="Average Stock Level" value={fmtNum(kpi.avgStockLevel, 1)} unit="units" accent="#6C8CFF" />
        <KpiCard label="Days to Cycle Inventory" value={fmtNum(kpi.daysToCycleInventory, 1)} unit="days (proxy)" accent="#F2A93C" />
        <KpiCard label="Fill Rate (approx)" value={fmtPct(kpi.fillRateApprox)} accent="#B18CFF" />
      </div>

      <SectionLabel>Stock & Demand</SectionLabel>
      <div className="chart-grid">
        <ChartCard title="Stock Levels by SKU" sub="15 highest-stock SKUs">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stockTop}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="sku" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={55} />
              <YAxis width={35} />
              <Tooltip />
              <Bar dataKey="stock" fill="#6C8CFF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Stock Levels vs Products Sold" sub="Each point is one SKU">
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
              <XAxis type="number" dataKey="stock" name="Stock" label={{ value: "Stock levels", position: "insideBottom", offset: -5, fontSize: 11, fill: "#8A93B3" }} />
              <YAxis type="number" dataKey="sold" name="Sold" width={40} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={stockSold} fill="#2DD4BF" fillOpacity={0.75} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Inventory by Product Type" sub="Share of total stock units">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={invByType} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2}>
                {invByType.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtNum(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Availability Heatmap" sub="Avg availability % — Product type × Location">
          <div className="heatmap-wrap">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th></th>
                  {heat.locations.map((loc) => <th key={loc}>{loc}</th>)}
                </tr>
              </thead>
              <tbody>
                {heat.productTypes.map((pt, ri) => (
                  <tr key={pt}>
                    <td className="row-head">{pt}</td>
                    {heat.matrix[ri].map((v, ci) => (
                      <td key={ci} className={v === null ? "empty" : ""} style={{ background: heatColor(v) }}>
                        {v === null ? "—" : v.toFixed(0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <ChartCard title="Stock vs Sales vs Revenue" sub="Bubble size = revenue generated" span2>
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
              <XAxis type="number" dataKey="x" name="Stock" label={{ value: "Stock levels", position: "insideBottom", offset: -5, fontSize: 11, fill: "#8A93B3" }} />
              <YAxis type="number" dataKey="y" name="Sold" width={40} label={{ value: "Units sold", angle: -90, position: "insideLeft", fontSize: 11, fill: "#8A93B3" }} />
              <ZAxis type="number" dataKey="z" range={[40, 500]} name="Revenue" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => (n === "Revenue" ? fmtUSD(v) : v)} />
              <Scatter data={bubble} fill="#B18CFF" fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <SectionLabel>ABC Analysis — SKU Classification by Revenue Contribution</SectionLabel>
      <div className="two-col">
        <ChartCard title="ABC Summary" sub="A = top 20% of SKUs · B = next 30% · C = remaining 50% (ranked by revenue)">
          <div className="table-scroll">
            <table className="scm-table">
              <thead>
                <tr><th>Class</th><th># SKUs</th><th>Revenue</th><th>% of Total</th></tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.class}>
                    <td><span className={`badge badge-${s.class}`}>{s.class}</span></td>
                    <td>{s.skuCount}</td>
                    <td>{fmtUSD(s.revenue)}</td>
                    <td>{fmtPct(s.pctOfTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
        <ChartCard title="SKU Classification" sub="Share of SKUs per class">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={summary.map((s) => ({ name: s.class, value: s.skuCount }))} dataKey="value" nameKey="name" outerRadius={80} paddingAngle={2}>
                {summary.map((s) => <Cell key={s.class} fill={CLASS_COLOR[s.class]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <p className="footnote">
        Days to Cycle Inventory is a proxy metric — the dataset has no explicit time period, so "Number of products sold" is treated as a monthly figure to estimate turnover in days.
      </p>
    </div>
  );
}
