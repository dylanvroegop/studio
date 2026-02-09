# Firestore Data Data Structure: `quotes` Collection

This document defines the optimized data structure for the `quotes` collection in Firestore. This structure is designed to be:
1.  **Business-Aligned**: Captures all data points from `business_plan.md`.
2.  **N8N-Ready**: Clean, structured, and free of UI-specific clutter for webhook processing.
3.  **Scalable**: Supports nested jobs, detailed formatting, and precise calculations.

## Root Document: `quotes/{quoteId}`

The root document contains the high-level contexts, global settings, and the map of jobs.

```typescript
interface QuoteDocument {
  // --- IDENTIFICATION ---
  id: string;                // Firestore Doc ID
  offerteNummer: number;     // Human-readable generic sequence (e.g. 260001)
  userId: string;            // Link to the carpenter/user
  
  // --- STATE ---
  status: 'concept' | 'in_behandeling' | 'verzonden' | 'geaccepteerd' | 'afgewezen';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // --- CLIENT INFORMATION (From Business Plan) ---
  klantinformatie: {
    klanttype: 'Particulier' | 'Zakelijk';
    bedrijfsnaam?: string;
    voornaam: string;
    achternaam: string;
    email: string;
    telefoonnummer: string;
    
    // Addresses
    factuuradres: Address;
    projectadres: Address; // Can be same as invoice, but explicit structure is better for N8N
    afwijkendProjectadres: boolean;
  };

  // --- PROJECT META ---
  titel: string;             // e.g. "Aanbouw Heerhugowaard"
  werkomschrijving: string;  // General description visible on quote

  // --- CALCULATION SETTINGS (Global Defaults) ---
  // Captures "Financial Armor" requirements
  instellingen: {
    btwTarief: number;          // e.g. 21
    winstmargeMaterialen: number; // e.g. 15 (percent)
    winstmargeArbeid: number;     // e.g. 0 (percent)
    uurTarief: number;            // e.g. 55.00
    voorrijkosten: number;        // e.g. 45.00
    afvalPercentage: number;      // e.g. 10 (default waste)
  };

  // --- JOBS (De Klussen) ---
  // Mapped by UUID for UI performance, N8N receives this as an Object/Map
  klussen: Record<string, JobDefinition>;
}

interface Address {
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
}
```

## Job Definition: `klussen/{jobId}`

Each "klus" (job) is a self-contained unit of work with its own dimensions, material choices, and calculation rules.

