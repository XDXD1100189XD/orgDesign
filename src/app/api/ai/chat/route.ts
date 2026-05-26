import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_sql',
    description:
      'Execute a SQL query against the in-memory AlaSQL tables (NOT PostgreSQL). The primary org table is named `data`. When Work & Capability data is loaded, these additional tables are also available for SELECT and JOIN: `activity_library`, `skill_library`, `activity_assignments`, `employee_skills`, `role_skill_requirements`, `activity_skill_requirements`. Use SELECT for queries and INSERT/UPDATE/DELETE for mutations (on `data` only — WC tables are read-only). Mutations require user confirmation. Call `get_wc_schema` first to learn join keys before writing cross-table queries. If this returns { ok: false, error: "..." }, fix and retry. For Work & Capability questions, prefer domain WC tools (analyze_activities, find_successors, etc.) first — use run_sql as the SQL fallback for both org and WC tables. NEVER USE: window functions (OVER/PARTITION BY — silently wrong), RANK()/DENSE_RANK()/NTILE(), LEAD()/LAG(), FIRST_VALUE()/LAST_VALUE(), STDDEV/VAR_POP/VAR_SAMP, STRING_AGG/GROUP_CONCAT, CONCAT_WS, WITH/CTEs, EXCEPT/INTERSECT, FETCH FIRST n ROWS ONLY, INSERT ON CONFLICT, PostgreSQL-specific syntax (::cast, ILIKE, RETURNING). SAFE: SELECT/FROM/WHERE/GROUP BY/HAVING/ORDER BY/LIMIT/JOIN/CASE WHEN/IS NULL/LIKE/subqueries/COALESCE/INSERT OR REPLACE.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'A valid AlaSQL statement. Column names with spaces must be backtick-quoted. Org table is `data`; WC tables use their real names. FORBIDDEN: any OVER clause (window functions silently return wrong results — use GROUP BY instead), RANK()/DENSE_RANK() (use ORDER BY + LIMIT), WITH/CTEs (use subqueries), EXCEPT/INTERSECT (use JOIN + WHERE NOT IN), FETCH FIRST (use LIMIT), STRING_AGG/GROUP_CONCAT (fetch rows and list in response text). Use only standard aggregates: COUNT, SUM, AVG, MIN, MAX.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_metrics',
    description:
      'Returns precomputed org hierarchy metrics: total employees, total managers, avg span, span Gini, overloaded manager count, org depth, etc. Always call this first for org-wide statistics — it is instant and requires no SQL.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_schema',
    description:
      'Returns the exact list of column names (with inferred data types) available in the org `ai_employees` table, plus a summary of Work & Capability tables available for JOIN (when WC data is loaded). Call this if you are unsure about column names before writing SQL. Always use the exact column names returned here — never guess or invent column names.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_wc_schema',
    description:
      'Returns the full schema — columns (with types), primary keys, foreign key relationships, mandatory JOIN templates, and 2–3 safe example queries — for all Work & Capability tables. ALWAYS call this before writing any multi-table SQL involving activity_library, skill_library, activity_assignments, employee_skills, role_skill_requirements, or activity_skill_requirements. Start every WC query from the provided JOIN templates — never invent join paths. Only useful when WC data is loaded (check with get_schema first).',
    input_schema: {
      type: 'object' as const,
      properties: {
        table: {
          type: 'string',
          enum: ['activity_library', 'activity_assignments', 'skill_library', 'role_skill_requirements', 'employee_skills', 'activity_skill_requirements'],
          description: 'Optional: return schema for a single WC table. Omit to get all six tables.',
        },
      },
      required: [],
    },
  },
  {
    name: 'analyze_activities',
    description:
      'Analyzes Work & Capability activity data across four dimensions. focus="automation" ranks activities by automation cost-reduction potential; focus="outsourcing" ranks by outsourcing potential; focus="workload" shows which employees hold the most activity load and which activities have fewer than 2 staff (concentration risk); focus="skill_coverage" finds activities whose required skills are not covered by current employee proficiency levels; focus="all" returns all four. Optionally filter by department. Requires WC data to be loaded — check with get_schema first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        focus: {
          type: 'string',
          enum: ['automation', 'outsourcing', 'workload', 'skill_coverage', 'all'],
          description: 'Analysis dimension. Default: all.',
        },
        department: {
          type: 'string',
          description: 'Optional: filter to a specific department_focus value. Use get_column_values on department_focus to see valid values.',
        },
        limit: {
          type: 'number',
          description: 'Max rows per result set (default 10).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_employee_activity_load',
    description:
      'Returns the full activity portfolio for a specific employee: every activity they are assigned to with time allocation %, RACI accountability, criticality, automation/outsourcing exposure scores, complexity, and frequency. Use for questions like "what does person X work on?", "what share of X\'s time is high-criticality?", or "which of X\'s activities are automation candidates?". Requires WC data to be loaded. Use find_employees first to look up the employee_id from a name.',
    input_schema: {
      type: 'object' as const,
      properties: {
        employee_id: {
          type: 'string',
          description: 'Employee ID to look up (must match employee_id in activity_assignments). Use find_employees to discover IDs from names.',
        },
      },
      required: ['employee_id'],
    },
  },
  {
    name: 'get_critical_skills',
    description:
      'Surfaces skills with single-point risk (only 1–2 employees hold them), critically low coverage relative to role/activity demand (employees_at_level_3_plus < roles_requiring_skill), or any combination. Use for talent-risk questions: "which skills are we most exposed on?", "what are our key-person skill dependencies?", "where will we have a shortage?". Requires WC data to be loaded.',
    input_schema: {
      type: 'object' as const,
      properties: {
        risk_type: {
          type: 'string',
          enum: ['single_point', 'low_coverage', 'all'],
          description: 'single_point = held by ≤2 people; low_coverage = qualified supply < demand; all = either. Default: all.',
        },
        criticality: {
          type: 'string',
          enum: ['Low', 'Medium', 'High'],
          description: 'Optional: filter to skills of this criticality level only.',
        },
      },
      required: [],
    },
  },
  {
    name: 'analyze_skill_gaps',
    description:
      'Computes skill coverage for a given role or scope by comparing role_skill_requirements against employee_skills. Reports how many employees currently meet each required skill at the required level, and identifies which skills have the most coverage gaps. Note: results reflect current skill-record coverage — treat as an indicator, not an absolute readiness score. scope="employee" requires employee_id + position_title + department (use find_employees first). scope="role" requires position_title + department. scope="department" requires department. scope="org" needs no filter. Requires WC data loaded.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scope: {
          type: 'string',
          enum: ['employee', 'role', 'department', 'org'],
          description: 'Analysis scope. Default: role.',
        },
        employee_id: {
          type: 'string',
          description: 'Required for scope=employee. Use find_employees to look up.',
        },
        position_title: {
          type: 'string',
          description: 'Required for scope=employee (the role to compare against) and scope=role.',
        },
        department: {
          type: 'string',
          description: 'Required for scope=role (narrows to position_title within that department). Required for scope=department.',
        },
        min_gap:  { type: 'number', description: 'Minimum gap level to include (default 1). Only applies to scope=employee.' },
        limit:    { type: 'number', description: 'Max rows returned (default 20).' },
      },
      required: [],
    },
  },
  {
    name: 'find_successors',
    description: "Finds employees ranked by weighted skill match for a target role. Returns fit_pct (weighted: High skills 3×, Medium 2×, Low 1×), skills_met, critical_gaps, and top 5 missing skills. Results are skill-match indicators — not succession readiness. Call find_employees first to get position_title+department, then pass both here. role_key is preferred over position_title+department if available. Requires WC data loaded.",
    input_schema: {
      type: 'object' as const,
      properties: {
        position_title:      { type: 'string', description: 'Target role title. Use with department for disambiguation.' },
        department:          { type: 'string', description: 'Narrows role match to one department. Recommended when position_title is not unique.' },
        role_key:            { type: 'string', description: 'Preferred: stable role identifier from role_skill_requirements.role_key.' },
        exclude_employee_id: { type: 'string', description: 'Exclude current role-holder from results.' },
        min_readiness_pct:   { type: 'number', description: 'Minimum fit_pct to include (default 60).' },
        limit:               { type: 'number', description: 'Max candidates (default 10).' },
      },
      required: [],
    },
  },
  {
    name: 'map_talent_to_need',
    description: "Finds employees matching a skill, activity, or role. match_type='skill' (high confidence): employees with a given skill at or above min_level. match_type='activity' (medium): employees ranked by weighted skill-fit for an activity's required skills. match_type='role' (broad skill-fit): ranked employees for a role — use find_successors for succession planning. All modes return scoring_method and caveats. Requires WC data loaded.",
    input_schema: {
      type: 'object' as const,
      properties: {
        match_type:     { type: 'string', enum: ['skill', 'activity', 'role'], description: 'What to match against.' },
        skill_id:       { type: 'string', description: 'Required if match_type=skill.' },
        activity_id:    { type: 'string', description: 'Required if match_type=activity.' },
        position_title: { type: 'string', description: 'Required if match_type=role. Use with department.' },
        department:     { type: 'string', description: 'For match_type=role: narrows role requirements to one department.' },
        role_key:       { type: 'string', description: 'For match_type=role: preferred role identifier.' },
        min_level:      { type: 'number', description: 'For match_type=skill only: minimum current_level (default 1).' },
        min_fit_pct:    { type: 'number', description: 'For match_type=activity/role: minimum weighted fit % to include (default 0 = include all).' },
        limit:          { type: 'number', description: 'Max results (default 10).' },
      },
      required: ['match_type'],
    },
  },
  {
    name: 'assess_succession_risks',
    description: 'Scans roles in role_skill_requirements and computes, for each role, how many employees meet ≥ readiness_threshold_pct of required skills (weighted by criticality: High=3, Medium=2, Low=1). Flags roles Critical (0 qualified), High (1), Medium (2), Low (3+). Results reflect skill-match coverage only — not succession plan status. For candidates for one role, use find_successors. Requires WC data loaded.',
    input_schema: {
      type: 'object' as const,
      properties: {
        scope:                   { type: 'string', enum: ['org', 'department'], description: 'org = all roles; department = filter to one. Default: org.' },
        department:              { type: 'string', description: 'Required if scope=department.' },
        readiness_threshold_pct: { type: 'number', description: 'Min weighted fit_pct to count as qualified successor (default 70).' },
        min_required_skills:     { type: 'number', description: 'Skip roles with fewer than this many defined requirements (default 1).' },
        limit:                   { type: 'number', description: 'Max roles in result (default 20). Summary counts always reflect all assessed roles.' },
      },
      required: [],
    },
  },
  {
    name: 'create_chart',
    description:
      'Creates a pivot chart in Analytics Studio. ONLY call this after you have verified (via get_schema + a sample run_sql) that the required fields exist in the data. If the field does not exist and cannot be derived, explain the gap instead. The UI will switch to Analytics Studio automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        chartType:  { type: 'string', enum: ['bar','stackedBar','line','area','pie','radar'], description: 'Chart type to render' },
        rowField:   { type: 'string', description: 'Primary grouping field (x-axis / row labels). Must match an exact column name.' },
        valueField: { type: 'string', description: 'Numeric field or computed alias to aggregate. Must match a real column OR the alias used in sqlQuery.' },
        aggFn:      { type: 'string', enum: ['sum','count','avg','min','max'], description: 'Aggregation function' },
        colField:   { type: 'string', description: 'Optional secondary field to split into multiple series (e.g. grade for grouped bar)' },
        title:      { type: 'string', description: 'Short human-readable description of the chart' },
        sqlQuery:   { type: 'string', description: 'Required when valueField is a computed/derived metric (not a direct column). Must SELECT rowField and one numeric alias matching valueField. E.g. SELECT department, SUM(cost_a + cost_b) as transition_cost FROM data GROUP BY department' },
      },
      required: ['chartType', 'rowField', 'aggFn'],
    },
  },
  {
    name: 'get_column_values',
    description:
      'Returns all unique values and their frequency counts for a specific column. Call this BEFORE writing a WHERE clause that filters on a categorical column — it prevents SQL errors from mismatched values (e.g. wrong department name casing or spelling). Always use the exact values returned here in your SQL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        column: {
          type: 'string',
          description: 'Exact column name to inspect for unique values',
        },
      },
      required: ['column'],
    },
  },
  {
    name: 'find_employees',
    description:
      'Fuzzy search for employees by name, role, or any string field. Case-insensitive substring match across all text columns. Use instead of SQL LIKE for natural language lookups like "find Alice", "search for engineers in London", or "who is the VP of Product?".',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search term — matched against all string columns (name, role, department, geo, grade, etc.)',
        },
        limit: {
          type: 'number',
          description: 'Max number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_hierarchy_path',
    description:
      'Returns the full management chain (org path) for an employee from the root (CEO) down to that person. Use for questions like "who does X report to?", "what is X\'s org chain?", or "show me the path from CEO to [name]".',
    input_schema: {
      type: 'object' as const,
      properties: {
        employee_name: {
          type: 'string',
          description: 'Name or partial name of the employee to trace',
        },
      },
      required: ['employee_name'],
    },
  },
  {
    name: 'compare_states',
    description:
      'Compares As-Is vs To-Be org state metrics side by side. Returns headcount, avg span, org depth, manager count, overloaded managers, and open roles — with deltas. Only available when a To-Be state has been loaded in the Hierarchy tab.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'set_comp_bands',
    description:
      'Creates or replaces compensation bands in the comp matrix. ONLY available when Write Mode is enabled by the user. Use this after analyzing salary distributions via run_sql to suggest grade × geography min/max bands. Always call run_sql first to derive percentile-based ranges from real data before calling this tool. Requires explicit user confirmation before applying. If the user does not specify As-Is or To-Be, set target to "both".',
    input_schema: {
      type: 'object' as const,
      properties: {
        bands: {
          type: 'array',
          description: 'Array of compensation bands to set',
          items: {
            type: 'object',
            properties: {
              grade:    { type: 'string', description: 'Grade level (e.g. L4, Senior, Director)' },
              geo:      { type: 'string', description: 'Geography (e.g. US, IN-GCC, UK)' },
              min:      { type: 'number', description: 'Minimum annual compensation' },
              max:      { type: 'number', description: 'Maximum annual compensation' },
              currency: { type: 'string', description: 'ISO currency code (e.g. USD, INR, GBP)' },
            },
            required: ['grade', 'geo', 'min', 'max', 'currency'],
          },
        },
        replace_all: {
          type: 'boolean',
          description: 'If true, replaces ALL existing bands. If false (default), only adds or updates the specified bands.',
        },
        target: {
          type: 'string',
          enum: ['as-is', 'to-be', 'both'],
          description: 'Which state to apply the bands to. Defaults to "both" when the user does not explicitly say As-Is or To-Be.',
        },
        rationale: {
          type: 'string',
          description: 'Brief explanation of how the ranges were derived (e.g. "P25–P75 of current salaries per grade × geo").',
        },
      },
      required: ['bands'],
    },
  },
  {
    name: 'write_employees',
    description:
      'Add, update, or delete rows in the employee org table and rebuild the hierarchy. ONLY available when Write Mode is enabled. Always call run_sql SELECT first to preview affected rows, then call this to apply. Specify target: "as-is" updates the base org, "to-be" updates the future-state org, "both" updates both. Requires user confirmation.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql:       { type: 'string', description: 'INSERT, UPDATE, or DELETE SQL against the `data` table' },
        target:    { type: 'string', enum: ['as-is', 'to-be', 'both'], description: 'Which state to apply the change to' },
        rationale: { type: 'string', description: 'Why this change is being made' },
      },
      required: ['sql', 'target', 'rationale'],
    },
  },
  {
    name: 'set_field_mapping',
    description:
      'Maps an unmapped canonical org field (e.g. "Job Family") to an existing column OR derives it via SQL and writes it as a new column. Rebuilds the org hierarchy with the new mapping. ONLY in Write Mode. Call get_column_values first to understand available data. For derived_sql: SELECT must return two columns aliased exactly as `employee_id` and `field_value`.',
    input_schema: {
      type: 'object' as const,
      properties: {
        field:           { type: 'string', description: 'Canonical field to map: e.g. "Job Family", "Job Sub Family", "Management Level", "Compensation Grade", "Department Name", "Location", "Country", "Region", "Division", "Sub-Division", "Worker Type", "FTE", "Annual Compensation", "Annual Rate", "Position Status", "Squad", "Days Open"' },
        source_column:   { type: 'string', description: 'Existing column name to map to this field (use this OR derived_sql, not both)' },
        derived_sql:     { type: 'string', description: "SQL returning two aliased columns: `employee_id` (the employee's ID) and `field_value` (the derived field value). E.g.: SELECT `Emp ID` AS employee_id, CASE WHEN `Dept` LIKE '%Eng%' THEN 'Engineering' ELSE 'Other' END AS field_value FROM data" },
        new_column_name: { type: 'string', description: 'Column name for the derived values written back to the data (required when using derived_sql)' },
        rationale:       { type: 'string', description: 'Why this mapping is appropriate' },
      },
      required: ['field', 'rationale'],
    },
  },
  {
    name: 'get_change_log',
    description: 'Returns recent change log entries (past org edits, scenario applications, comp updates) with before/after summaries. Default: last 5 entries. Useful before planning to understand recent history.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Max entries to return (default 5, max 20)' },
      },
    },
  },
  {
    name: 'get_comp_bands',
    description: 'Returns the current compensation matrix (grade × geo bands with min/max/currency). Call before plan_scenario when the scenario involves grade or geo changes, to check if new grades have defined bands. Note: comp-band checking requires grade and geography to be present on each employee row.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'plan_scenario',
    description: 'Validates and simulates a multi-step org restructuring plan WITHOUT applying it. Returns before/after impact metrics, per-action previews, affected nodes, and warnings. Store the plan_id — needed for apply_scenario. ALWAYS call find_employees first to resolve all mentioned names to exact node_id (employee ID) values before calling this tool.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: { type: 'string', description: 'Human-readable description of what this plan does' },
        target: { type: 'string', enum: ['as-is', 'to-be'], description: 'Which state to plan against. If to-be state does not exist yet, this will fail with an error.' },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type:          { type: 'string', enum: ['reparent', 'delete', 'create', 'update', 'toggle_open'] },
              node_id:       { type: 'string', description: 'Employee ID of the target node (from find_employees)' },
              new_parent_id: { type: 'string', description: 'reparent: employee ID of new manager' },
              parent_id:     { type: 'string', description: 'create: employee ID of parent node' },
              reassign_to:   { type: 'string', description: 'delete: employee ID to reassign orphaned direct children. Omit or null to automatically reassign to the deleted node\'s own parent.' },
              set_to:        { type: 'string', enum: ['open', 'filled'], description: 'toggle_open only' },
              fields:        { type: 'object', description: 'create/update: keys must be exact Excel column names (call get_schema if unsure)' },
              reason:        { type: 'string', description: 'Why this action is being taken' },
            },
            required: ['type'],
          },
        },
      },
      required: ['description', 'actions'],
    },
  },
  {
    name: 'apply_scenario',
    description: 'Applies a validated plan by plan_id. Only call after showing the user the plan_scenario results and receiving explicit approval. Requires Write Mode. If the org chart was modified after plan_scenario was called, this will fail and the plan must be regenerated.',
    input_schema: {
      type: 'object' as const,
      properties: {
        plan_id: { type: 'string', description: 'The plan_id returned by plan_scenario' },
      },
      required: ['plan_id'],
    },
  },
];

