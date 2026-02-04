# OfferteHulp - Project Documentation for AI Agents

## Project Overview

**OfferteHulp** is a web application for Dutch carpenters and construction professionals to create detailed quotes (offertes) for timber and construction work. The application supports various job types including walls, ceilings, floors, doors, windows, roofing, and exterior work.

**Primary Language:** Dutch (UI, comments, and documentation)  
**Target Market:** Netherlands construction/carpentry sector

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14.2.35 (App Router) |
| Language | TypeScript 5.4.5 |
| Styling | Tailwind CSS 3.4.14 + shadcn/ui |
| Authentication | Firebase Authentication |
| Primary Database | Firebase Firestore |
| Secondary Database | Supabase (material list management) |
| PDF Generation | jspdf + html2canvas |
| Charts | recharts |
| Animation | framer-motion |
| Icons | lucide-react |
| UI Components | Radix UI primitives via shadcn/ui |

---

## Project Structure

```
studio/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes (materials, quotes, etc.)
│   │   ├── dashboard/          # Main dashboard page
│   │   ├── offertes/           # Quotes feature (nested routing)
│   │   ├── klanten/            # Client directory
│   │   ├── materialen/         # Material management
│   │   ├── instellingen/       # Settings
│   │   ├── login/              # Authentication
│   │   ├── layout.tsx          # Root layout with providers
│   │   ├── page.tsx            # Landing page (redirects to login/dashboard)
│   │   └── globals.css         # Tailwind + CSS variables
│   ├── components/
│   │   ├── ui/                 # shadcn/ui base components (40+ components)
│   │   ├── quote/              # Quote-specific components
│   │   ├── visualizers/        # SVG construction visualizers
│   │   ├── [job-type]/         # Job-specific sections (balken, dagkant, etc.)
│   │   └── ...                 # Various shared components
│   ├── config/jobTypes/        # Job type configurations
│   ├── context/                # React contexts (measurements, etc.)
│   ├── firebase/               # Firebase config, hooks, providers
│   ├── hooks/                  # Custom React hooks (use-toast, use-mobile, etc.)
│   ├── lib/
│   │   ├── types.ts            # Core TypeScript types
│   │   ├── job-registry.ts     # Job type definitions & material sections
│   │   ├── quote-calculations.ts # Quote calculation logic
│   │   ├── utils.ts            # Utility functions (cn, price parsing)
│   │   ├── supabase.ts         # Supabase client
│   │   └── ...                 # Various utilities
│   └── scripts/                # Python helper scripts
├── docs/                       # Documentation (backend.json, blueprint.md)
├── staging_sql/                # SQL migration files
├── sync.py                     # Main material sync script (Supabase)
├── firestore.rules             # Firebase security rules
├── firebase.json               # Firebase configuration
├── apphosting.yaml             # Firebase App Hosting config
├── components.json             # shadcn/ui configuration
├── tailwind.config.ts          # Tailwind configuration
└── next.config.js              # Next.js configuration
```

---

## Build and Development Commands

```bash
# Development server (runs on port 9003, all interfaces)
npm run dev

# Production build
npm run build

# Type checking (no emit)
npm run typecheck

# Linting
npm run lint

# Start production server
npm start

# Sync materials to Supabase
npm run sync
# OR directly:
python3 sync.py
```

**Note:** Node.js >= 20.0.0 is required.

---

## Architecture Details

### Database Architecture

The application uses a dual-database approach:

1. **Firebase Firestore** - Primary application data:
   - `quotes` - Quote/offerte documents with nested `jobs` subcollections
   - `clients` - Client directory (collection name: `clients`, NOT `klanten`)
   - `users` - User settings and business info
   - `materials` - User-specific material prices
   - `presets` - Job type presets per user
   - `counters` - Quote number sequencing
   - `notes` - Personal notes per user
   - `quote_notes` - Quote-specific notes (subcollection)

2. **Supabase** - Material list management:
   - `main_material_list` - Master material catalog
   - Synced via Python scripts and API routes

### Key Domain Concepts

| Dutch Term | English | Description |
|------------|---------|-------------|
| Offerte | Quote/Offer | A complete price offer for a client |
| Klus | Job | Individual work item within a quote |
| Wand | Wall | Wall construction jobs |
| Plafond | Ceiling | Ceiling construction jobs |
| Kozijn | Window frame | Window/door frames |
| Dagkant | Window reveal | Interior trim around windows |
| Leidingkoof | Pipe boxing | Enclosure for pipes/ducts |
| Vensterbank | Window sill | Interior window sill |

### Authentication Flow

- Uses Firebase Authentication
- Token-based API authentication (`Bearer <token>`)
- Protected routes check `request.auth.uid` in Firestore rules
- Client-side auth state via `FirebaseClientProvider`

---

## Code Style Guidelines

### TypeScript Conventions

- Strict mode enabled in `tsconfig.json`
- Path alias: `@/*` maps to `./src/*`
- Types defined in `src/lib/types.ts`
- Use explicit return types for exported functions
- Prefer `interface` over `type` for object shapes

### Naming Conventions

- **Files:** kebab-case for utilities, PascalCase for components
- **Components:** PascalCase (e.g., `QuoteSettings.tsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useQuoteData.ts`)
- **Types/Interfaces:** PascalCase (e.g., `Quote`, `Job`)
- **CSS Classes:** Tailwind utility classes, use `cn()` helper for conditionals

