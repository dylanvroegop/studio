# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev          # Start dev server on port 9003
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check (tsc --noEmit)
npm run sync         # Sync script (python3 sync.py)
```

## Project Overview

**HoutOfferte** is a quote management system for carpenters (timmerlieden). Users create quotes (offertes) containing jobs (klussen), each with measurements (maatwerk) and material selections.

### Tech Stack
- **Next.js 14** with App Router
- **Firebase/Firestore** for authentication and data storage
- **Supabase** for supplementary data (klus_regels)
- **n8n** for external calculation workflows
- **Radix UI** + Tailwind CSS for components

## Architecture

### Data Flow
1. User creates a quote → stored in Firestore `quotes` collection
2. Jobs (klussen) are added to the quote with dimensions
3. Materials are selected for each job from the material database
4. Quote is submitted to n8n webhook for PDF generation/calculations

### Key Directories

- `src/app/offertes/` - Quote pages and wizard flow
  - `[id]/klus/[klusId]/[category]/[slug]/` - Job configuration pages
  - `[id]/klus/nieuw/` - New job creation wizard
- `src/lib/` - Core business logic
  - `job-registry.ts` - Central registry defining all job types, their material slots, and calculation rules (~130KB, very large)
  - `types.ts` - TypeScript interfaces for Quote, Job, Material, etc.
  - `quote-calculations.ts` - Price calculation logic
  - `generate-quote-pdf.ts` - PDF generation
- `src/components/visualizers/` - SVG drawings for different job types (walls, roofs, ceilings, etc.)
- `src/firebase/` - Firebase configuration and hooks

### Domain Model (Dutch terminology)

| Dutch | English | Description |
|-------|---------|-------------|
| Offerte | Quote | The main document sent to clients |
| Klus | Job | A single work item within a quote |
| Maatwerk | Custom work | Dimensions and specifications for a job |
| Materialen | Materials | Products selected for a job |
| Klant | Client | Customer information |
| Klein materiaal | Small materials | Screws, nails, etc. (calculated as % or fixed) |

### Job Registry Structure

The `job-registry.ts` file defines all supported job types with:
- `materialSlots`: Required material categories for each job type
- `calculation`: How to calculate material quantities
- `visualizer`: Which drawing component to use

### Firestore Structure

```
quotes/{quoteId}
  ├── klantinformatie (client data)
  ├── instellingen (BTW, hourly rate, margins)
  └── klussen: Record<jobId, Job>
        ├── maatwerk (dimensions, openings)
        └── materialen (selected materials)
```

## MCP Integration

The project uses MCP servers for:
- `@supabase` - Query klus_regels and material data
- `@firebase-mcp-server` - Read Firestore quotes/jobs
- `@n8n` - Inspect calculation workflows

## Important Patterns

- Material selections are snapshots (price captured at selection time)
- Jobs have a `uiState` field that should be stripped before sending to n8n
- The `maatwerk.basis[]` array contains the main segments/measurements
- Components (kozijnen, deuren, boeiboorden) are nested within jobs
