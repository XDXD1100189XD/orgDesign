import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { buildExecutionPlan, decomposeIntoTasks, type ExecutionPlan } from '@/lib/queryPlanner';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLANNER_SYSTEM = `You are a query planner for an org analytics AI assistant built on Claude Haiku.
Your job: given a user's natural-language question and a summary of available data, return a structured JSON ExecutionPlan.

The executor is claude-haiku — optimise the plan for minimal tool calls and clear stopping criteria.

AVAILABLE TOOLS (haiku can only call tools in its allowedTools list):
run_sql, get_schema, get_wc_schema, get_column_values, get_metrics, compare_states,
get_hierarchy_path, find_employees, analyze_activities, get_employee_activity_load,
get_critical_skills, analyze_skill_gaps, find_successors, map_talent_to_need,
assess_succession_risks, create_chart, write_employees, set_comp_bands,
set_field_mapping, plan_scenario, apply_scenario, get_change_log

INTENT CATEGORIES:
factual_lookup | aggregation_count | comparison | diagnostic_analysis |
workforce_capability | scenario_change | chart_report | vague_exploratory | multi_part

TOOL ALLOWLISTS BY INTENT:
factual_lookup:       run_sql, get_schema, get_column_values, get_metrics, find_employees, get_hierarchy_path
aggregation_count:    run_sql, get_schema, get_column_values, get_metrics
comparison:           run_sql, get_schema, get_column_values, get_metrics, compare_states
diagnostic_analysis:  run_sql, get_schema, get_column_values, get_metrics, find_employees, get_hierarchy_path
workforce_capability: run_sql, get_schema, get_column_values, get_metrics, find_employees, get_hierarchy_path, analyze_activities, get_employee_activity_load, get_critical_skills, analyze_skill_gaps, find_successors, map_talent_to_need, assess_succession_risks, get_wc_schema
scenario_change:      run_sql, get_schema, get_column_values, get_metrics, find_employees, get_hierarchy_path, plan_scenario, apply_scenario, get_change_log, compare_states, write_employees, set_comp_bands, set_field_mapping
chart_report:         run_sql, get_schema, get_column_values, get_metrics, create_chart
vague_exploratory:    (none)
multi_part:           (union of sub-task allowlists)

BUDGET LIMITS: factual_lookup=2, aggregation_count=3, comparison=3, diagnostic_analysis=5, workforce_capability=5, scenario_change=6, chart_report=3, vague_exploratory=0, multi_part=10

Return ONLY valid raw JSON — no markdown fences, no explanation. Schema:
{
  "normalizedQuery": string,
  "overallIntent": IntentCategory,
  "tasks": [{
    "taskId": string,
    "intent": IntentCategory,
    "description": string,
    "allowedTools": string[],
    "maxIterations": number,
    "dependsOn": string[],
    "expectedOutputShape": "sentence"|"table"|"comparison_table"|"bulleted_findings"|"ranked_list"|"approval_gate"|"chart_confirmation"|"clarification_question"|"sectioned_response",
    "clarificationNeeded": boolean,
    "clarificationQuestion": string|null
  }],
  "totalBudget": number,
  "shouldAskClarification": boolean,
  "clarificationMessage": string|null,
  "allowedTools": string[],
  "completionCriteria": [{ "taskId": string, "description": string }]
}`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  const { userText, schemaContext, wcAvailable, writeMode } = await req.json() as {
    userText:      string;
    schemaContext: string;
    wcAvailable:   boolean;
    writeMode:     boolean;
  };

  if (!userText?.trim()) {
    return Response.json({ error: 'userText is required' }, { status: 400 });
  }

  // Skip Sonnet for very short / obviously simple queries — heuristic is sufficient
  const wordCount = userText.trim().split(/\s+/).length;
  if (wordCount <= 4) {
    const plan = buildExecutionPlan(decomposeIntoTasks(userText));
    return Response.json({ plan: { ...plan, plannerModel: 'heuristic-shortcut' } });
  }

  const userPrompt = `User query: "${userText}"

Available data:
${schemaContext}

WC (Work & Capability) data loaded: ${wcAvailable}
Write mode enabled: ${writeMode}

Return the ExecutionPlan JSON for this query.`;

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     PLANNER_SYSTEM,
      messages:   [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const plan = JSON.parse(raw) as ExecutionPlan;

    // Basic validation — if the response is malformed, fall through to heuristic
    if (!plan.tasks?.length || !plan.overallIntent) {
      throw new Error('Invalid plan shape');
    }

    return Response.json({ plan: { ...plan, plannerModel: 'claude-sonnet-4-6' } });
  } catch {
    // Always return something usable — heuristic is the safety net
    const fallback = buildExecutionPlan(decomposeIntoTasks(userText));
    return Response.json({ plan: { ...fallback, plannerModel: 'heuristic-fallback' } });
  }
}
