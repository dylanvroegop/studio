/**
 * Job Registry Mapping Parser
 * 
 * Dit script parsed je job-registry.ts en genereert een volledige mapping-tabel
 * voor je AI-agent.
 * 
 * GEBRUIK:
 * 1. Plaats dit bestand in dezelfde map als job-registry.ts
 * 2. Run: npx ts-node parse-job-registry.ts
 * 3. Output: ai-agent-mapping.json en ai-agent-mapping.csv
 */

import { JOB_REGISTRY } from './job-registry';

interface MappingRow {
  hoofdtitel: string;
  slug: string;
  hoofdcategorie: string;
  subcategorie_label: string;
  categoryFilter_subsectie: string;
  category_key: string;
}

function generateMapping(): MappingRow[] {
  const rows: MappingRow[] = [];

  // Loop door alle categorieën in de registry
  for (const [categoryKey, categoryConfig] of Object.entries(JOB_REGISTRY)) {
    
    // Loop door alle items (jobs) in deze categorie
    for (const item of categoryConfig.items) {
      const { title, slug, materialSections, categoryConfig: itemCategoryConfig } = item;

      // Skip als er geen materialSections zijn
      if (!materialSections || materialSections.length === 0) continue;

      // Loop door alle materialSections
      for (const section of materialSections) {
        const { label, categoryFilter, category } = section;

        // Skip als essentiële velden ontbreken
        if (!categoryFilter || !category) continue;

        // Bepaal de hoofdcategorie titel
        let hoofdcategorie: string = category; // fallback naar category key

        // Probeer de titel te vinden in de itemCategoryConfig
        if (itemCategoryConfig) {
          const configEntry = (itemCategoryConfig as Record<string, { title: string; order: number }>)[category];
          if (configEntry) {
            hoofdcategorie = configEntry.title;
          }
        }

        rows.push({
          hoofdtitel: title,
          slug: slug,
          hoofdcategorie: hoofdcategorie,
          subcategorie_label: label,
          categoryFilter_subsectie: categoryFilter,
          category_key: category,
        });
      }
    }
  }

  return rows;
}

function exportToCSV(rows: MappingRow[]): string {
  const headers = [
    'Hoofdtitel (Job)',
    'Slug',
    'Hoofdcategorie',
    'Sub-categorie (Label)',
    'categoryFilter (subsectie)',
    'category (key)'
  ];

  const csvRows = [headers.join(';')];

  for (const row of rows) {
    csvRows.push([
      `"${row.hoofdtitel}"`,
      `"${row.slug}"`,
      `"${row.hoofdcategorie}"`,
      `"${row.subcategorie_label}"`,
      `"${row.categoryFilter_subsectie}"`,
      `"${row.category_key}"`,
    ].join(';'));
  }

  return csvRows.join('\n');
}

function exportToJSON(rows: MappingRow[]): string {
  return JSON.stringify(rows, null, 2);
}

// Genereer ook een lookup-object voor snelle AI-queries
function generateLookup(rows: MappingRow[]): Record<string, Record<string, string[]>> {
  const lookup: Record<string, Record<string, string[]>> = {};

  for (const row of rows) {
    const key = row.slug;
    
    if (!lookup[key]) {
      lookup[key] = {};
    }

    const categoryKey = row.category_key;
    
    if (!lookup[key][categoryKey]) {
      lookup[key][categoryKey] = [];
    }

    // Voeg categoryFilter toe als die nog niet bestaat
    if (!lookup[key][categoryKey].includes(row.categoryFilter_subsectie)) {
      lookup[key][categoryKey].push(row.categoryFilter_subsectie);
    }
  }

  return lookup;
}

// Main execution
const mapping = generateMapping();

console.log(`✅ Gegenereerd: ${mapping.length} mapping regels\n`);

// Export CSV
const csv = exportToCSV(mapping);
require('fs').writeFileSync('ai-agent-mapping.csv', csv, 'utf-8');
console.log('📄 CSV opgeslagen: ai-agent-mapping.csv');

// Export JSON (volledige mapping)
const json = exportToJSON(mapping);
require('fs').writeFileSync('ai-agent-mapping.json', json, 'utf-8');
console.log('📄 JSON opgeslagen: ai-agent-mapping.json');

// Export Lookup (compacte versie voor snelle queries)
const lookup = generateLookup(mapping);
require('fs').writeFileSync('ai-agent-lookup.json', JSON.stringify(lookup, null, 2), 'utf-8');
console.log('📄 Lookup opgeslagen: ai-agent-lookup.json');

// Print voorbeeld
console.log('\n--- Voorbeeld output (eerste 5 regels) ---\n');
console.table(mapping.slice(0, 5));

console.log('\n--- Voorbeeld lookup voor "hsb-voorzetwand" ---\n');
console.log(JSON.stringify(lookup['hsb-voorzetwand'], null, 2));