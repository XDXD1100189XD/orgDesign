// Pre-ReAct planning layer — heuristic tier (Tier 2).
// Sonnet-based Tier 3 calls /api/ai/plan and falls back to these functions on failure.

export type IntentCategory =
  | 'factual_lookup'
  | 'aggregation_count'
  | 'comparison'
  | 'diagnostic_analysis'
  | 'workforce_capability'
  | 'scenario_change'
  | 'chart_report'
  | 'vague_exploratory'
  | 'multi_part';

export interface TaskEntities {
  employeeNames: string[];
  departments:   string[];
  metrics:       string[];
  writeIntent:   boolean;
  chartIntent:   boolean;
}

export interface Task {
  taskId:               string;
  intent:               IntentCategory;
  description:          string;
  entities:             TaskEntities;
  allowedTools:         string[];
  maxIterations:        number;
  dependsOn:            string[];
  expectedOutputShape:  string;
  clarificationNeeded:  boolean;
  clarificationQuestion?: string;
}

export interface CompletionCriterion {
  taskId:      string;
  description: string;
}

export interface ExecutionPlan {
  originalQuery:          string;
  normalizedQuery:        string;
  overallIntent:          IntentCategory;
  tasks:                  Task[];
  totalBudget:            number;
  shouldAskClarification: boolean;
  clarificationMessage?:  string;
  allowedTools:           string[];
  completionCriteria:     CompletionCriterion[];
  plannerModel:           'claude-sonnet-4-6' | 'heuristic';
}

// ── Per-intent tool budgets ──────────────────────────────────────────────────

const INTENT_BUDGET: Record<IntentCategory, number> = {
  factual_lookup:       2,
  aggregation_count:    3,
  comparison:           3,
  diagnostic_analysis:  5,
  workforce_capability: 5,
  scenario_change:      6,
  chart_report:         3,
  vague_exploratory:    0,
  multi_part:           10,
};

// ── Tool allowlists per intent ───────────────────────────────────────────────

const READ_SQL  = ['run_sql', 'get_schema', 'get_column_values', 'get_metrics'];
const ORG_READ  = [...READ_SQL, 'find_employees', 'get_hierarchy_path'];
const WC_TOOLS  = [
  'analyze_activities', 'get_employee_activity_load', 'get_critical_skills',
  'analyze_skill_gaps', 'find_successors', 'map_talent_to_need',
  'assess_succession_risks', 'get_wc_schema',
];
const WRITE_TOOLS = ['write_employees', 'set_comp_bands', 'set_field_mapping'];
const SCEN_TOOLS  = ['plan_scenario', 'apply_scenario', 'get_change_log', 'compare_states'];

const ALL_TOOLS = [
  ...ORG_READ, ...WC_TOOLS, ...WRITE_TOOLS, ...SCEN_TOOLS, 'create_chart',
];

export function restrictToolsForIntent(intent: IntentCategory): string[] {
  switch (intent) {
    case 'factual_lookup':       return ORG_READ;
    case 'aggregation_count':    return [...READ_SQL, 'get_schema'];
    case 'comparison':           return [...READ_SQL, 'compare_states'];
    case 'diagnostic_analysis':  return [...ORG_READ, 'get_schema'];
    case 'workforce_capability': return [...ORG_READ, ...WC_TOOLS];
    case 'scenario_change':      return [...ORG_READ, ...SCEN_TOOLS, ...WRITE_TOOLS];
    case 'chart_report':         return [...READ_SQL, 'get_schema', 'get_column_values', 'create_chart'];
    case 'vague_exploratory':    return [];
    case 'multi_part':           return ALL_TOOLS;
  }
}

export function assignToolBudget(intent: IntentCategory): number {
  return INTENT_BUDGET[intent];
}

// ── Intent classification ────────────────────────────────────────────────────

