import { describe, expect, test } from "vitest";
import {
  METRIC_COL_PREFIX,
  buildSummaryMap,
  formatMetricValue,
  metricSortKey,
  metricValue,
  sortRuns,
} from "./runSort.js";

const summaries = [
  {
    run_id: "id-a",
    run_name: "a",
    metrics: { "train/acc": { min: 0.1, max: 0.9, last: 0.85 } },
  },
  {
    run_id: null,
    run_name: "b",
    metrics: { "train/acc": { min: 0.2, max: 0.95, last: 0.6 } },
  },
  {
    run_id: "id-c",
    run_name: "c",
    metrics: { "train/loss": { min: 0.4, max: 2.0, last: 0.5 } },
  },
];

const runs = [
  { id: "id-a", name: "a", numSteps: 10, lastStep: 100 },
  { id: null, name: "b", numSteps: 30, lastStep: 50 },
  { id: "id-c", name: "c", numSteps: 20, lastStep: 200 },
];

describe("buildSummaryMap", () => {
  test("keys by run_id when present, falling back to run_name", () => {
    const map = buildSummaryMap(summaries);
    expect(map.has("id-a")).toBe(true);
    expect(map.has("b")).toBe(true);
    expect(map.size).toBe(3);
  });

  test("handles null and empty input", () => {
    expect(buildSummaryMap(null).size).toBe(0);
    expect(buildSummaryMap([]).size).toBe(0);
  });
});

describe("metricValue", () => {
  const map = buildSummaryMap(summaries);

  test("returns the requested aggregate", () => {
    expect(metricValue(map, runs[0], "train/acc", "max")).toBe(0.9);
    expect(metricValue(map, runs[1], "train/acc", "last")).toBe(0.6);
  });

  test("returns null for missing runs or metrics", () => {
    expect(metricValue(map, runs[2], "train/acc", "max")).toBe(null);
    expect(metricValue(map, { name: "nope" }, "train/acc", "max")).toBe(null);
  });
});

describe("metricSortKey", () => {
  test("decodes metric sort columns and rejects plain fields", () => {
    expect(metricSortKey(`${METRIC_COL_PREFIX}train/acc`)).toBe("train/acc");
    expect(metricSortKey("numSteps")).toBe(null);
    expect(metricSortKey(null)).toBe(null);
  });
});

describe("sortRuns", () => {
  const map = buildSummaryMap(summaries);

  test("returns runs unchanged without a sort column", () => {
    expect(sortRuns(runs, null, "asc", map, {})).toEqual(runs);
  });

  test("sorts by plain run fields in both directions", () => {
    expect(sortRuns(runs, "numSteps", "asc", map, {}).map((r) => r.name)).toEqual(
      ["a", "c", "b"],
    );
    expect(
      sortRuns(runs, "numSteps", "desc", map, {}).map((r) => r.name),
    ).toEqual(["b", "c", "a"]);
  });

  test("sorts by run name alphabetically", () => {
    const shuffled = [runs[2], runs[0], runs[1]];
    expect(sortRuns(shuffled, "name", "asc", map, {}).map((r) => r.name)).toEqual(
      ["a", "b", "c"],
    );
  });

  test("sorts by a metric column using its chosen agg, missing values last", () => {
    const col = `${METRIC_COL_PREFIX}train/acc`;
    expect(
      sortRuns(runs, col, "desc", map, { "train/acc": "max" }).map((r) => r.name),
    ).toEqual(["b", "a", "c"]);
    expect(
      sortRuns(runs, col, "asc", map, { "train/acc": "max" }).map((r) => r.name),
    ).toEqual(["a", "b", "c"]);
  });

  test("defaults a metric column's agg to last", () => {
    const col = `${METRIC_COL_PREFIX}train/acc`;
    expect(sortRuns(runs, col, "desc", map, {}).map((r) => r.name)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("changing the agg changes the order", () => {
    const col = `${METRIC_COL_PREFIX}train/acc`;
    expect(
      sortRuns(runs, col, "desc", map, { "train/acc": "last" }).map((r) => r.name),
    ).toEqual(["a", "b", "c"]);
    expect(
      sortRuns(runs, col, "desc", map, { "train/acc": "min" }).map((r) => r.name),
    ).toEqual(["b", "a", "c"]);
  });

  test("is stable for equal values", () => {
    const equal = [
      { id: "x", name: "x", numSteps: 5 },
      { id: "y", name: "y", numSteps: 5 },
    ];
    expect(
      sortRuns(equal, "numSteps", "desc", map, {}).map((r) => r.name),
    ).toEqual(["x", "y"]);
  });

  test("does not mutate the input array", () => {
    const copy = [...runs];
    sortRuns(runs, "numSteps", "desc", map, {});
    expect(runs).toEqual(copy);
  });
});

describe("formatMetricValue", () => {
  test("formats common cases", () => {
    expect(formatMetricValue(null)).toBe("—");
    expect(formatMetricValue(42)).toBe("42");
    expect(formatMetricValue(0)).toBe("0");
    expect(formatMetricValue(0.85123456)).toBe("0.85123");
    expect(formatMetricValue(1e-7)).toBe("1.000e-7");
    expect(formatMetricValue(1234567890123)).toBe("1.235e+12");
  });
});
