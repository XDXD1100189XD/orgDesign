import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'run_sql',
    description:
      'Execute a SQL query against the employee data table named `data`. Use SELECT for queries and INSERT/UPDATE/DELETE for mutations. Mutations require user confirmation before executing — call normally and the UI will prompt the user. Use for filters, aggregations, person lookups, group analysis, cost calculations, and data edits. If this returns { ok: false, error: "..." }, immediately fix and retry with a corrected query.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description:
            'A valid AlaSQL statement. Column names with spaces must be backtick-quoted. Table name is always `data`.',
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
      'Returns the exact list of column names available in the data table. Call this if you are unsure about column names before writing SQL.',
    input_schema: {
      type: 'object' as const,
      properties: {},
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
      'Maps an unmapped canonical org field (e.g. "Job Family") to an existing column OR derives it via SQL and writes it as a new column. Rebuilds the org hierarchy with the new mapping. ONLY in Write Mode. Call get_column_values first to understand available data. For derived_sql: SELECT must return two columns aliased exactly as `employee_id` and `value`.',
    input_schema: {
      type: 'object' as const,
      properties: {
        field:           { type: 'string', description: 'Canonical field to map: e.g. "Job Family", "Job Sub Family", "Management Level", "Compensation Grade", "Department Name", "Location", "Country", "Region", "Division", "Sub-Division", "Worker Type", "FTE", "Annual Compensation", "Annual Rate", "Position Status", "Squad", "Days Open"' },
        source_column:   { type: 'string', description: 'Existing column name to map to this field (use this OR derived_sql, not both)' },
        derived_sql:     { type: 'string', description: "SQL returning two aliased columns: `employee_id` (the employee's ID) and `value` (the derived field value). E.g.: SELECT `Emp ID` AS employee_id, CASE WHEN `Dept` LIKE '%Eng%' THEN 'Engineering' ELSE 'Other' END AS value FROM data" },
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
              reassign_to:   { type: 'string', description: 'delete: employee ID to reassign orphaned direct children (null = leave as roots)' },
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
  const { messages, systemContext } = await req.json();

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
  }

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
          tools: TOOLS,
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