export function detectMultiPartQuery(text: string): boolean {
  if ((text.match(/\?/g) ?? []).length >= 2) return true;
  if (/\b(and also|and then|additionally|also|plus)\b.{10,}/i.test(text)) return true;
  if (/\b(what|who|how|show|tell|give).{5,50}\band\b.{5,50}(what|who|how|show|tell|give)/i.test(text)) return true;
  return false;
}

export function classifyQuery(text: string): IntentCategory {
  const t = text.toLowerCase();
  if (detectMultiPartQuery(text))                                                        return 'multi_part';
  if (/(chart|graph|plot|visualize|pie|bar|line)/i.test(t))                             return 'chart_report';
  if (/(plan|apply|move|reparent|restructure|promote|demote|delete.*role|hire|add.*role)/i.test(t)) return 'scenario_change';
  if (/(successor|succeed|replace|skill gap|capability|activity load|automation exposure|outsourc)/i.test(t)) return 'workforce_capability';
  if (/(compare|vs\b|versus|as.?is.*to.?be|which.*higher|which.*more|difference between)/i.test(t)) return 'comparison';
  if (/(why|root cause|structural issue|overload|bottleneck|\brisk\b|burnout)/i.test(t)) return 'diagnostic_analysis';
  if (/(how many|count|total|average|avg|sum|breakdown|distribution|per department|by grade|by level)/i.test(t)) return 'aggregation_count';
  if (/(who is|who manages|what is|what grade|who reports|find|look.?up|show me.*for\b)/i.test(t)) return 'factual_lookup';
  return 'vague_exploratory';
}

// ── Entity extraction ────────────────────────────────────────────────────────

const DEPT_KEYWORDS = [
  'engineering', 'product', 'design', 'finance', 'hr', 'sales', 'marketing',
  'operations', 'legal', 'strategy', 'analytics', 'data', 'infrastructure',
];

const METRIC_KEYWORDS = [
  'span', 'depth', 'headcount', 'salary', 'compensation', 'grade', 'level',
  'cost', 'budget', 'open role', 'vacancy', 'attrition', 'tenure',
];

function extractEntities(text: string): TaskEntities {
  const writeVerbs = /\b(update|change|set|promote|delete|hire|add|move|apply|insert|reparent|restructure)\b/i;
  const chartVerbs = /\b(chart|graph|plot|visualize|pie|bar|line)\b/i;

  // Proper names: capitalised tokens not at start of sentence, not department keywords
  const properNames = (text.match(/(?<!\.\s)(?<!\?\s)(?<!\!\s)\b[A-Z][a-z]{2,}\b/g) ?? [])
    .filter(n => !DEPT_KEYWORDS.includes(n.toLowerCase()));

  const departments = DEPT_KEYWORDS.filter(d =>
    new RegExp(`\\b${d}\\b`, 'i').test(text)
  );

  const metrics = METRIC_KEYWORDS.filter(m =>
    new RegExp(`\\b${m}\\b`, 'i').test(text)
  );

  return {
    employeeNames: [...new Set(properNames)],
    departments:   [...new Set(departments)],
    metrics:       [...new Set(metrics)],
    writeIntent:   writeVerbs.test(text),
    chartIntent:   chartVerbs.test(text),
  };
}

// ── Output shape inference ───────────────────────────────────────────────────

function inferOutputShape(intent: IntentCategory): string {
  const shapes: Record<IntentCategory, string> = {
    factual_lookup:       'sentence',
    aggregation_count:    'table',
    comparison:           'comparison_table',
    diagnostic_analysis:  'bulleted_findings',
    workforce_capability: 'ranked_list',
    scenario_change:      'approval_gate',
    chart_report:         'chart_confirmation',
    vague_exploratory:    'clarification_question',
    multi_part:           'sectioned_response',
  };
  return shapes[intent];
}

// ── Clause splitting ─────────────────────────────────────────────────────────

