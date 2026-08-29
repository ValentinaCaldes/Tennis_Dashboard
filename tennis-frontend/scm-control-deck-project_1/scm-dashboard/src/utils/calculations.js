// ---------------------------------------------------------------------------
// calculations.js
// All derived metrics for the End-to-End Supply Chain Dashboard live here.
// Every function takes the raw row array (see src/data.js) and returns a
// plain JS value / array ready for a KPI card, chart, or table.
// ---------------------------------------------------------------------------

export const sum = (rows, key) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
export const avg = (rows, key) => (rows.length ? sum(rows, key) / rows.length : 0);
export const fmtUSD = (n, digits = 0) =>
  `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
export const fmtNum = (n, digits = 0) =>
  Number(n).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtPct = (n, digits = 1) => `${Number(n).toFixed(digits)}%`;

const groupBy = (rows, key) =>
  rows.reduce((acc, r) => {
    const k = r[key];
    (acc[k] = acc[k] || []).push(r);
    return acc;
  }, {});

export { groupBy };

// ---------------------------------------------------------------------------
// TAB 1 — 01-SOURCE — Executive Overview
// ---------------------------------------------------------------------------
export function getExecutiveKpis(rows) {
  const totalRevenue = sum(rows, "Revenue generated");
  const totalMfgCost = sum(rows, "Manufacturing costs");
  return {
    totalRevenue,
    totalProductsSold: sum(rows, "Number of products sold"),
    avgDefectRate: avg(rows, "Defect rates"), // %
    totalManufacturingCost: totalMfgCost,
    totalShipmentCost: sum(rows, "Costs"), // logistics cost tied to Routes / Transportation modes
    avgLeadTime: avg(rows, "Lead time"), // supplier -> mfg lead time (days)
    avgMfgLeadTime: avg(rows, "Manufacturing lead time"), // days
    inventoryAvailable: sum(rows, "Availability"), // units available
    // Approx margin: (Revenue - Manufacturing cost) / Revenue. Excludes shipping/logistics cost
    // since those are not attributable per-unit in this dataset — flagged as an approximation.
    avgProfitMarginApprox: totalRevenue ? ((totalRevenue - totalMfgCost) / totalRevenue) * 100 : 0,
  };
}

export function revenueBySku(rows, topN = 20) {
  return [...rows]
    .sort((a, b) => b["Revenue generated"] - a["Revenue generated"])
    .slice(0, topN)
    .map((r) => ({ sku: r.SKU, revenue: r["Revenue generated"] }));
}

export function revenueByField(rows, field) {
  const groups = groupBy(rows, field);
  return Object.entries(groups)
    .map(([name, g]) => ({ name, revenue: sum(g, "Revenue generated") }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function revenueVsMfgCost(rows) {
  return rows.map((r) => ({
    sku: r.SKU,
    productType: r["Product type"],
    revenue: r["Revenue generated"],
    mfgCost: r["Manufacturing costs"],
  }));
}

// ---------------------------------------------------------------------------
// TAB 2 — 02-STOCK — Inventory & Demand
// ---------------------------------------------------------------------------
export function getInventoryKpis(rows) {
  // Inventory dollar amount = stock on hand valued at unit price
  const inventoryDollarAmount = sum(
    rows.map((r) => ({ v: r["Stock levels"] * r["Price"] })),
    "v"
  );
  const avgStockLevel = avg(rows, "Stock levels");
  const avgUnitsSold = avg(rows, "Number of products sold");
  // Days to cycle inventory (proxy): assumes "Number of products sold" represents a monthly
  // demand figure, since the dataset has no explicit time dimension. Documented assumption.
  const daysToCycleInventory = avgUnitsSold ? (avgStockLevel / avgUnitsSold) * 30 : 0;
  const fillRateApprox = avg(rows, "Availability"); // treated as an availability/service-level score (0-100)
  return { inventoryDollarAmount, avgStockLevel, daysToCycleInventory, fillRateApprox };
}

export function stockBySkuTop(rows, topN = 15) {
  return [...rows]
    .sort((a, b) => b["Stock levels"] - a["Stock levels"])
    .slice(0, topN)
    .map((r) => ({ sku: r.SKU, stock: r["Stock levels"] }));
}

export function stockVsSold(rows) {
  return rows.map((r) => ({
    sku: r.SKU,
    productType: r["Product type"],
    stock: r["Stock levels"],
    sold: r["Number of products sold"],
  }));
}

export function inventoryByProductType(rows) {
  const groups = groupBy(rows, "Product type");
  return Object.entries(groups).map(([name, g]) => ({ name, value: sum(g, "Stock levels") }));
}

// Availability heatmap: avg Availability % by Product type (rows) x Location (cols)
export function availabilityHeatmap(rows) {
  const productTypes = [...new Set(rows.map((r) => r["Product type"]))];
  const locations = [...new Set(rows.map((r) => r["Location"]))];
  const matrix = productTypes.map((pt) =>
    locations.map((loc) => {
      const cell = rows.filter((r) => r["Product type"] === pt && r["Location"] === loc);
      return cell.length ? avg(cell, "Availability") : null;
    })
  );
  return { productTypes, locations, matrix };
}

export function stockSalesBubble(rows) {
  return rows.map((r) => ({
    sku: r.SKU,
    x: r["Stock levels"],
    y: r["Number of products sold"],
    z: r["Revenue generated"],
    productType: r["Product type"],
  }));
}

// ABC analysis by revenue contribution.
// A = top 20% of SKUs (by count) ranked by revenue, B = next 30%, C = remaining 50%.
export function abcAnalysis(rows) {
  const sorted = [...rows].sort((a, b) => b["Revenue generated"] - a["Revenue generated"]);
  const n = sorted.length;
  const aCut = Math.ceil(n * 0.2);
  const bCut = aCut + Math.ceil(n * 0.3);
  const totalRevenue = sum(rows, "Revenue generated");
  const classed = sorted.map((r, i) => ({
    ...r,
    abcClass: i < aCut ? "A" : i < bCut ? "B" : "C",
  }));
  const summary = ["A", "B", "C"].map((cls) => {
    const g = classed.filter((r) => r.abcClass === cls);
    const rev = sum(g, "Revenue generated");
    return {
      class: cls,
      skuCount: g.length,
      revenue: rev,
      pctOfTotal: totalRevenue ? (rev / totalRevenue) * 100 : 0,
    };
  });
  return { classed, summary };
}

// ---------------------------------------------------------------------------
// TAB 3 — 03-SOURCE — Supplier Scorecard
// ---------------------------------------------------------------------------
export function supplierScorecard(rows) {
  const groups = groupBy(rows, "Supplier name");
  const base = Object.entries(groups).map(([supplier, g]) => {
    const passCount = g.filter((r) => r["Inspection results"] === "Pass").length;
    return {
      supplier,
      avgLeadTime: avg(g, "Lead time"),
      avgDefectRate: avg(g, "Defect rates"),
      avgShippingCost: avg(g, "Shipping costs"),
      revenueSupported: sum(g, "Revenue generated"),
      inspectionPassRate: g.length ? (passCount / g.length) * 100 : 0,
      skuCount: g.length,
    };
  });

  // Normalize each metric 0-1 across suppliers for the composite score.
  const norm = (arr, key, invert = false) => {
    const vals = arr.map((d) => d[key]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    return arr.map((d) => {
      const n = max === min ? 1 : (d[key] - min) / (max - min);
      return invert ? 1 - n : n;
    });
  };

  const costNorm = norm(base, "avgShippingCost", true); // lower cost = better
  const leadNorm = norm(base, "avgLeadTime", true); // lower lead time = better
  const defectNorm = norm(base, "avgDefectRate", true); // lower defect = better
  const inspectNorm = norm(base, "inspectionPassRate", false); // higher pass rate = better

  return base
    .map((d, i) => ({
      ...d,
      // Composite score — 40% cost · 30% lead time · 20% defect · 10% inspection
      compositeScore:
        0.4 * costNorm[i] + 0.3 * leadNorm[i] + 0.2 * defectNorm[i] + 0.1 * inspectNorm[i],
      normalized: {
        cost: costNorm[i],
        leadTime: leadNorm[i],
        defect: defectNorm[i],
        inspection: inspectNorm[i],
      },
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

// ---------------------------------------------------------------------------
// TAB 4 — 04-MAKE — Manufacturing & Quality
// ---------------------------------------------------------------------------
export function productionByProductType(rows) {
  const groups = groupBy(rows, "Product type");
  return Object.entries(groups).map(([name, g]) => ({
    name,
    productionVolume: sum(g, "Production volumes"),
    mfgCost: sum(g, "Manufacturing costs"),
  }));
}

export function inspectionBreakdown(rows) {
  const groups = groupBy(rows, "Inspection results");
  const total = rows.length;
  return Object.entries(groups).map(([name, g]) => ({
    name,
    value: g.length,
    pct: total ? (g.length / total) * 100 : 0,
  }));
}

export function defectRateBySupplier(rows) {
  const groups = groupBy(rows, "Supplier name");
  return Object.entries(groups)
    .map(([name, g]) => ({ name, defectRate: avg(g, "Defect rates") }))
    .sort((a, b) => b.defectRate - a.defectRate);
}

export function defectVsMfgLeadTime(rows) {
  return rows.map((r) => ({
    sku: r.SKU,
    productType: r["Product type"],
    defectRate: r["Defect rates"],
    mfgLeadTime: r["Manufacturing lead time"],
    productionVolume: r["Production volumes"],
  }));
}

export function mfgCostByProductType(rows) {
  const groups = groupBy(rows, "Product type");
  return Object.entries(groups).map(([name, g]) => ({ name, avgCost: avg(g, "Manufacturing costs") }));
}

export function getMfgKpis(rows) {
  const totalProduction = sum(rows, "Production volumes");
  const totalMfgCost = sum(rows, "Manufacturing costs");
  const passCount = rows.filter((r) => r["Inspection results"] === "Pass").length;
  return {
    avgMfgCostPerUnit: totalProduction ? totalMfgCost / totalProduction : 0,
    totalProductionVolume: totalProduction,
    avgMfgLeadTime: avg(rows, "Manufacturing lead time"),
    avgDefectRate: avg(rows, "Defect rates"),
    fpy: rows.length ? (passCount / rows.length) * 100 : 0, // First Pass Yield (Pass / total inspected)
  };
}

export function productionVolumeBySupplier(rows) {
  const groups = groupBy(rows, "Supplier name");
  return Object.entries(groups)
    .map(([name, g]) => ({ name, productionVolume: sum(g, "Production volumes") }))
    .sort((a, b) => b.productionVolume - a.productionVolume);
}

export function mfgCostVsProduction(rows) {
  return rows.map((r) => ({
    sku: r.SKU,
    productType: r["Product type"],
    productionVolume: r["Production volumes"],
    mfgCost: r["Manufacturing costs"],
  }));
}

export function leadTimeVsDefect(rows) {
  return rows.map((r) => ({
    sku: r.SKU,
    productType: r["Product type"],
    leadTime: r["Manufacturing lead time"],
    defectRate: r["Defect rates"],
  }));
}

// Inspection results stacked by product type -> [{ productType, Pass, Fail, Pending }]
export function inspectionByProductType(rows) {
  const types = [...new Set(rows.map((r) => r["Product type"]))];
  const results = [...new Set(rows.map((r) => r["Inspection results"]))];
  return types.map((pt) => {
    const g = rows.filter((r) => r["Product type"] === pt);
    const row = { productType: pt };
    results.forEach((res) => {
      row[res] = g.filter((r) => r["Inspection results"] === res).length;
    });
    return row;
  });
}

// Avg defect rate % — Supplier (rows) x Product type (cols)
export function defectHeatmapSupplierProduct(rows) {
  const suppliers = [...new Set(rows.map((r) => r["Supplier name"]))];
  const types = [...new Set(rows.map((r) => r["Product type"]))];
  const matrix = suppliers.map((s) =>
    types.map((pt) => {
      const cell = rows.filter((r) => r["Supplier name"] === s && r["Product type"] === pt);
      return cell.length ? avg(cell, "Defect rates") : null;
    })
  );
  return { suppliers, types, matrix };
}

// ---------------------------------------------------------------------------
// TAB 5 — 05-DELIVER — Logistics & Distribution
// ---------------------------------------------------------------------------
export function shippingCostByCarrier(rows) {
  const groups = groupBy(rows, "Shipping carriers");
  return Object.entries(groups).map(([name, g]) => ({
    name,
    avgShippingCost: avg(g, "Shipping costs"),
    avgShippingTime: avg(g, "Shipping times"),
    skuCount: g.length,
  }));
}

export function revenueByRoute(rows) {
  return revenueByField(rows, "Routes");
}

export function transportModeSplit(rows) {
  const groups = groupBy(rows, "Transportation modes");
  return Object.entries(groups).map(([name, g]) => ({
    name,
    value: sum(g, "Costs"),
    skuCount: g.length,
  }));
}

// Route x Transportation mode matrix: total logistics Costs
export function routeModeHeatmap(rows) {
  const routes = [...new Set(rows.map((r) => r["Routes"]))];
  const modes = [...new Set(rows.map((r) => r["Transportation modes"]))];
  const matrix = routes.map((rt) =>
    modes.map((m) => {
      const cell = rows.filter((r) => r["Routes"] === rt && r["Transportation modes"] === m);
      return cell.length ? sum(cell, "Costs") : null;
    })
  );
  return { routes, modes, matrix };
}

export function shippingTimeByCarrier(rows) {
  const groups = groupBy(rows, "Shipping carriers");
  return Object.entries(groups).map(([name, g]) => ({ name, avgShippingTime: avg(g, "Shipping times") }));
}

export function getLogisticsKpis(rows) {
  const carriers = shippingCostByCarrier(rows);
  const routeStats = groupBy(rows, "Routes");
  const routeAvg = Object.entries(routeStats).map(([name, g]) => ({
    name,
    avgShippingTime: avg(g, "Shipping times"),
    avgShippingCost: avg(g, "Shipping costs"),
  }));

  // "Best" = lowest normalized (cost + time) combined score.
  const scoreOf = (arr, key) => {
    const vals = arr.map((d) => d[key]);
    const min = Math.min(...vals), max = Math.max(...vals);
    return arr.map((d) => (max === min ? 0 : (d[key] - min) / (max - min)));
  };
  const carrierCostScore = scoreOf(carriers, "avgShippingCost");
  const carrierTimeScore = scoreOf(carriers, "avgShippingTime");
  const carrierRanked = carriers
    .map((c, i) => ({ ...c, combined: carrierCostScore[i] + carrierTimeScore[i] }))
    .sort((a, b) => a.combined - b.combined);
  const bestCarrier = carrierRanked[0];

  const routeCostScore = scoreOf(routeAvg, "avgShippingCost");
  const routeTimeScore = scoreOf(routeAvg, "avgShippingTime");
  const routeRanked = routeAvg
    .map((r, i) => ({ ...r, combined: routeCostScore[i] + routeTimeScore[i] }))
    .sort((a, b) => a.combined - b.combined);
  const bestRoute = routeRanked[0];

  return {
    avgShippingTime: avg(rows, "Shipping times"),
    avgShippingCost: avg(rows, "Shipping costs"),
    bestCarrier: bestCarrier
      ? { name: bestCarrier.name, reason: `${fmtUSDShort(bestCarrier.avgShippingCost)} avg cost · ${bestCarrier.avgShippingTime.toFixed(1)}d avg time — lowest combined cost+time` }
      : null,
    bestRoute: bestRoute
      ? { name: bestRoute.name, reason: `${bestRoute.avgShippingTime.toFixed(1)} days avg — lowest combined cost+time` }
      : null,
  };
}
function fmtUSDShort(n) { return `$${Number(n).toFixed(2)}`; }

export function transportModeAnalysis(rows) {
  const groups = groupBy(rows, "Transportation modes");
  return Object.entries(groups).map(([name, g]) => ({
    name,
    avgShippingCost: avg(g, "Shipping costs"),
    avgShippingTime: avg(g, "Shipping times"),
  }));
}

export function routeAnalysis(rows) {
  const groups = groupBy(rows, "Routes");
  return Object.entries(groups).map(([name, g]) => ({
    name,
    avgShippingCost: avg(g, "Shipping costs"),
    avgShippingTime: avg(g, "Shipping times"),
  }));
}

// Histogram bins of per-SKU Shipping costs
export function shippingCostDistribution(rows, binCount = 8) {
  const vals = rows.map((r) => r["Shipping costs"]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const width = (max - min) / binCount || 1;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    label: `$${(min + i * width).toFixed(1)}–${(min + (i + 1) * width).toFixed(1)}`,
    count: 0,
  }));
  vals.forEach((v) => {
    let idx = Math.floor((v - min) / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  });
  return bins;
}

// Location-wise shipment footprint (proxy for a geo map): count + avg cost per location
export function locationFootprint(rows) {
  const groups = groupBy(rows, "Location");
  return Object.entries(groups)
    .map(([name, g]) => ({
      name,
      shipmentCount: g.length,
      avgCost: avg(g, "Costs"),
      revenue: sum(g, "Revenue generated"),
    }))
    .sort((a, b) => b.shipmentCount - a.shipmentCount);
}

// ---------------------------------------------------------------------------
// TAB 6 — 06-OPTIMIZE — Optimization & Recommendations
// ---------------------------------------------------------------------------
export function paretoBySku(rows) {
  const sorted = [...rows].sort((a, b) => b["Revenue generated"] - a["Revenue generated"]);
  const total = sum(rows, "Revenue generated");
  let cum = 0;
  return sorted.map((r) => {
    cum += r["Revenue generated"];
    return {
      sku: r.SKU,
      revenue: r["Revenue generated"],
      cumulativePct: total ? (cum / total) * 100 : 0,
    };
  });
}

export function costBreakdown(rows) {
  return [
    { name: "Manufacturing", value: sum(rows, "Manufacturing costs") },
    { name: "Shipping", value: sum(rows, "Shipping costs") },
    { name: "Logistics (Routes)", value: sum(rows, "Costs") },
  ];
}

// Simple rule-based recommendation generator built off the computed metrics.
export function generateInsights(rows) {
  const insights = [];
  const scorecard = supplierScorecard(rows);
  if (scorecard.length) {
    const best = scorecard[0];
    const worst = scorecard[scorecard.length - 1];
    insights.push({
      type: "supplier",
      severity: "positive",
      text: `${best.supplier} leads the composite scorecard (${(best.compositeScore * 100).toFixed(
        0
      )}/100) — consolidate more volume here where lead time and quality allow.`,
    });
    insights.push({
      type: "supplier",
      severity: "risk",
      text: `${worst.supplier} ranks lowest (${(worst.compositeScore * 100).toFixed(
        0
      )}/100) with ${worst.avgDefectRate.toFixed(2)}% avg defect rate — flag for a corrective action plan.`,
    });
  }

  const { summary } = abcAnalysis(rows);
  const aClass = summary.find((s) => s.class === "A");
  if (aClass) {
    insights.push({
      type: "inventory",
      severity: "info",
      text: `Class A SKUs are ${aClass.skuCount} of ${rows.length} products (${((aClass.skuCount / rows.length) * 100).toFixed(
        0
      )}%) but drive ${aClass.pctOfTotal.toFixed(1)}% of revenue — prioritize these for stockout prevention.`,
    });
  }

  const modes = transportModeSplit(rows).sort((a, b) => b.value - a.value);
  if (modes.length) {
    insights.push({
      type: "logistics",
      severity: "info",
      text: `${modes[0].name} freight accounts for the largest share of logistics cost ($${modes[0].value.toLocaleString(
        "en-US",
        { maximumFractionDigits: 0 }
      )}) across ${modes[0].skuCount} SKUs — model a mode-shift what-if for cost savings.`,
    });
  }

  const inspections = inspectionBreakdown(rows);
  const fail = inspections.find((i) => i.name === "Fail");
  if (fail) {
    insights.push({
      type: "quality",
      severity: fail.pct > 25 ? "risk" : "info",
      text: `${fail.pct.toFixed(1)}% of inspected SKUs failed quality inspection — trace back to the suppliers driving this rate on the Supplier Scorecard tab.`,
    });
  }

  return insights;
}

// What-if: model impact of an X% defect-rate reduction on estimated recoverable cost.
// Assumption: cost of quality is proxied by Manufacturing cost * defect rate.
export function whatIfDefectReduction(rows, reductionPct) {
  const baselineCOQ = sum(
    rows.map((r) => ({ v: (r["Manufacturing costs"] * r["Defect rates"]) / 100 })),
    "v"
  );
  const projectedCOQ = baselineCOQ * (1 - reductionPct / 100);
  return {
    baselineCOQ,
    projectedCOQ,
    savings: baselineCOQ - projectedCOQ,
  };
}

// Suppliers driving defects — "impact" = avg defect rate x revenue supported (proxy for $ at risk)
export function suppliersDrivingDefects(rows) {
  const groups = groupBy(rows, "Supplier name");
  return Object.entries(groups)
    .map(([name, g]) => {
      const defectRate = avg(g, "Defect rates");
      const revenue = sum(g, "Revenue generated");
      return { name, defectRate, revenue, impact: (defectRate / 100) * revenue };
    })
    .sort((a, b) => b.impact - a.impact);
}

// Suppliers driving cost — total manufacturing + shipping cost attributable to each supplier
export function suppliersDrivingCost(rows) {
  const groups = groupBy(rows, "Supplier name");
  return Object.entries(groups)
    .map(([name, g]) => ({
      name,
      mfgCost: sum(g, "Manufacturing costs"),
      shippingCost: sum(g, "Shipping costs"),
      totalCost: sum(g, "Manufacturing costs") + sum(g, "Shipping costs"),
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

// Demand variability by product type — coefficient of variation (stdDev / mean) of units sold
// across SKUs within each category. Proxy for demand uncertainty since there's no time-series.
export function demandVariabilityByProductType(rows) {
  const groups = groupBy(rows, "Product type");
  return Object.entries(groups).map(([name, g]) => {
    const vals = g.map((r) => r["Number of products sold"]);
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;
    const stdDev = Math.sqrt(variance);
    return { name, mean, stdDev, cv: mean ? (stdDev / mean) * 100 : 0 };
  });
}

// EOQ · Safety Stock · Reorder Point (per SKU)
// Assumptions (dataset lacks ordering/holding cost fields):
//   order cost S = $50/order, holding cost H = 20% of unit price/yr, service level Z = 1.65 (~95%)
//   Snapshot demand ("Number of products sold") is treated as an ANNUAL demand proxy.
//   Demand uncertainty (sigma) has no time series to draw from, so it is proxied using the
//   coefficient of variation of demand *across SKUs within the same product type* (see
//   demandVariabilityByProductType), scaled down to the SKU's lead-time window.
const ORDER_COST = 50;
const HOLDING_RATE = 0.2;
const SERVICE_Z = 1.65;

export function eoqSafetyStockReorder(rows) {
  const cvByType = {};
  demandVariabilityByProductType(rows).forEach((d) => { cvByType[d.name] = d.cv / 100; });

  return rows
    .map((r) => {
      const D = r["Number of products sold"]; // annual demand proxy
      const H = HOLDING_RATE * r["Price"];
      const eoq = H > 0 ? Math.sqrt((2 * D * ORDER_COST) / H) : 0;
      const dailyDemand = D / 365;
      const leadTime = r["Lead time"]; // days
      const cv = cvByType[r["Product type"]] || 0;
      const sigmaLeadTime = cv * dailyDemand * Math.sqrt(Math.max(leadTime, 0));
      const safetyStock = SERVICE_Z * sigmaLeadTime;
      const reorderPoint = dailyDemand * leadTime + safetyStock;
      return {
        sku: r.SKU,
        productType: r["Product type"],
        annualDemand: D,
        eoq,
        leadTime,
        safetyStock,
        reorderPoint,
      };
    })
    .sort((a, b) => b.annualDemand - a.annualDemand);
}

// Pearson correlation coefficient
export function pearsonR(rows, xKey, yKey) {
  const xs = rows.map((r) => r[xKey]);
  const ys = rows.map((r) => r[yKey]);
  const n = xs.length;
  const mx = xs.reduce((a, v) => a + v, 0) / n;
  const my = ys.reduce((a, v) => a + v, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom ? num / denom : 0;
}

export function correlationPairs(rows) {
  return [
    {
      key: "prod_cost",
      title: "Production Volume vs Manufacturing Cost",
      xKey: "Production volumes",
      yKey: "Manufacturing costs",
      r: pearsonR(rows, "Production volumes", "Manufacturing costs"),
      data: rows.map((r) => ({ x: r["Production volumes"], y: r["Manufacturing costs"], sku: r.SKU })),
    },
    {
      key: "ship_time",
      title: "Shipping Cost vs Shipping Time",
      xKey: "Shipping costs",
      yKey: "Shipping times",
      r: pearsonR(rows, "Shipping costs", "Shipping times"),
      data: rows.map((r) => ({ x: r["Shipping costs"], y: r["Shipping times"], sku: r.SKU })),
    },
    {
      key: "lead_defect",
      title: "Lead Time vs Defect Rate",
      xKey: "Lead time",
      yKey: "Defect rates",
      r: pearsonR(rows, "Lead time", "Defect rates"),
      data: rows.map((r) => ({ x: r["Lead time"], y: r["Defect rates"], sku: r.SKU })),
    },
  ];
}

// Extended what-if: shipping-cost % change + lead-time % change
// -> profit impact (from shipping cost only) and total reorder point across all SKUs (from lead time)
export function whatIfShippingLeadTime(rows, shippingCostChangePct, leadTimeChangePct) {
  const totalRevenue = sum(rows, "Revenue generated");
  const totalMfgCost = sum(rows, "Manufacturing costs");
  const totalShippingCost = sum(rows, "Shipping costs");
  const totalLogisticsCost = sum(rows, "Costs");

  const baselineProfit = totalRevenue - (totalMfgCost + totalShippingCost + totalLogisticsCost);
  const newShippingCost = totalShippingCost * (1 + shippingCostChangePct / 100);
  const newProfit = totalRevenue - (totalMfgCost + newShippingCost + totalLogisticsCost);
  const profitImpact = newProfit - baselineProfit;

  const cvByType = {};
  demandVariabilityByProductType(rows).forEach((d) => { cvByType[d.name] = d.cv / 100; });

  const baselineReorderTotal = sum(eoqSafetyStockReorder(rows).map((d) => ({ v: d.reorderPoint })), "v");

  const newReorderTotal = sum(
    rows.map((r) => {
      const D = r["Number of products sold"];
      const dailyDemand = D / 365;
      const leadTime = r["Lead time"] * (1 + leadTimeChangePct / 100);
      const cv = cvByType[r["Product type"]] || 0;
      const sigmaLeadTime = cv * dailyDemand * Math.sqrt(Math.max(leadTime, 0));
      const safetyStock = SERVICE_Z * sigmaLeadTime;
      return { v: dailyDemand * leadTime + safetyStock };
    }),
    "v"
  );

  return {
    baselineProfit,
    newProfit,
    profitImpact,
    baselineReorderTotal,
    newReorderTotal,
    reorderDelta: newReorderTotal - baselineReorderTotal,
  };
}

// Root cause view for high defect rate: top contributing supplier / product type / route,
// plus the strength of the lead-time -> defect relationship.
export function defectRootCause(rows) {
  const bySupplier = defectRateBySupplier(rows);
  const byType = Object.entries(groupBy(rows, "Product type"))
    .map(([name, g]) => ({ name, defectRate: avg(g, "Defect rates") }))
    .sort((a, b) => b.defectRate - a.defectRate);
  const byRoute = Object.entries(groupBy(rows, "Routes"))
    .map(([name, g]) => ({ name, defectRate: avg(g, "Defect rates") }))
    .sort((a, b) => b.defectRate - a.defectRate);
  const leadDefectR = pearsonR(rows, "Manufacturing lead time", "Defect rates");
  const overallAvg = avg(rows, "Defect rates");
  const highDefectRows = rows.filter((r) => r["Defect rates"] > overallAvg * 1.5);

  return {
    topSupplier: bySupplier[0],
    topProductType: byType[0],
    topRoute: byRoute[0],
    leadDefectCorrelation: leadDefectR,
    highDefectCount: highDefectRows.length,
    overallAvg,
  };
}

// KPI Tree: Revenue at the root, branching into its component drivers.
export function kpiTree(rows) {
  const totalRevenue = sum(rows, "Revenue generated");
  const totalProductsSold = sum(rows, "Number of products sold");
  const avgPrice = avg(rows, "Price");
  const productTypeCount = new Set(rows.map((r) => r["Product type"])).size;
  const totalMfgCost = sum(rows, "Manufacturing costs");
  const totalShippingCost = sum(rows, "Shipping costs");
  const totalLogisticsCost = sum(rows, "Costs");
  const profitMargin = totalRevenue ? ((totalRevenue - totalMfgCost - totalShippingCost - totalLogisticsCost) / totalRevenue) * 100 : 0;

  return {
    revenue: totalRevenue,
    children: [
      { label: "Products Sold", value: fmtNum(totalProductsSold), raw: totalProductsSold },
      { label: "Avg Price", value: fmtUSD(avgPrice, 2), raw: avgPrice },
      { label: "Product Types", value: fmtNum(productTypeCount), raw: productTypeCount },
      { label: "Profit Margin", value: fmtPct(profitMargin), raw: profitMargin },
      { label: "Manufacturing Cost", value: fmtUSD(totalMfgCost), raw: totalMfgCost },
      { label: "Shipping Cost", value: fmtUSD(totalShippingCost), raw: totalShippingCost },
      { label: "Logistics Cost", value: fmtUSD(totalLogisticsCost), raw: totalLogisticsCost },
    ],
  };
}
