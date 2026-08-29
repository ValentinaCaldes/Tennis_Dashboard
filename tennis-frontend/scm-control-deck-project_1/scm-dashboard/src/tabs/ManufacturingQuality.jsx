import React from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, Cell,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";
import {
  getMfgKpis, productionVolumeBySupplier, mfgCostVsProduction, leadTimeVsDefect,
  inspectionByProductType, defectHeatmapSupplierProduct, fmtUSD, fmtNum, fmtPct,
} from "../utils/calculations";

const PALETTE = ["#2DD4BF", "#6C8CFF", "#F2A93C", "#B18CFF", "#FB5B5B"];
const INSPECT_COLOR = { Pass: "#2DD4BF", Fail: "#FB5B5B", Pending: "#F2A93C" };

function heatColor(v, max) {
  if (v === null || v === undefined) return "transparent";
  const t = max ? Math.min(1, v / max) : 0;
  const r = Math.round(45 + (251 - 45) * t);
  const g = Math.round(212 + (91 - 212) * t);
  const b = Math.round(191 + (91 - 191) * t);
  return `rgb(${r},${g},${b})`;
}

export default function ManufacturingQuality({ rows }) {
  const kpi = getMfgKpis(rows);
  const byPlantSupplier = productionVolumeBySupplier(rows);
  const costVsProd = mfgCostVsProduction(rows);
  const leadDefect = leadTimeVsDefect(rows);
  const inspectionStacked = inspectionByProductType(rows);
  const heat = defectHeatmapSupplierProduct(rows);
  const maxCell = Math.max(...heat.matrix.flat().filter((v) => v !== null));
  const inspectionResults = [...new Set(rows.map((r) => r["Inspection results"]))];

  return (
    <div>
      <div className="kpi-grid">
        <KpiCard label="Avg Mfg Cost / Unit" value={fmtUSD(kpi.avgMfgCostPerUnit, 2)} accent="#F2A93C" />
        <KpiCard label="Total Production Volume" value={fmtNum(kpi.totalProductionVolume)} unit="units" accent="#6C8CFF" />
        <KpiCard label="Avg Mfg Lead Time" value={fmtNum(kpi.avgMfgLeadTime, 1)} unit="days" accent="#6C8CFF" />
        <KpiCard label="Avg Defect Rate" value={fmtPct(kpi.avgDefectRate)} accent="#FB5B5B" />
        <KpiCard label="Inspection Pass (FPY)" value={fmtPct(kpi.fpy)} accent="#2DD4BF" />
      </div>

      <SectionLabel>Production & Cost</SectionLabel>
      <div className="chart-grid">
        <ChartCard title="Production Volume by Supplier">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={byPlantSupplier}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis width={45} />
              <Tooltip />
              <Bar dataKey="productionVolume" radius={[3, 3, 0, 0]}>
                {byPlantSupplier.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Manufacturing Cost vs Production Volume" sub="Each point is one SKU">
          <ResponsiveContainer width="100%" height={230}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
              <XAxis type="number" dataKey="productionVolume" name="Production Vol." label={{ value: "Production volume", position: "insideBottom", offset: -5, fontSize: 11, fill: "#8A93B3" }} />
              <YAxis type="number" dataKey="mfgCost" name="Mfg Cost" width={45} tickFormatter={(v) => `$${v}`} />
              <Tooltip formatter={(v, n) => (n === "mfgCost" ? fmtUSD(v, 2) : v)} />
              <Scatter data={costVsProd} fill="#F2A93C" fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Lead Time vs Defect Rate" sub="Manufacturing lead time, each point a SKU">
          <ResponsiveContainer width="100%" height={230}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
              <XAxis type="number" dataKey="leadTime" name="Lead Time" label={{ value: "Mfg lead time (days)", position: "insideBottom", offset: -5, fontSize: 11, fill: "#8A93B3" }} />
              <YAxis type="number" dataKey="defectRate" name="Defect Rate" width={40} />
              <Tooltip />
              <Scatter data={leadDefect} fill="#FB5B5B" fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Inspection Results" sub="Stacked by product type">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={inspectionStacked}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="productType" tick={{ fontSize: 11 }} />
              <YAxis width={35} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {inspectionResults.map((res) => (
                <Bar key={res} dataKey={res} stackId="a" fill={INSPECT_COLOR[res] || "#8A93B3"} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Defect Rate Heatmap" sub="Avg defect rate % — Supplier × Product type" span2>
          <div className="heatmap-wrap">
            <table className="heatmap-table">
              <thead>
                <tr><th></th>{heat.types.map((t) => <th key={t}>{t}</th>)}</tr>
              </thead>
              <tbody>
                {heat.suppliers.map((s, ri) => (
                  <tr key={s}>
                    <td className="row-head">{s}</td>
                    {heat.matrix[ri].map((v, ci) => (
                      <td key={ci} className={v === null ? "empty" : ""} style={{ background: heatColor(v, maxCell) }}>
                        {v === null ? "—" : `${v.toFixed(2)}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
