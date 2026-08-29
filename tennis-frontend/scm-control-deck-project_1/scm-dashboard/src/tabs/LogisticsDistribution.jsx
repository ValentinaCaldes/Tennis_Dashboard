import React from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ComposedChart, Line,
} from "recharts";
import { KpiCard, ChartCard, SectionLabel } from "../components/Cards";
import {
  getLogisticsKpis, shippingCostByCarrier, transportModeAnalysis, routeAnalysis,
  transportModeSplit, shippingCostDistribution, locationFootprint, fmtUSD, fmtNum,
} from "../utils/calculations";

const PALETTE = ["#2DD4BF", "#6C8CFF", "#F2A93C", "#B18CFF", "#FB5B5B"];

export default function LogisticsDistribution({ rows }) {
  const kpi = getLogisticsKpis(rows);
  const carriers = shippingCostByCarrier(rows);
  const modes = transportModeAnalysis(rows);
  const routes = routeAnalysis(rows);
  const modeCost = transportModeSplit(rows);
  const distribution = shippingCostDistribution(rows);
  const footprint = locationFootprint(rows);
  const maxShipments = Math.max(...footprint.map((f) => f.shipmentCount));

  return (
    <div>
      <div className="kpi-grid">
        <KpiCard label="Avg Shipping Time" value={fmtNum(kpi.avgShippingTime, 1)} unit="days" accent="#6C8CFF" />
        <KpiCard label="Avg Shipping Cost" value={fmtUSD(kpi.avgShippingCost, 2)} accent="#F2A93C" />
        <div className="kpi-card" style={{ "--accent": "#2DD4BF" }}>
          <div className="kpi-label">Best Carrier</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{kpi.bestCarrier?.name}</div>
          <div className="footnote" style={{ marginTop: 6 }}>{kpi.bestCarrier?.reason}</div>
        </div>
        <div className="kpi-card" style={{ "--accent": "#2DD4BF" }}>
          <div className="kpi-label">Best Route</div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{kpi.bestRoute?.name}</div>
          <div className="footnote" style={{ marginTop: 6 }}>{kpi.bestRoute?.reason}</div>
        </div>
      </div>

      <SectionLabel>Carrier & Mode Performance</SectionLabel>
      <div className="chart-grid">
        <ChartCard title="Shipping Carrier Comparison" sub="Avg Cost ($) vs Avg Time (days)" span2>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={carriers}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" width={45} tickFormatter={(v) => `$${v.toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" width={40} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="avgShippingCost" name="Avg Cost ($)" fill="#6C8CFF" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" dataKey="avgShippingTime" name="Avg Time (days)" stroke="#F2A93C" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Transportation Mode Analysis" sub="Avg cost & time by mode">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={modes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" width={40} tickFormatter={(v) => `$${v.toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" width={35} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="avgShippingCost" name="Avg Cost" fill="#2DD4BF" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" dataKey="avgShippingTime" name="Avg Time" stroke="#F2A93C" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Route Analysis" sub="Avg cost & time by route">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={routes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" width={40} tickFormatter={(v) => `$${v.toFixed(0)}`} />
              <YAxis yAxisId="right" orientation="right" width={35} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="avgShippingCost" name="Avg Cost" fill="#B18CFF" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" dataKey="avgShippingTime" name="Avg Time" stroke="#F2A93C" strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cost by Transportation Mode" sub="Share of total logistics cost">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={modeCost} dataKey="value" nameKey="name" innerRadius={50} outerRadius={82} paddingAngle={2}>
                {modeCost.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtUSD(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Shipping Cost Distribution" sub="SKU count per cost band">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={distribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A2138" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 8.5 }} interval={0} angle={-35} textAnchor="end" height={55} />
              <YAxis width={30} />
              <Tooltip />
              <Bar dataKey="count" fill="#6C8CFF" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Location-wise Shipment Footprint" sub="Shipment count & avg cost by market (map proxy)" span2>
          <div className="table-scroll">
            <table className="scm-table">
              <thead>
                <tr><th>Location</th><th>Shipments</th><th>Footprint</th><th>Avg Cost</th><th>Revenue</th></tr>
              </thead>
              <tbody>
                {footprint.map((f) => (
                  <tr key={f.name}>
                    <td className="name-cell">{f.name}</td>
                    <td>{f.shipmentCount}</td>
                    <td style={{ minWidth: 120 }}>
                      <div style={{ background: "var(--border-soft)", borderRadius: 4, height: 8, overflow: "hidden" }}>
                        <div style={{ width: `${(f.shipmentCount / maxShipments) * 100}%`, background: "var(--teal)", height: "100%" }} />
                      </div>
                    </td>
                    <td>{fmtUSD(f.avgCost, 2)}</td>
                    <td>{fmtUSD(f.revenue)}</td>
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
