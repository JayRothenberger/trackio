import { describe, expect, test } from "vitest";
import { runsNeedingRefresh } from "./pollVersions.js";

const runA = { id: "id-a", name: "a" };
const runB = { id: null, name: "b" };
const selected = [runA, runB];

function entries(va, vb) {
  return [
    { run: "a", run_id: "id-a", version: va },
    { run: "b", run_id: null, version: vb },
  ];
}

describe("runsNeedingRefresh", () => {
  test("flags every run on first poll (no cache, no versions)", () => {
    const { changed, nextVersions } = runsNeedingRefresh(
      selected,
      entries("10:9", "5:4"),
      new Map(),
      new Set(),
    );
    expect(changed).toEqual(selected);
    expect(nextVersions.get("id-a")).toBe("10:9");
    expect(nextVersions.get("b")).toBe("5:4");
  });

  test("flags nothing when versions match and data is cached", () => {
    const prev = new Map([
      ["id-a", "10:9"],
      ["b", "5:4"],
    ]);
    const { changed } = runsNeedingRefresh(
      selected,
      entries("10:9", "5:4"),
      prev,
      new Set(["id-a", "b"]),
    );
    expect(changed).toEqual([]);
  });

  test("flags only the run whose version changed", () => {
    const prev = new Map([
      ["id-a", "10:9"],
      ["b", "5:4"],
    ]);
    const { changed } = runsNeedingRefresh(
      selected,
      entries("11:10", "5:4"),
      prev,
      new Set(["id-a", "b"]),
    );
    expect(changed).toEqual([runA]);
  });

  test("flags runs missing from the cache even when versions match", () => {
    const prev = new Map([
      ["id-a", "10:9"],
      ["b", "5:4"],
    ]);
    const { changed } = runsNeedingRefresh(
      selected,
      entries("10:9", "5:4"),
      prev,
      new Set(["id-a"]),
    );
    expect(changed).toEqual([runB]);
  });

  test("flags runs the server returned no version for", () => {
    const { changed } = runsNeedingRefresh(
      selected,
      [{ run: "a", run_id: "id-a", version: "10:9" }],
      new Map([["id-a", "10:9"]]),
      new Set(["id-a", "b"]),
    );
    expect(changed).toEqual([runB]);
  });
});
