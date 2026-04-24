# Org Dashboard — Next.js

A modular org-chart analytics dashboard. Upload an org chart image → n8n webhook analyzes it with OpenAI Vision → returns structured hierarchy JSON → dashboard renders summary metrics, interactive tree, and sortable employee table.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env and set your webhook URL
cp .env.example .env.local

# 3. Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout (fonts, metadata)
│   ├── page.tsx            # Main page — orchestrates modal, tabs, views, PDF export
│   └── page.module.css     # Page-level styles (header, tabs, footer, export mode)
│
├── components/
│   ├── upload/
│   │   ├── UploadModal.tsx          # Drag-drop image upload → webhook POST
│   │   └── UploadModal.module.css
│   │
│   └── dashboard/
│       ├── SummaryView.tsx          # Metric cards, split cards, width-per-level strip
│       ├── SummaryView.module.css
│       ├── HierarchyView.tsx        # Interactive org tree with collapse/expand
│       ├── HierarchyView.module.css
│       ├── TableView.tsx            # Sortable, searchable employee-manager table
│       └── TableView.module.css
│
├── lib/
│   ├── types.ts        # All TypeScript interfaces (raw webhook, normalized, metrics)
│   ├── constants.ts    # Webhook URL, analysis prompt
│   ├── metrics.ts      # Pure function: edges → computed metrics (span, depth, gini, etc.)
│   ├── normalize.ts    # Webhook response → DashboardData (vertex normalization, unwrapping)
│   ├── utils.ts        # Small helpers: initials(), formatBytes()
│   └── index.ts        # Barrel export
│
└── styles/
    └── globals.css     # CSS custom properties (design tokens), base resets, keyframes
```

## Architecture

```
┌─────────────┐     multipart/form-data     ┌──────────┐
│  Browser     │ ─────────────────────────▶  │  n8n     │
│  (Next.js)   │                             │ webhook  │
│              │  ◀───────────────────────── │          │
│              │   { resolved_edges,         │ OpenAI → │
│              │     vertex_lookup,          │ resolve  │
│              │     metrics }               │          │
└─────────────┘                              └──────────┘
      │
      ▼
  UploadModal
      │
      ▼ DashboardData
  ┌───┴───┐
  │ page  │ ← tab state, PDF export
  ├───────┤
  │Summary│  HierarchyView  │  TableView
  └───────┘
```

**Data flow:**
1. `UploadModal` sends image to n8n webhook as `FormData`
2. n8n runs OpenAI Vision, resolves hierarchy, computes metrics
3. Response is unwrapped by `unwrapResponse()` (handles n8n's various nesting patterns)
4. `parseWebhookResponse()` normalizes vertices and merges metrics
5. `DashboardData` is passed to each view component as a single prop

**No API keys in the frontend.** The OpenAI key lives in n8n as a credential.

## Webhook Response Shape

The dashboard accepts responses in these shapes:
- `{ resolved_edges, vertex_lookup }` (flat)
- `[{ resolved_edges, vertex_lookup }]` (array)
- `{ data: { ... } }` or `{ json: { ... } }` (n8n wrappers)

Pre-computed `metrics` are optional — if present, they're used; otherwise metrics are computed client-side.

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_WEBHOOK_URL` | n8n webhook endpoint for image upload |

## PDF Export

The "Download PDF" button uses `html2pdf.js` (dynamically imported). It temporarily shows all three views, generates an A3 landscape PDF with page breaks between sections, then restores the tab state.
