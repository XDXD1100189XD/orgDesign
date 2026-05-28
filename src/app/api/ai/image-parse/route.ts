import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { parseEntityRawToShapes, resolveToWebhookResponse } from "@/lib/parseImageOrg";
import type { CanonicalRecord } from "@/lib/parseImageOrg";

export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-opus-4-7";

const ENTITY_PROMPT = `You are extracting text from shapes in an image.
DO NOT INTERPRET. Do not describe relationships, hierarchy, or meaning. Only transcribe text inside shapes.

INSTRUCTIONS:
1. Identify every shape in the image: rectangle, rounded rectangle, square, oval, circle, hexagon, diamond.
2. For each shape, output one line in this format: <line1> | <line2> | <line3> | ...
   Where each <line> is a distinct line of text inside the shape, in top-to-bottom reading order, separated by " | " (space-pipe-space).
3. If a shape has no person name (only a role/title, or text like "OPEN", "TBD", "Vacant"), prefix the line with "VACANT:".
4. Order the shapes top-to-bottom, then left-to-right (reading order).
5. Ignore: chart titles, page headers/footers, legend boxes, watermarks, dates, anything outside organizational shapes.

OUTPUT RULES:
- One shape per line
- End each line with a semicolon (;)
- No numbering, no prefixes other than "VACANT:" where applicable
- No prose, no explanation, no markdown, no JSON

Example output:
Technology Lead | Wayne Filin-Matthews;
Product Engineering & Delivery Lead | Akshay Sahni;
VACANT: Data Engineer (G3) | EDAA0772;`;

const RELATIONSHIP_PROMPT = `You are identifying line connections between shapes in an organizational chart image.
DO NOT INTERPRET hierarchy or meaning. Do not use words like "manager", "reports to", "supervisor", "subordinate", "parent", "child". Only describe lines and which shapes they touch.

HOW TO IDENTIFY A SHAPE:
Each shape contains text. Pick the shape's identifier from the text inside it using this priority order:
1. PERSON NAME if visible (first choice). Example: "Wayne Filin-Matthews", "Sunil Dixit"
2. ANY ID if no name is visible (employee ID, job ID, etc.). Example: "EDAA1153", "EDAA0772"
3. ROLE/TITLE only as a last resort, when the shape has neither a name nor an ID.

Use the identifier exactly as it appears in the shape — no abbreviations, no rewording, no added text.

INSTRUCTIONS:
For every line in the image that connects two shapes, output one entry in this format:
<top_shape_identifier> -> <bottom_shape_identifier> | <SOLID|DASHED>

Where:
- top_shape_identifier is the identifier of the shape positioned higher in the image
- bottom_shape_identifier is the identifier of the shape positioned lower in the image
- SOLID for a continuous solid line; DASHED for any dotted, dashed, or non-solid line; UNCLEAR if you cannot tell

RULES:
- Pick each shape's identifier using the priority order above (name > ID > role)
- One connection per output line
- For branching connections (one shape connecting down to multiple shapes), output one entry per pair
- If a line connects to a non-organizational shape (chart title, legend, watermark), skip it
- Do not invent connections that aren't visually present

OUTPUT RULES:
- One connection per line
- No numbering, no prose, no explanation, no markdown, no JSON

Example output:
Wayne Filin-Matthews -> Akshay Sahni | SOLID
Akshay Sahni -> Jagdeep Singh | SOLID
Jagdeep Singh -> Sunil Dixit | DASHED`;