function splitIntoClauses(text: string): string[] {
  // Split on conjunctions that join independent clause-like segments (>15 chars each side)
  const parts = text
    .split(/\s+and\s+(?=[a-z]{2,})/i)
    .flatMap(p => p.split(/\s*,\s*(?:also|then|additionally)\s*/i))
    .map(p => p.trim())
    .filter(p => p.length > 5);
  return parts.length > 1 ? parts : [text];
}

// ── Core planning functions ──────────────────────────────────────────────────

export function decomposeIntoTasks(text: string): Task[] {
  const clauses = detectMultiPartQuery(text) ? splitIntoClauses(text) : [text];
  return clauses.map((clause, i) => {
    const intent = classifyQuery(clause);
    const prevClause = clauses[i - 1] ?? '';
    const hasPronouns = i > 0 && /\b(their|her|his|its|that|those|the same)\b/i.test(clause);
    return {
      taskId:              `task_${i + 1}`,
      intent,
      description:         clause.trim(),
      entities:            extractEntities(clause),
      allowedTools:        intent === 'multi_part' ? ALL_TOOLS : restrictToolsForIntent(intent),
      maxIterations:       INTENT_BUDGET[intent],
      dependsOn:           hasPronouns ? [`task_${i}`] : [],
      expectedOutputShape: inferOutputShape(intent),
      clarificationNeeded: intent === 'vague_exploratory',
      clarificationQuestion: intent === 'vague_exploratory'
        ? 'Could you be more specific? For example: headcount summary, span/layer analysis, skill gaps, compensation overview, or a specific person or department.'
        : undefined,
    };
    void prevClause; // used implicitly by hasPronouns check above
  });
}

export function buildExecutionPlan(tasks: Task[]): ExecutionPlan {
  const allTools = [...new Set(tasks.flatMap(t => t.allowedTools))];
  const rawBudget = tasks.reduce((s, t) => s + t.maxIterations, 0) + 2;
  const totalBudget = Math.min(rawBudget, 15);

  const needsClarification = tasks.some(t => t.clarificationNeeded);
  const hasWrite = tasks.some(t => t.entities.writeIntent);
  const hasRead  = tasks.some(t => !t.entities.writeIntent);
  const mixedWriteRead = hasWrite && hasRead;

  const shouldAskClarification = needsClarification || mixedWriteRead;
  const clarificationMessage = mixedWriteRead
    ? 'Your message includes both analysis and a write operation. Should I (1) run the analysis only, or (2) run the analysis and then apply the change? (Write Mode must be enabled for option 2.)'
    : tasks.find(t => t.clarificationNeeded)?.clarificationQuestion;

  return {
    originalQuery:          tasks.map(t => t.description).join(' '),
    normalizedQuery:        tasks.map(t => t.description).join(' '),
    overallIntent:          tasks.length === 1 ? tasks[0].intent : 'multi_part',
    tasks,
    totalBudget,
    shouldAskClarification,
    clarificationMessage,
    allowedTools:           allTools,
    completionCriteria:     tasks.map(t => ({
      taskId:      t.taskId,
      description: `Answer: "${t.description}"`,
    })),
    plannerModel: 'heuristic',
  };
}

// ── Strict mode plan ─────────────────────────────────────────────────────────

const STRICT_TOOLS = ['get_schema', 'get_wc_schema', 'run_sql'];

/**
 * Bypasses the Sonnet/heuristic planner entirely in strict mode.
 * Produces a fixed plan with only the 3 allowed tools, a safe budget of 4,
 * and no clarification gate so vague queries still attempt schema + SQL.
 */
export function buildStrictModePlan(userText: string): ExecutionPlan {
  return {
    originalQuery:          userText,
    normalizedQuery:        userText,
    overallIntent:          'aggregation_count',
    tasks: [{
      taskId:              'task_1',
      intent:              'aggregation_count',
      description:         userText,
      entities:            extractEntities(userText),
      allowedTools:        STRICT_TOOLS,
      maxIterations:       4,
      dependsOn:           [],
      expectedOutputShape: 'sql_block',
      clarificationNeeded: false,
    }],
    totalBudget:            4,
    shouldAskClarification: false,
    allowedTools:           STRICT_TOOLS,
    completionCriteria: [{
      taskId:      'task_1',
      description: `Provide an AlaSQL query that answers: "${userText}"`,
    }],
    plannerModel: 'heuristic',
  };
}