```typescript
interface JobDefinition {
  // --- META ---
  id: string;               // UUID
  volgorde: number;         // For PDF sorting
  
  // --- TYPE DEFINITION ---
  categorie: string;        // e.g. "wanden"
  type: string;             // e.g. "voorzetwand" (The specific calculator to use)
  slug: string;             // Exact registry slug for lookup
  titel: string;            // User-defined title e.g. "Wand kinderkamer"
  omschrijving: string;     // Specific textual description for this job

  // --- MEASUREMENTS (The Input for Calculation) ---
  // Array of measurement objects. 
  // N8N iterates this to calculate required beams/plates per segment.
  maatwerk: Array<{
    label: string;          // e.g. "Wand 1"
    shape: 'rectangle' | 'slope' | 'gable' | 'l-shape' | 'u-shape';
    
    // Standard Dimensions (mm)
    lengte: number;
    hoogte: number;
    diepte?: number;
    
    // Complex Dimensions (for non-rectangles)
    lengte1?: number;
    lengte2?: number;
    hoogteLinks?: number;
    hoogteRechts?: number;
    hoogteNok?: number;

    // Structural Settings
    balkafstand: number;    // e.g. 600 (H.O.H.)
    latafstand?: number;    // e.g. 300
    
    // Openings (Windows/Doors) to subtract
    openings: Array<{
      type: 'window' | 'door';
      width: number;
      height: number;
      x: number;            // Position relative to start
      y: number;            // Position relative to floor
    }>;

    // Boeidelen (AI-agent-proof, optional)
    boeiboord_panelen?: Array<{
      id: string;
      zijde: 'voorzijde' | 'onderzijde';
      lengte: number;
      hoogte?: number;
      breedte?: number;
      label: string;
    }>;
    boeiboord_aantallen?: {
      voorzijde: number;    // meestal 1 of 2 (spiegeling)
      onderzijde: number;
    };
    'naad dikte tussen 2 platen kopkant'?: number; // mm
    latten_samenvatting?: {
      per_zijde: Array<{
        zijde: 'voorzijde' | 'onderzijde';
        items: Array<{ lengte_mm: number; aantal: number }>;
        label?: string; // bijv. "Latten; 10x 5m"
      }>;
      totaal: {
        items: Array<{ lengte_mm: number; aantal: number }>;
        label?: string;
      };
    };
    voorzijde_latafstand?: number; // mm
  }>;

  // --- MATERIAL SELECTIONS ---
  // Which specific product UUIDs correspond to generic roles?
  materialen: {
    // "Slots" map specific generic roles to Database Products
    // Key = Section Key (e.g. "constructiehout"), Value = Selected Product Snapshot
    selections: Record<string, {
      id: string;             // DB ID
      naam: string;           // Snapshot name (to avoid db lookup if deleted)
      prijs: number;          // Snapshot price (critical for quote validity validity duration)
      eenheid: string;
      leverancier?: string;
    }>;
    
    // Custom/Manual materials added by user for this job
    custommateriaal: Record<string, {
      id: string;
      title: string;
      materials: Array<{
        naam: string;
        aantal: number;
        eenheid: string;
        prijs: number; 
      }>
    }>;
  };

  // --- COMPONENTS (Sub-assemblies) ---
  // e.g. Kozijnen, Deuren, Boeiboorden embedded in this job
  components: Array<{
    id: string;
    type: 'kozijn' | 'deur' | 'boeiboord';
    label: string;          // "Kozijn 1"
    width: number;
    height: number;
    amount: number;
    // Specific material choices for this component
    materials: Array<{
      sectionKey: string;
      material: MaterialSnapshot; // Same structure as above
    }>;
  }>;

  // --- KLEIN MATERIAAL CONFIG ---
  // Defined in Business Plan ("Financial Armor")
  kleinMateriaal: {
    mode: 'percentage' | 'fixed' | 'inschatting'; 
    percentage?: number;    // e.g. 5%
    fixedAmount?: number;   // e.g. €50
  };

  // --- UI STATE (EXCLUDED FROM N8N PROCESSING) ---
  // This field should be IGNORED or STRIPPED by the webhook handler
  uiState?: {
    collapsedSections: Record<string, boolean>;
    hiddenCategories: Record<string, boolean>;
  };
}
```

## Optimization Strategy for N8N Webhook

When sending this data to N8N, the API Route (`/api/offerte/generate`) acts as a **Sanitizer**. It should:

1.  **Strip UI State**: Remove `uiState` objects to reduce payload size.
2.  **Flatten Jobs**: Convert the `klussen` Map (Object) into an `Array` of jobs, sorted by `volgorde`. Arrays are easier for N8N to loop over.
3.  **Validate**: Ensure `maatwerk` items have valid numbers (no `null` or `NaN`) before sending.
4.  **Inject Global Context**: Ensure `instellingen` (tax, margins) are present so N8N doesn't have to guess or fetch defaults.

### Example Clean N8N Payload
```json
{
  "quoteId": "xyz",
  "client": { "voornaam": "Jan", ... },
  "settings": { "btw": 21, "marge": 15 ... },
  "jobs": [
    {
       "type": "voorzetwand",
       "dimensions": [ { "l": 4000, "h": 2600, "c": 600 } ],
       "materials": {
          "insulation": { "id": "iso-123", "price": 14.50 },
          "studs": { "id": "wood-55", "price": 4.20 }
       }
    }
  ]
}
```
