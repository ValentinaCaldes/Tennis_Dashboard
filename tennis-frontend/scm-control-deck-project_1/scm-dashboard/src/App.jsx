import React, { useState } from "react";
import { rawData } from "./data";
import ExecutiveOverview from "./tabs/ExecutiveOverview";
import InventoryDemand from "./tabs/InventoryDemand";
import SupplierScorecard from "./tabs/SupplierScorecard";
import ManufacturingQuality from "./tabs/ManufacturingQuality";
import LogisticsDistribution from "./tabs/LogisticsDistribution";
import OptimizationRecs from "./tabs/OptimizationRecs";

const TABS = [
  { id: "overview", idx: "01", stage: "SOURCE", label: "Executive Overview", Component: ExecutiveOverview },
  { id: "inventory", idx: "02", stage: "STOCK", label: "Inventory & Demand", Component: InventoryDemand },
  { id: "supplier", idx: "03", stage: "SOURCE", label: "Supplier Scorecard", Component: SupplierScorecard },
  { id: "manufacturing", idx: "04", stage: "MAKE", label: "Manufacturing & Quality", Component: ManufacturingQuality },
  { id: "logistics", idx: "05", stage: "DELIVER", label: "Logistics & Distribution", Component: LogisticsDistribution },
  { id: "optimize", idx: "06", stage: "OPTIMIZE", label: "Optimization & Recs", Component: OptimizationRecs },
];

const TAB_META = {
  overview: { eyebrow: "Business Health", subtitle: "How is the supply chain performing overall — revenue, cost, lead time, and margin at a glance." },
  inventory: { eyebrow: "ABC · Stockout Risk", subtitle: "Which products are overstocked or likely to stock out, and which suppliers create inventory problems." },
  supplier: { eyebrow: "Quality · Cost · Speed", subtitle: "The most consequential page — who to double down on, and who needs a corrective plan." },
  manufacturing: { eyebrow: "Production · Inspection", subtitle: "Production efficiency, inspection outcomes, and defect drivers." },
  logistics: { eyebrow: "Carrier · Routes", subtitle: "Shipping cost, transit time, and route / mode performance across the network." },
  optimize: { eyebrow: "Pareto · What-If · Insight", subtitle: "Where concentration risk sits, and what a defect-reduction initiative could be worth." },
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
        <ActiveComponent rows={rawData} />
      </main>
    </div>
  );
}
