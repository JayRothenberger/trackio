export function runsNeedingRefresh(
  selectedRuns,
  versionEntries,
  prevVersions,
  cachedKeys,
) {
  const nextVersions = new Map();
  for (const entry of versionEntries ?? []) {
    nextVersions.set(entry.run_id ?? entry.run, entry.version);
  }
  const changed = [];
  for (const run of selectedRuns) {
    const key = run.id ?? run.name;
    const version = nextVersions.get(key);
    if (
      version == null ||
      !cachedKeys.has(key) ||
      prevVersions.get(key) !== version
    ) {
      changed.push(run);
    }
  }
  return { changed, nextVersions };
}
