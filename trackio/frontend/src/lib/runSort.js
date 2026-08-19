export const METRIC_AGGS = ["last", "min", "max"];
export const METRIC_COL_PREFIX = "metric:";

export function metricSortKey(col) {
  if (typeof col !== "string" || !col.startsWith(METRIC_COL_PREFIX)) {
    return null;
  }
  return col.slice(METRIC_COL_PREFIX.length);
}

export function buildSummaryMap(summaries) {
  const map = new Map();
  for (const s of summaries ?? []) {
    map.set(s.run_id ?? s.run_name, s.metrics ?? {});
  }
  return map;
}

export function metricValue(summaryMap, run, metric, agg) {
  const metrics = summaryMap.get(run.id ?? run.name);
  const value = metrics?.[metric]?.[agg];
  return typeof value === "number" ? value : null;
}

export function sortRuns(runs, sortCol, sortDir, summaryMap, metricAggs) {
  if (!sortCol) return runs;
  const dir = sortDir === "desc" ? -1 : 1;
  const metric = metricSortKey(sortCol);
  const agg = metric ? (metricAggs?.[metric] ?? "last") : null;
  const keyed = runs.map((run, index) => {
    let value;
    if (metric) {
      value = summaryMap ? metricValue(summaryMap, run, metric, agg) : null;
    } else {
      value = run[sortCol] ?? null;
    }
    return { run, index, value };
  });
  keyed.sort((a, b) => {
    if (a.value == null && b.value == null) return a.index - b.index;
    if (a.value == null) return 1;
    if (b.value == null) return -1;
    if (typeof a.value === "number" && typeof b.value === "number") {
      if (a.value !== b.value) return (a.value - b.value) * dir;
      return a.index - b.index;
    }
    const cmp = String(a.value).localeCompare(String(b.value));
    if (cmp !== 0) return cmp * dir;
    return a.index - b.index;
  });
  return keyed.map((k) => k.run);
}

export function formatMetricValue(value) {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return String(value);
  if (Number.isInteger(value) && Math.abs(value) < 1e9) return String(value);
  const abs = Math.abs(value);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e9)) return value.toExponential(3);
  return value.toPrecision(5).replace(/\.?0+$/, "");
}
