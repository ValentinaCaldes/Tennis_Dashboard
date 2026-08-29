# SCM Control Deck — End-to-End Supply Chain Dashboard

A 6-tab supply chain performance dashboard built with **React + Vite + Recharts**, following the SCOR-style flow: **Source → Stock → Source → Make → Deliver → Optimize**.

| Tab | Focus |
|---|---|
| 01 · Executive Overview | Business health KPIs + revenue composition |
| 02 · Inventory & Demand | ABC analysis, stockout risk, availability heatmap |
| 03 · Supplier Scorecard | Composite score, radar comparison, quadrant analysis |
| 04 · Manufacturing & Quality | Production, inspection outcomes, defect drivers |
| 05 · Logistics & Distribution | Carrier, route, and transportation-mode performance |
| 06 · Optimization & Recs | Pareto analysis, cost breakdown, rule-based insights, what-if slider |

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173`).

## Project structure

```
src/
  data.js                    ← dataset (swap this file to point at new data)
  utils/calculations.js      ← every KPI / chart aggregation, in one place
  components/Cards.jsx       ← shared KPI card / chart card / section label
  tabs/                      ← one file per dashboard tab
  App.jsx                    ← tab navigation ("flow rail") + layout
  index.css                  ← design tokens (colors, type, spacing)
```

## Updating the data

Replace the contents of `src/data.js` (an array of row objects using the same
column names as the source spreadsheet) — every chart and KPI recalculates
automatically since nothing is hardcoded. If you rename columns, update the
string keys used in `src/utils/calculations.js`.

## Calculation notes / assumptions

A few metrics needed an assumption because the source spreadsheet is a single
snapshot with no explicit time dimension. These are also called out as
footnotes inside the dashboard:

- **Avg Profit Margin (approx)** — `(Revenue − Manufacturing Cost) / Revenue`. Shipping/logistics cost isn't attributable per SKU in this dataset, so it's excluded and labeled "approx."
- **Total Shipment Cost** — sum of the route-level `Costs` field (as distinct from the per-carrier `Shipping costs` field, which is used on the Logistics tab).
- **Days to Cycle Inventory** — a proxy: `(Avg Stock Level / Avg Units Sold) × 30`, treating "Number of products sold" as a monthly figure since there's no real time period in the data.
- **Fill Rate (approx)** — average of the `Availability` field, treated as a 0–100 service-level score.
- **ABC Classification** — SKUs ranked by revenue: Class A = top 20% of SKUs, B = next 30%, C = remaining 50%.
- **Supplier Composite Score** — each of cost / lead time / defect rate / inspection pass rate is normalized 0–1 across suppliers (cost, lead time, and defect are inverted so lower = better), then weighted 40% cost · 30% lead time · 20% defect · 10% inspection.
- **What-if defect reduction** — cost of quality is proxied as `Manufacturing cost × Defect rate`, so the slider shows projected savings if defect rate dropped by X%.

If any of these should be calculated differently, the exact formula lives in
one place (`src/utils/calculations.js`) — one edit updates every chart/KPI
that depends on it.

## Deploying so you have a live URL

### Option A — Vercel (recommended, ~2 minutes)
1. Push this folder to a new GitHub repo (see below).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo.
3. Framework preset: **Vite**. Leave build settings as default (`npm run build`, output `dist`).
4. Click **Deploy**. You'll get a live URL like `https://scm-control-deck.vercel.app`.

### Option B — GitHub Pages
1. `npm install --save-dev gh-pages`
2. Add to `package.json`: `"homepage": "https://<your-username>.github.io/<repo-name>"` and a script `"deploy": "gh-pages -d dist"`.
3. In `vite.config.js`, add `base: '/<repo-name>/'`.
4. `npm run build && npm run deploy`.

## Pushing to GitHub

```bash
git init
git add .
git commit -m "Initial commit: SCM Control Deck dashboard"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```
