import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { resolveToWebhookResponse } from "@/lib/parseImageOrg";
import type { CanonicalRecord } from "@/lib/parseImageOrg";

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-opus-4-7";

const ENTITY_PROMPT = (text: string) => `You are extracting organizational positions from text describing an org chart or org structure.

The input is free-form text. It may be prose, a list, CSV, markdown, or a mix.

For each distinct position mentioned, produce one record.

PARSING RULES:
- name: full person name if stated, else null
- employee_id: any ID code (e.g. "EDAA1234", "EMP001"), else null
- role: job title or role name (required; if unclear, use the best available label)
- team: team or sub-group name if mentioned, else null
- grade: grade code like "G5" or "C4" if mentioned, else null
- is_vacant: true only if the position is explicitly described as open, vacant, TBD, or unfilled
- department: department name if distinct from team, else null
- job_id: job posting or requisition ID if mentioned, else null
- location: location if mentioned, else null
- Set any underivable field to null. DO NOT INVENT values.
- confidence: "high" = role + (name or employee_id) present; "medium" = role only or suspicious values; "low" = ambiguous

OUTPUT: A JSON array. One record per position. Start with [ and end with ]. No prose, no markdown fences.

Record schema:
{ "name", "employee_id", "role", "team", "grade", "is_vacant", "department", "job_id", "location", "confidence" }

INPUT TEXT:
${text}`;

const RELATIONSHIP_PROMPT = (text: string) => `You are extracting reporting relationships from text describing an org chart or org structure.

For each manager→direct-report relationship described, output one line:
<manager_identifier> -> <employee_identifier> | SOLID

IDENTIFIER PRIORITY: 1) full person name if visible, 2) employee/job ID, 3) role/title as last resort.
Use the identifier exactly as it appears in the text.

RULES:
- Direct reports only — skip skip-level unless the text explicitly states a skip-level relationship
- One relationship per output line
- Use SOLID for all relationships (text has no visual line styles)
- No prose, no numbering, no JSON, no markdown

Example output:
Wayne Filin-Matthews -> Akshay Sahni | SOLID
Akshay Sahni -> Jagdeep Singh | SOLID

INPUT TEXT:
${text}`;

async function callClaudeText(prompt: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  let text: string;
  try {
    const body = await req.json();
    text = body.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      throw new Error("Missing or empty text");
    }
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Step 1: parallel calls — entity extraction + relationship extraction
  const [entityJson, relationshipText] = await Promise.all([
    callClaudeText(ENTITY_PROMPT(text.trim())),
    callClaudeText(RELATIONSHIP_PROMPT(text.trim())),
  ]);

  // Step 2: parse entity JSON (strip possible markdown fences)
  let canonicalRecords: CanonicalRecord[];
  try {
    const cleaned = entityJson
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    const rawRecords: Omit<CanonicalRecord, "shape_number" | "is_position">[] = JSON.parse(cleaned);
    canonicalRecords = rawRecords.map((r, i) => ({
      ...r,
      shape_number: i + 1,
      is_position: true,
    }));
  } catch {
    return Response.json(
      { error: "Entity extractor returned invalid JSON", raw: entityJson.slice(0, 500) },
      { status: 500 },
    );
  }

  if (canonicalRecords.length === 0) {
    return Response.json({ error: "No positions detected in text" }, { status: 422 });
  }

  // Step 3: resolve identifiers → WebhookResponse
  const { vertex_lookup, resolved_edges, warnings } = resolveToWebhookResponse(
    canonicalRecords,
    relationshipText,
  );

  return Response.json({ resolved_edges, vertex_lookup, warnings });
}