function buildCanonicalPrompt(shapes: ReturnType<typeof parseEntityRawToShapes>): string {
  return `You convert structured shape transcriptions from an organizational chart into canonical position records.

For each shape, decide:
(A) Is this an organizational position? Real positions describe a job role, sometimes with a person name, employee ID, grade, or team.
(B) Non-positions to filter out: chart legends, titles, headers, dates, watermarks, footer text, instructional notes.
(C) For real positions, parse fields into the canonical structure shown in the examples.

PARSING RULES:
- Fields are pre-split for you in the "fields" array
- Identify which field is which by content pattern, not position:
  * Employee ID: matches "EDAA" followed by 4 digits (e.g., EDAA1138)
  * Grade: short parenthesized code at end of role string, like "(G5)", "(G4)", "(C4)", "(G3)" — extract the inner code without parentheses
  * Role + team: typically "<role> - <team>" — split on " - " (space-dash-space). Role is before; team is after.
  * Person name: a human name (not a role, not an ID)
  * If a person name appears alongside other fields, the role string usually does NOT contain the name
- "is_vacant_marker" being true means the shape was tagged VACANT — set is_vacant=true, name=null
- Set any field you cannot derive to null. DO NOT INVENT values.

CONFIDENCE ASSIGNMENT:
- "high": all visible fields cleanly parsed, role and either name or employee_id present
- "medium": role parsed but name/ID looks suspicious, or grade ambiguous
- "low": multiple fields had to be guessed, or role string is malformed

OUTPUT FORMAT:
A JSON array of one record per shape, in shape_number order. Output ONLY the JSON. No prose, no markdown fences, no preamble. Begin response with [ and end with ].

Record schema (position): { "shape_number", "is_position": true, "is_vacant", "name", "employee_id", "role", "team", "grade", "department", "job_id", "location", "raw_text", "confidence" }
Record schema (non-position): { "shape_number", "is_position": false, "filter_reason", "raw_text" }

EXAMPLES:

Input shape: { "shape_number": 6, "is_vacant_marker": false, "fields": ["Sr. Engineer - Menu Data (Item Vista) (G5)", "Sunil Dixit"] }
Output: { "shape_number": 6, "is_position": true, "is_vacant": false, "name": "Sunil Dixit", "employee_id": null, "role": "Sr. Engineer", "team": "Menu Data (Item Vista)", "grade": "G5", "department": null, "job_id": null, "location": null, "raw_text": "Sr. Engineer - Menu Data (Item Vista) (G5) | Sunil Dixit", "confidence": "high" }

Input shape: { "shape_number": 16, "is_vacant_marker": true, "fields": ["Data Engineer - Menu Data (Item Vista) (G3)", "EDAA0772"] }
Output: { "shape_number": 16, "is_position": true, "is_vacant": true, "name": null, "employee_id": "EDAA0772", "role": "Data Engineer", "team": "Menu Data (Item Vista)", "grade": "G3", "department": null, "job_id": null, "location": null, "raw_text": "VACANT: Data Engineer - Menu Data (Item Vista) (G3) | EDAA0772", "confidence": "high" }

Input shape: { "shape_number": 22, "is_vacant_marker": false, "fields": ["Effective August 1, 2025", "DRAFT - Subject to Change"] }
Output: { "shape_number": 22, "is_position": false, "filter_reason": "chart metadata: effective date and draft watermark, not a position", "raw_text": "Effective August 1, 2025 | DRAFT - Subject to Change" }

INPUT TO PROCESS:
${JSON.stringify(shapes)}`;
}

async function callClaudeWithImage(
  prompt: string,
  imageBase64: string,
  mimeType: string,
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
              data: imageBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

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

  let imageBase64: string;
  let mimeType: string;
  try {
    const body = await req.json();
    imageBase64 = body.imageBase64;
    mimeType = body.mimeType;
    if (!imageBase64 || !mimeType) throw new Error("Missing imageBase64 or mimeType");
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Step 1: entity + relationship extraction in parallel (both need the image)
  const [entityText, relationshipText] = await Promise.all([
    callClaudeWithImage(ENTITY_PROMPT, imageBase64, mimeType),
    callClaudeWithImage(RELATIONSHIP_PROMPT, imageBase64, mimeType),
  ]);

  // Step 2: parse entity text into structured shapes for the canonical parser
  const shapes = parseEntityRawToShapes(entityText);
  if (shapes.length === 0) {
    return Response.json({ error: "No shapes detected in image" }, { status: 422 });
  }

  // Step 3: canonical parser converts raw fields into structured records (text-only call)
  const canonicalJson = await callClaudeText(buildCanonicalPrompt(shapes));

  let canonicalRecords: CanonicalRecord[];
  try {
    const cleaned = canonicalJson
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    canonicalRecords = JSON.parse(cleaned);
  } catch {
    return Response.json(
      { error: "Canonical parser returned invalid JSON", raw: canonicalJson.slice(0, 500) },
      { status: 500 },
    );
  }

  // Step 4: resolve identifiers across both outputs → WebhookResponse
  const { vertex_lookup, resolved_edges, warnings } = resolveToWebhookResponse(
    canonicalRecords,
    relationshipText,
  );

  return Response.json({ resolved_edges, vertex_lookup, warnings });
}
