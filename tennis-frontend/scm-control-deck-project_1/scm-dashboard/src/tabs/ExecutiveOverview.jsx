import React from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";
import {
  getExecutiveKpis, revenueBySku, revenueByField, revenueVsMfgCost, fmtUSD, fmtNum, fmtPct,
} from "../utils/calculations";

const PALETTE = ["#2DD4BF", "#6C8CFF", "#F2A93C", "#B18CFF", "#FB5B5B", "#4FD1C5", "#7FA8FF"];

export default function ExecutiveOverview({ rows }) {
  const kpi = getExecutiveKpis(rows);
  const bySku = revenueBySku(rows, 20);
  const byProductType = revenueByField(rows, "Product type");
  const bySupplier = revenueByField(rows, "Supplier name");
  const byLocation = revenueByField(rows, "Location");
  const byMode = revenueByField(rows, "Transportation modes");
  const scatter = revenueVsMfgCost(rows);

  return (
    <div>
      <div className="kpi-grid">
        <KpiCard label="Total Revenue" value={fmtUSD(kpi.totalRevenue)} accent="#2DD4BF" />
        <KpiCard label="Total Products Sold" value={fmtNum(kpi.totalProductsSold)} accent="#6C8CFF" />
        <KpiCard label="Avg Defect Rate" value={fmtPct(kpi.avgDefectRate)} accent="#FB5B5B" />
        <KpiCard label="Total Manufacturing Cost" value={fmtUSD(kpi.totalManufacturingCost)} accent="#F2A93C" />
        <KpiCard label="Total Shipment Cost" value={fmtUSD(kpi.totalShipmentCost)} accent="#F2A93C" />
        <KpiCard label="Avg Lead Time" value={fmtNum(kpi.avgLeadTime, 1)} unit="days" accent="#6C8CFF" />
        <KpiCard label="Avg Mfg Lead Time" value={fmtNum(kpi.avgMfgLeadTime, 1)} unit="days" accent="#6C8CFF" />
        <KpiCard label="Inventory Available" value={fmtNum(kpi.inventoryAvailable)} unit="units" accent="#2DD4BF" />
        <KpiCard label="Avg Profit Margin (approx)" value={fmtPct(kpi.avgProfitMarginApprox)} accent="#B18CFF" />
      </div>

      <SectionLabel>Revenue Composition</SectionLabel>
      <div className="chart-grid">
        <ChartCard title="Revenue Trend by SKU" sub="Top 20 SKUs, ranked by revenue generated" span2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bySku} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="sku" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={60} />
              <YAxis tickFormatter={(v) => `$${v / 1000}k`} width={50} />
              <Tooltip formatter={(v) => fmtUSD(v)} />
              <Bar dataKey="revenue" fill="#2DD4BF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Product Type">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={byProductType} dataKey="revenue" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {byProductType.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtUSD(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Supplier">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={bySupplier} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${v / 1000}k`} />
              <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => fmtUSD(v)} />
              <Bar dataKey="revenue" fill="#6C8CFF" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Location">
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={byLocation}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `$${v / 1000}k`} width={45} />
              <Tooltip formatter={(v) => fmtUSD(v)} />
              <Bar dataKey="revenue" fill="#F2A93C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue by Transportation Mode">
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={byMode} dataKey="revenue" nameKey="name" outerRadius={85} paddingAngle={2}>
                {byMode.map((_, i) => <Cell key={i} fill={PALETTE[(i + 2) % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtUSD(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Revenue vs Manufacturing Cost" sub="Each point is one SKU" span2>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" />
              <XAxis type="number" dataKey="mfgCost" name="Mfg Cost" tickFormatter={(v) => `$${v}`} label={{ value: "Manufacturing Cost", position: "insideBottom", offset: -5, fontSize: 11, fill: "#8A93B3" }} />
              <YAxis type="number" dataKey="revenue" name="Revenue" tickFormatter={(v) => `$${v / 1000}k`} width={50} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v, n) => (n === "revenue" ? fmtUSD(v) : fmtUSD(v))} />
              <Scatter data={scatter} fill="#2DD4BF" fillOpacity={0.75} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <p className="footnote">
        Total Shipment Cost uses the dataset's route-level <em>Costs</em> field; Avg Profit Margin (approx) is (Revenue − Manufacturing Cost) / Revenue and excludes shipping/logistics cost since those aren't attributable per unit in this dataset.
      </p>
    </div>
  );
}
