import { describe, expect, test } from "vitest";
import { metricsFetchGate } from "./fetchGate.js";

describe("metricsFetchGate", () => {
  test("project switch: reset caches, defer the fetch", () => {
    expect(
      metricsFetchGate({ project: "b", lastProject: "a", runsLoading: true }),
    ).toEqual({ shouldReset: true, shouldFetch: false });
    expect(
      metricsFetchGate({ project: "b", lastProject: "a", runsLoading: false }),
    ).toEqual({ shouldReset: true, shouldFetch: false });
  });

  test("runs still loading for the current project: no fetch", () => {
    expect(
      metricsFetchGate({ project: "a", lastProject: "a", runsLoading: true }),
    ).toEqual({ shouldReset: false, shouldFetch: false });
  });

  test("settled: fetch", () => {
    expect(
      metricsFetchGate({ project: "a", lastProject: "a", runsLoading: false }),
    ).toEqual({ shouldReset: false, shouldFetch: true });
  });

  test("null project always fetches so hasLoaded resolves", () => {
    expect(
      metricsFetchGate({ project: null, lastProject: "a", runsLoading: true }),
    ).toEqual({ shouldReset: true, shouldFetch: true });
    expect(
      metricsFetchGate({ project: null, lastProject: null, runsLoading: false }),
    ).toEqual({ shouldReset: false, shouldFetch: true });
  });
});
