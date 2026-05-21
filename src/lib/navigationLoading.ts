export const NAVIGATION_LOADING_DURATION_MS = 900;

const TAB_LABELS: Record<string, string> = {
  summary: "Summary",
  advanced: "Advanced Analytics",
  studio: "Analytics Studio",
  tree: "Hierarchy",
  table: "Employees",
  readiness: "Data Readiness",
  comp: "Comp Setup",
  "workforce-intelligence": "Workforce Intelligence",
  story: "Story",
};

const WORKFORCE_SUB_TAB_LABELS: Record<string, string> = {
  "activity-analysis": "Activity Analysis",
  "talent-mapping": "Talent Mapping",
};

export function getNavigationLoadingMessage(
  tab: string,
  workforceSubTab?: string,
): string {
  if (tab === "workforce-intelligence" && workforceSubTab) {
    const label = WORKFORCE_SUB_TAB_LABELS[workforceSubTab] ?? "Workforce Intelligence";
    return `${label} content is still loading.`;
  }

  const label = TAB_LABELS[tab] ?? "Dashboard";
  return `${label} content is still loading.`;
}