type AnyMessage = { role: string; content: unknown };

function sanitizeMessages(messages: AnyMessage[]): AnyMessage[] {
  const out: AnyMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const toolUseIds = (m.content as Array<{ type: string; id?: string }>)
        .filter(b => b.type === 'tool_use')
        .map(b => b.id!);
      if (toolUseIds.length > 0) {
        const next = messages[i + 1];
        const hasResults =
          next?.role === 'user' &&
          Array.isArray(next.content) &&
          toolUseIds.every(id =>
            (next.content as Array<{ type: string; tool_use_id?: string }>).some(
              b => b.type === 'tool_result' && b.tool_use_id === id
            )
          );
        if (!hasResults) break;
      }
    }
    out.push(m);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const { messages, systemContext, allowedTools } = await req.json();

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

  // Tool gating: restrict visible tools to the planner-approved allowlist
  const filteredTools = Array.isArray(allowedTools) && (allowedTools as string[]).length > 0
    ? TOOLS.filter(t => (allowedTools as string[]).includes(t.name))
    : TOOLS;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      }

      try {
        const anthropicStream = client.messages.stream({
          model: process.env.AI_MODEL ?? 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          system: [{ type: 'text' as const, text: systemContext as string, cache_control: { type: 'ephemeral' } }],
          messages: sanitizeMessages(messages as AnyMessage[]) as Anthropic.MessageParam[],
          tools: filteredTools,
        });

        // Track current tool_use block being assembled
        let currentToolId: string | null = null;
        let currentToolName: string | null = null;
        let currentToolInput = '';

        for await (const event of anthropicStream) {
          if (event.type === 'content_block_start') {
            if (event.content_block.type === 'tool_use') {
              currentToolId = event.content_block.id;
              currentToolName = event.content_block.name;
              currentToolInput = '';
            }
          }

          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              send({ type: 'text_delta', text: event.delta.text });
            }
            if (event.delta.type === 'input_json_delta') {
              currentToolInput += event.delta.partial_json;
            }
          }

          if (event.type === 'content_block_stop') {
            if (currentToolId && currentToolName) {
              let parsedInput: Record<string, unknown> = {};
              try { parsedInput = JSON.parse(currentToolInput || '{}'); } catch { /* ignore */ }
              send({ type: 'tool_use', id: currentToolId, name: currentToolName, input: parsedInput });
              currentToolId = null;
              currentToolName = null;
              currentToolInput = '';
            }
          }
        }

        const finalMsg = await anthropicStream.finalMessage();
        send({
          type: 'done',
          stop_reason: finalMsg.stop_reason,
          fullMessage: { role: finalMsg.role, content: finalMsg.content },
        });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
