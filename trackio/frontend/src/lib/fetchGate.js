export function metricsFetchGate({ project, lastProject, runsLoading }) {
  const projectChanged = project !== lastProject;
  if (!project) {
    return { shouldReset: projectChanged, shouldFetch: true };
  }
  return {
    shouldReset: projectChanged,
    shouldFetch: !projectChanged && !runsLoading,
  };
}
