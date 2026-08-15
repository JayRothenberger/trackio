<script>
  import { tick } from "svelte";
  import LoadingTrackio from "../components/LoadingTrackio.svelte";
  import {
    getProjectSummary,
    getRunSummary,
    getRunArtifactCounts,
    getRunMetricSummaries,
    deleteRun,
    renameRun,
  } from "../lib/api.js";
  import { openRunDetail } from "../lib/router.js";
  import { buildColorMap } from "../lib/stores.js";
  import { filterMetricsByRegex } from "../lib/dataProcessing.js";
  import {
    METRIC_AGGS,
    buildSummaryMap,
    formatMetricValue,
    metricValue,
    sortRuns,
  } from "../lib/runSort.js";

  let {
    project = null,
    runs = [],
    filterText = "",
    onRunsChanged = null,
    runMutationAllowed = true,
  } = $props();

  let canMutateRuns = $derived(runMutationAllowed);

  let runColorMap = $derived(buildColorMap(runs));

  let runsData = $state([]);
  let loading = $state(false);
  let renamingIndex = $state(-1);
  let renameValue = $state("");
  let renameInput = $state(null);
  let metricSummaries = $state([]);
  let metricKeys = $state([]);
  let selectedMetric = $state("");
  let sortCol = $state(null);
  let sortDir = $state("desc");

  let summaryMap = $derived(buildSummaryMap(metricSummaries));

  let filteredRuns = $derived.by(() => {
    if (!filterText || !filterText.trim()) return runsData;
    const matches = new Set(filterMetricsByRegex(runsData.map((r) => r.name), filterText));
    return runsData.filter((r) => matches.has(r.name));
  });

  let sortedRuns = $derived(
    sortRuns(filteredRuns, sortCol, sortDir, summaryMap, selectedMetric),
  );

  function toggleSort(col) {
    if (sortCol === col) {
      if (sortDir === "desc") {
        sortDir = "asc";
      } else {
        sortCol = null;
        sortDir = "desc";
      }
    } else {
      sortCol = col;
      sortDir = col === "name" ? "asc" : "desc";
    }
  }

  function selectMetric(value) {
    selectedMetric = value;
    if (!value && METRIC_AGGS.includes(sortCol)) {
      sortCol = null;
      sortDir = "desc";
    }
  }

  function sortArrow(col) {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? "↑" : "↓";
  }

  let hasArtifacts = $derived(
    runsData.some((r) => r.outputs > 0 || r.inputs > 0),
  );

  let loadSeq = 0;

  function buildArtifactCountMaps(counts) {
    const byId = new Map();
    const byName = new Map();
    for (const row of counts) {
      const map = row.run_id != null ? byId : byName;
      const key = row.run_id != null ? row.run_id : row.run_name;
      const entry = map.get(key) ?? { inputs: 0, outputs: 0 };
      entry.inputs += row.input || 0;
      entry.outputs += row.output || 0;
      map.set(key, entry);
    }
    return { byId, byName };
  }

  function artifactCountsFor(maps, record, nameRecordCounts) {
    const idCounts = record.id != null ? maps.byId.get(record.id) : null;
    const soleRecordForName = (nameRecordCounts.get(record.name) ?? 0) === 1;
    const nameCounts =
      record.id == null || soleRecordForName
        ? maps.byName.get(record.name)
        : null;
    return {
      inputs: (idCounts?.inputs ?? 0) + (nameCounts?.inputs ?? 0),
      outputs: (idCounts?.outputs ?? 0) + (nameCounts?.outputs ?? 0),
    };
  }

  async function loadRuns() {
    const seq = ++loadSeq;
    if (!project) {
      runsData = [];
      loading = false;
      return;
    }

    loading = true;
    try {
      const summary = await getProjectSummary(project);
      const runRecords = summary.runs || [];
      const [summaries, artifactCounts, metricSummaryData] = await Promise.all([
        Promise.all(runRecords.map((run) => getRunSummary(project, run))),
        getRunArtifactCounts(project).catch(() => []),
        getRunMetricSummaries(project).catch(() => null),
      ]);
      if (seq !== loadSeq) return;
      metricSummaries = metricSummaryData?.summaries ?? [];
      metricKeys = metricSummaryData?.metric_keys ?? [];
      if (selectedMetric && !metricKeys.includes(selectedMetric)) {
        selectMetric("");
      }
      const countMaps = buildArtifactCountMaps(artifactCounts);
      const nameRecordCounts = new Map();
      for (const r of runRecords) {
        nameRecordCounts.set(r.name, (nameRecordCounts.get(r.name) ?? 0) + 1);
      }
      runsData = summaries.map((s, i) => ({
        id: runRecords[i].id,
        name: runRecords[i].name,
        numSteps: s.num_logs || 0,
        lastStep: s.last_step || 0,
        ...artifactCountsFor(countMaps, runRecords[i], nameRecordCounts),
      }));
    } catch (e) {
      if (seq === loadSeq) console.error("Failed to load runs:", e);
    } finally {
      if (seq === loadSeq) loading = false;
    }
  }

  $effect(() => {
    project;
    loadRuns();
  });

  async function handleDelete(run) {
    if (!canMutateRuns) return;
    if (!confirm(`Delete run "${run.name}"? This cannot be undone.`)) return;
    try {
      await deleteRun(project, run);
      await loadRuns();
      if (onRunsChanged) onRunsChanged();
    } catch (e) {
      console.error("Failed to delete run:", e);
    }
  }

  async function startRename(index, currentName) {
    if (!canMutateRuns) return;
    renamingIndex = index;
    renameValue = currentName;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  async function submitRename(run) {
    if (!canMutateRuns) return;
    const newName = renameValue.trim();
    if (!newName || newName === run.name) {
      renamingIndex = -1;
      return;
    }
    try {
      await renameRun(project, run, newName);
      renamingIndex = -1;
      await loadRuns();
      if (onRunsChanged) onRunsChanged();
    } catch (e) {
      console.error("Failed to rename run:", e);
    }
  }

  function handleRenameKeydown(e, run) {
    if (e.key === "Enter") submitRename(run);
    if (e.key === "Escape") renamingIndex = -1;
  }
</script>

<div class="runs-page">
  {#if loading}
    <LoadingTrackio />
  {:else if runsData.length === 0}
    <div class="empty-state">
      <h2>No runs in this project</h2>
      <p>Runs are created when you call <code>trackio.init()</code> and log at least one step. Example:</p>
      <pre><code>{'import trackio\ntrackio.init(project="my-project")\nfor i in range(10):\n    trackio.log({"loss": 1 / (i + 1)})\ntrackio.finish()'}</code></pre>
      <p>Refresh this page or wait for the dashboard to poll; new runs appear in the table with step counts.</p>
    </div>
  {:else}
    <div class="table-toolbar">
      {#if filterText}
        <span class="filter-count">{filteredRuns.length} of {runsData.length} runs</span>
      {/if}
      {#if metricKeys.length > 0}
        <label class="metric-picker">
          <span>Metric columns:</span>
          <select
            value={selectedMetric}
            onchange={(e) => selectMetric(e.target.value)}
          >
            <option value="">None</option>
            {#each metricKeys as key}
              <option value={key}>{key}</option>
            {/each}
          </select>
        </label>
      {/if}
    </div>
    <table class="runs-table">
      <thead>
        <tr>
          <th>Actions</th>
          <th
            class="sortable"
            class:sorted={sortCol === "name"}
            onclick={() => toggleSort("name")}
          >
            Run Name <span class="sort-arrow">{sortArrow("name")}</span>
          </th>
          <th
            class="sortable"
            class:sorted={sortCol === "numSteps"}
            onclick={() => toggleSort("numSteps")}
          >
            Steps <span class="sort-arrow">{sortArrow("numSteps")}</span>
          </th>
          <th
            class="sortable"
            class:sorted={sortCol === "lastStep"}
            onclick={() => toggleSort("lastStep")}
          >
            Last Step <span class="sort-arrow">{sortArrow("lastStep")}</span>
          </th>
          {#if selectedMetric}
            {#each METRIC_AGGS as agg}
              <th
                class="sortable metric-col"
                class:sorted={sortCol === agg}
                title="{agg} of {selectedMetric}"
                onclick={() => toggleSort(agg)}
              >
                {agg} <span class="sort-arrow">{sortArrow(agg)}</span>
              </th>
            {/each}
          {/if}
          {#if hasArtifacts}
            <th>Artifacts</th>
          {/if}
        </tr>
      </thead>
      <tbody>
        {#each sortedRuns as run, i}
          <tr>
            <td class="actions-cell">
              <div class="actions-wrap">
              <button
                class="action-btn"
                title={canMutateRuns ? "Rename" : "Sign in with Hugging Face (write access) to rename runs"}
                disabled={!canMutateRuns}
                onclick={() => startRename(i, run.name)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>
              <button
                class="action-btn delete-btn"
                title={canMutateRuns ? "Delete" : "Sign in with Hugging Face (write access) to delete runs"}
                disabled={!canMutateRuns}
                onclick={() => handleDelete(run)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6"/>
                  <path d="M14 11v6"/>
                  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </button>
              </div>
            </td>
            <td class="run-name-cell">
              {#if renamingIndex === i}
                <input
                  class="rename-input"
                  type="text"
                  bind:value={renameValue}
                  bind:this={renameInput}
                  onkeydown={(e) => handleRenameKeydown(e, run)}
                  onblur={() => submitRename(run)}
                />
              {:else}
                <div class="run-name-with-dot">
                  <span
                    class="run-dot"
                    style:background={runColorMap[run.id ?? run.name] ??
                      "#9ca3af"}
                  ></span>
                  <button class="link-btn" onclick={() => openRunDetail(run.name, run.id)}>
                    {run.name}
                  </button>
                </div>
              {/if}
            </td>
            <td>{run.numSteps}</td>
            <td>{run.lastStep}</td>
            {#if selectedMetric}
              {#each METRIC_AGGS as agg}
                <td class="metric-col">
                  {formatMetricValue(
                    metricValue(summaryMap, run, selectedMetric, agg),
                  )}
                </td>
              {/each}
            {/if}
            {#if hasArtifacts}
              <td>
                {#if run.outputs > 0 || run.inputs > 0}
                  <div class="artifact-counts">
                    {#if run.outputs > 0}
                      <span
                        class="art-count"
                        title="{run.outputs} output artifact{run.outputs === 1
                          ? ''
                          : 's'} (produced)">↑ {run.outputs}</span
                      >
                    {/if}
                    {#if run.inputs > 0}
                      <span
                        class="art-count"
                        title="{run.inputs} input artifact{run.inputs === 1
                          ? ''
                          : 's'} (consumed)">↓ {run.inputs}</span
                      >
                    {/if}
                  </div>
                {:else}
                  <span class="art-none">—</span>
                {/if}
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .runs-page {
    padding: 20px 24px;
    overflow-y: auto;
    flex: 1;
  }
  .empty-state {
    max-width: 640px;
    padding: 40px 24px;
    color: var(--body-text-color, #1f2937);
  }
  .empty-state h2 {
    margin: 0 0 8px;
    font-size: 20px;
    font-weight: 700;
  }
  .empty-state p {
    margin: 12px 0 8px;
    color: var(--body-text-color-subdued, #6b7280);
  }
  .empty-state pre {
    background: var(--background-fill-secondary, #f9fafb);
    padding: 16px;
    border-radius: var(--radius-lg, 8px);
    border: 1px solid var(--border-color-primary, #e5e7eb);
    font-size: 13px;
    overflow-x: auto;
  }
  .empty-state code {
    background: var(--background-fill-secondary, #f0f0f0);
    padding: 1px 5px;
    border-radius: var(--radius-sm, 4px);
    font-size: 13px;
  }
  .empty-state pre code {
    background: none;
    padding: 0;
  }
  .table-toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;
    min-height: 28px;
  }
  .filter-count {
    font-size: var(--text-sm, 12px);
    color: var(--body-text-color-subdued, #6b7280);
  }
  .metric-picker {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    font-size: var(--text-sm, 12px);
    color: var(--body-text-color-subdued, #6b7280);
  }
  .metric-picker select {
    font: inherit;
    color: var(--body-text-color, #1f2937);
    background: var(--background-fill-primary, white);
    border: 1px solid var(--border-color-primary, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    padding: 3px 6px;
    max-width: 280px;
  }
  .runs-table th.sortable {
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .runs-table th.sortable:hover {
    color: var(--body-text-color, #1f2937);
  }
  .runs-table th.sorted {
    color: var(--color-accent, #f97316);
  }
  .sort-arrow {
    display: inline-block;
    width: 1em;
  }
  .runs-table th.metric-col,
  .runs-table td.metric-col {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .runs-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-md, 14px);
  }
  .runs-table th {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 2px solid var(--border-color-primary, #e5e7eb);
    color: var(--body-text-color-subdued, #6b7280);
    font-weight: 600;
    font-size: var(--text-sm, 12px);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .runs-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color-primary, #e5e7eb);
    color: var(--body-text-color, #1f2937);
  }
  .runs-table tbody tr:nth-child(odd) {
    background: var(--table-odd-background-fill, var(--background-fill-primary, white));
  }
  .runs-table tbody tr:nth-child(even) {
    background: var(--table-even-background-fill, var(--background-fill-secondary, #f9fafb));
  }
  .runs-table tr:hover {
    background: var(--background-fill-secondary, #f3f4f6);
  }
  .run-name-cell {
    font-weight: 500;
  }
  .run-name-with-dot {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
  }
  .run-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .link-btn {
    background: none;
    border: none;
    color: var(--color-accent, #f97316);
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    padding: 0;
    text-align: left;
  }
  .link-btn:hover {
    text-decoration: underline;
  }
  .rename-input {
    font: inherit;
    padding: 2px 6px;
    border: 1px solid var(--color-accent, #f97316);
    border-radius: var(--radius-sm, 4px);
    outline: none;
    width: 100%;
  }
  .actions-wrap {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .action-btn {
    background: none;
    border: 1px solid transparent;
    color: var(--body-text-color-subdued, #6b7280);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm, 4px);
    display: flex;
    align-items: center;
  }
  .action-btn:hover {
    background: var(--background-fill-secondary, #f9fafb);
    border-color: var(--border-color-primary, #e5e7eb);
    color: var(--body-text-color, #1f2937);
  }
  .delete-btn:hover {
    color: #dc2626;
    border-color: #fecaca;
    background: #fef2f2;
  }
  .action-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }
  .artifact-counts {
    display: inline-flex;
    gap: 6px;
  }
  .art-count {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: var(--text-sm, 12px);
    color: var(--body-text-color-subdued, #6b7280);
    background: transparent;
    border: 1px solid var(--border-color-primary, #e5e7eb);
    border-radius: 9px;
    padding: 1px 8px;
    white-space: nowrap;
  }
  .art-none {
    color: var(--body-text-color-subdued, #9ca3af);
  }
</style>
