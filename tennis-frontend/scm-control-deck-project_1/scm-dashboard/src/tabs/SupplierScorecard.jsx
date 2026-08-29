import React from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Cell,
} from "recharts";
import { ChartCard, SectionLabel } from "../components/Cards";
import { supplierScorecard, fmtUSD, fmtNum, fmtPct } from "../utils/calculations";

const PALETTE = ["#2DD4BF", "#6C8CFF", "#F2A93C", "#B18CFF", "#FB5B5B", "#4FD1C5"];

export default function SupplierScorecard({ rows }) {
  const data = supplierScorecard(rows);

  const radarData = ["cost", "leadTime", "defect", "inspection"].map((metric) => {
    const point = { metric: metric === "leadTime" ? "Lead Time" : metric === "cost" ? "Cost" : metric === "defect" ? "Defect" : "Inspection" };
    data.forEach((s) => { point[s.supplier] = Number((s.normalized[metric] * 100).toFixed(0)); });
    return point;
  });

  const avgLead = data.reduce((a, s) => a + s.avgLeadTime, 0) / data.length;
  const avgDefect = data.reduce((a, s) => a + s.avgDefectRate, 0) / data.length;

  return (
    <div>
      <SectionLabel>Supplier Scorecard</SectionLabel>
      <ChartCard title="Supplier Performance" sub="Sorted by composite score">
        <div className="table-scroll">
          <table className="scm-table">
            <thead>
              <tr>
                <th>Supplier</th><th>Avg Lead Time</th><th>Avg Defect Rate</th>
                <th>Avg Shipping Cost</th><th>Revenue Supported</th><th>Inspection Pass Rate</th><th>Composite Score</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.supplier}>
                  <td className="name-cell">{s.supplier}</td>
                  <td>{fmtNum(s.avgLeadTime, 1)}d</td>
                  <td>{fmtPct(s.avgDefectRate)}</td>
                  <td>{fmtUSD(s.avgShippingCost, 2)}</td>
                  <td>{fmtUSD(s.revenueSupported)}</td>
                  <td>{fmtPct(s.inspectionPassRate)}</td>
                  <td style={{ color: "#2DD4BF" }}>{(s.compositeScore * 100).toFixed(0)}/100</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <SectionLabel>Ranking & Comparison</SectionLabel>
      <div className="chart-grid">
        <ChartCard title="Supplier Ranking" sub="Composite score — 40% cost · 30% lead time · 20% defect · 10% inspection">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" horizontal={false} />
              <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}`} />
              <YAxis type="category" dataKey="supplier" width={80} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${(v * 100).toFixed(0)} / 100`} />
              <Bar dataKey="compositeScore" radius={[0, 3, 3, 0]}>
                {data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Supplier Comparison Matrix" sub="Normalized 0–100, outer edge = better">
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} outerRadius={85}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: "#8A93B3" }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9 }} />
              {data.map((s, i) => (
                <Radar key={s.supplier} name={s.supplier} dataKey={s.supplier} stroke={PALETTE[i % PALETTE.length]} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.08} strokeWidth={2} />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lead Time vs Defect Rate" sub="Bubble size = revenue supported, color = supplier">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
              <XAxis type="number" dataKey="avgLeadTime" name="Lead Time" label={{ value: "Avg lead time (days)", position: "insideBottom", offset: -5, fontSize: 11, fill: "#8A93B3" }} />
              <YAxis type="number" dataKey="avgDefectRate" name="Defect Rate" width={40} label={{ value: "Defect rate (%)", angle: -90, position: "insideLeft", fontSize: 11, fill: "#8A93B3" }} />
              <ZAxis type="number" dataKey="revenueSupported" range={[100, 700]} />
              <Tooltip formatter={(v, n) => (n === "revenueSupported" ? fmtUSD(v) : v)} />
              {data.map((s, i) => (
                <Scatter key={s.supplier} name={s.supplier} data={[s]} fill={PALETTE[i % PALETTE.length]} />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Quadrant Analysis" sub="Ideal supplier = low lead time + low defect rate (bottom-left)">
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
              <XAxis type="number" dataKey="avgLeadTime" name="Lead Time" label={{ value: "Avg lead time (days)", position: "insideBottom", offset: -5, fontSize: 11, fill: "#8A93B3" }} />
              <YAxis type="number" dataKey="avgDefectRate" name="Defect Rate" width={40} />
              <ReferenceLine x={avgLead} stroke="#565F82" strokeDasharray="4 4" />
              <ReferenceLine y={avgDefect} stroke="#565F82" strokeDasharray="4 4" />
              <Tooltip />
              {data.map((s, i) => (
                <Scatter key={s.supplier} name={s.supplier} data={[s]} fill={PALETTE[i % PALETTE.length]} />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