### Styling Patterns

```typescript
// Use the cn() utility for conditional classes
import { cn } from '@/lib/utils';

className={cn(
  'base-classes',
  condition && 'conditional-class',
  variant === 'primary' && 'primary-styles'
)}
```

### Component Structure

```typescript
'use client'; // For client components

import { useState } from 'react';
import { Button } from '@/components/ui/button';
// Group imports: React, then components, then utils

interface MyComponentProps {
  // Explicit prop types
}

export function MyComponent({ prop }: MyComponentProps) {
  // Component logic
  return <div>{/* JSX */}</div>;
}
```

---

## Key Files Reference

### Configuration Files

| File | Purpose |
|------|---------|
| `src/lib/types.ts` | Core TypeScript types (Quote, Job, Client, etc.) |
| `src/lib/job-registry.ts` | Job type definitions, material sections, measurements |
| `src/firebase/config.ts` | Firebase client configuration |
| `src/lib/supabase.ts` | Supabase client configuration |
| `firestore.rules` | Firestore security rules |
| `tailwind.config.ts` | Tailwind theme configuration |
| `components.json` | shadcn/ui configuration |

### Important Utility Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `cn()` | `src/lib/utils.ts` | Merge Tailwind classes |
| `parsePriceToNumber()` | `src/lib/utils.ts` | Parse price strings to numbers |
| `removeEmptyFields()` | `src/lib/utils.ts` | Clean empty object fields |

---

## API Routes

All API routes are in `src/app/api/`:

| Route | Purpose |
|-------|---------|
| `/api/materialen/upsert` | Create/update material in Supabase |
| `/api/materialen/delete` | Delete material from Supabase |
| `/api/materialen/get` | Fetch materials from Supabase |
| `/api/materialen/update-price` | Update material prices |
| `/api/materialen/calculate` | Calculate material totals |
| `/api/materialen/custom` | Custom material operations |
| `/api/offerte/generate` | Generate PDF quote |
| `/api/generate-email` | Generate email content |
| `/api/env-check` | Environment validation |

---

## Testing

**Current State:** Limited test coverage. No test runner is currently configured.

**Test Files Present:**
- `test_framing.ts` - Framing calculation tests
- `test_overlap.ts` - Overlap detection tests
- `test_correction.ts` - Correction logic tests
- `test_correction.js` - JS version of correction tests
- `test_overlap.js` - JS version of overlap tests

These appear to be manual test scripts, not automated test suites.

---

## Environment Variables

Required in `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Firebase (public config in src/firebase/config.ts)
# No additional env vars needed for Firebase client

# n8n Webhooks (for material sync)
N8N_MATERIALEN_DELETE_URL=
N8N_MATERIALEN_UPSERT_URL=
N8N_WEBHOOK_URL=
N8N_HEADER_SECRET=
```

---

## Security Considerations

1. **Firestore Rules:** Implemented in `firestore.rules` - uses user-based ownership checks
2. **API Authentication:** All API routes verify Firebase ID tokens
3. **Row-Level Security:** Supabase tables use RLS policies
4. **Client-Side Validation:** Never trust client input; validate in API routes

### Firestore Security Model

```javascript
// Example rule pattern from firestore.rules
function isOwner(userId) {
  return isSignedIn() && request.auth.uid == userId;
}

match /quotes/{quoteId} {
  allow read, get: if isSignedIn() && resource.data.userId == request.auth.uid;
  allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
  // ... etc
}
```

---

## Deployment

The application is configured for Firebase App Hosting:

- **Config:** `apphosting.yaml`
- **Firebase Config:** `firebase.json`
- **Max Instances:** 1 (configured in apphosting.yaml)
- **Secrets:** Managed via Firebase secret manager

Build command: `npm run build`  
Output directory: `.next/`

---

## Common Tasks

### Adding a New Job Type

1. Define measurements in `src/lib/job-registry.ts`
2. Add material sections to the registry
3. Create component in `src/components/[job-type]/`
4. Add route handler in `src/app/offertes/[id]/klus/nieuw/`
5. Update `JOB_REGISTRY` export

### Adding a New Material Category

1. Update `MATERIAL_CATEGORY_INFO` in `src/lib/job-registry.ts`
2. Add material sections to relevant job type configs
3. Run `npm run sync` to sync with Supabase

### Modifying Quote Calculations

1. Update logic in `src/lib/quote-calculations.ts`
2. Update relevant UI components in `src/components/quote/`
3. Test with existing quotes for backward compatibility

---

## Known Issues & Technical Debt

See `tech_debt.md` for current issues:
- UI placeholder for loading presets needs implementation (as of 2026-01-30)

---

## External Integrations

| Service | Purpose |
|---------|---------|
| Firebase Auth | User authentication |
| Firestore | Primary database |
| Supabase | Material list management |
| n8n | Workflow automation for material sync |

---

## Development Notes

1. **Language:** All business logic comments and UI text are in Dutch
2. **Currency:** Euro (€) - handled in price parsing
3. **Measurements:** Millimeters (mm) throughout the application
4. **Date Format:** Dutch locale
5. **Mobile-First:** Bottom navigation on mobile (`BottomNav` component)

---

*Last Updated: 2026-02-04*