// ── Post-loop validation ─────────────────────────────────────────────────────

export function validateFinalAnswerAgainstTasks(
  answer: string,
  tasks: Task[],
): { valid: boolean; missedTasks: string[] } {
  const answerLower = answer.toLowerCase();
  const missed = tasks
    .filter(t => {
      if (!t.entities) return false;
      const keywords = [
        ...(t.entities.employeeNames ?? []),
        ...(t.entities.departments   ?? []),
        ...(t.entities.metrics       ?? []),
      ].map(e => e.toLowerCase());
      // Skip tasks with no extractable keywords — can't validate
      if (keywords.length === 0) return false;
      return !keywords.some(kw => answerLower.includes(kw));
    })
    .map(t => t.taskId);
  return { valid: missed.length === 0, missedTasks: missed };
}

// ── Plan → system context injection ─────────────────────────────────────────

export function injectPlanIntoContext(baseContext: string, plan: ExecutionPlan): string {
  if (plan.overallIntent === 'vague_exploratory') return baseContext;

  const taskLines = plan.tasks
    .map(t => {
      const dep = t.dependsOn.length > 0 ? ` — depends on: ${t.dependsOn.join(', ')}` : '';
      return `  [${t.taskId}] ${t.description} — tools: ${t.allowedTools.slice(0, 4).join(', ')}${t.allowedTools.length > 4 ? ', …' : ''} — budget: ${t.maxIterations} steps${dep}`;
    })
    .join('\n');

  const allToolNames = new Set(plan.allowedTools);
  const forbiddenTools = [
    'run_sql', 'get_schema', 'get_wc_schema', 'get_column_values', 'get_metrics',
    'find_employees', 'get_hierarchy_path', 'analyze_activities', 'get_employee_activity_load',
    'get_critical_skills', 'analyze_skill_gaps', 'find_successors', 'map_talent_to_need',
    'assess_succession_risks', 'create_chart', 'write_employees', 'set_comp_bands',
    'set_field_mapping', 'plan_scenario', 'apply_scenario', 'get_change_log', 'compare_states',
  ].filter(t => !allToolNames.has(t));

  const criteriaLines = plan.completionCriteria
    .map(c => `  - ${c.taskId}: ${c.description}`)
    .join('\n');

  const outputShape = plan.tasks.length === 1
    ? plan.tasks[0].expectedOutputShape
    : 'sectioned_response — one heading per task';

  const planBlock = `
## EXECUTION PLAN (planner: ${plan.plannerModel})
Intent: ${plan.overallIntent}
Tasks:
${taskLines}

PERMITTED TOOLS: ${plan.allowedTools.join(', ')}
${forbiddenTools.length > 0 ? `FORBIDDEN TOOLS (do not call): ${forbiddenTools.join(', ')}\n` : ''}
STEP BUDGET: ${plan.totalBudget} total — stop after ${plan.totalBudget} tool calls
ANSWER FORMAT: ${outputShape}
COMPLETION CRITERIA:
${criteriaLines}`;

  return baseContext + planBlock;
}

// ── Schema context extraction (for Sonnet planning call) ─────────────────────

export function extractSchemaSection(systemCtx: string): string {
  // Pull only the Employee data table section + metrics block (~500 tokens)
  // to avoid sending the full 3k-token prompt to the planner
  const start = systemCtx.indexOf('## Employee data table');
  const end   = systemCtx.indexOf('## Sample rows');
  if (start === -1) return systemCtx.slice(0, 1500);
  if (end === -1)   return systemCtx.slice(start, start + 1500);
  return systemCtx.slice(start, end);
}
