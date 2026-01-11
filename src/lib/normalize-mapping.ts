import { JOB_REGISTRY } from './job-registry';

const normalized: Record<string, Record<string, string>> = {};

for (const [, categoryConfig] of Object.entries(JOB_REGISTRY)) {
  for (const item of categoryConfig.items) {
    const { materialSections, categoryConfig: itemCategoryConfig } = item;
    if (!materialSections || materialSections.length === 0) continue;

    for (const section of materialSections) {
      const { label, categoryFilter, category } = section;
      if (!categoryFilter || !category) continue;

      let hoofdcategorie: string = category;
      if (itemCategoryConfig) {
        const configEntry = (itemCategoryConfig as Record<string, { title: string; order: number }>)[category];
        if (configEntry) hoofdcategorie = configEntry.title;
      }

      if (!normalized[hoofdcategorie]) normalized[hoofdcategorie] = {};
      normalized[hoofdcategorie][label] = categoryFilter;
    }
  }
}

require('fs').writeFileSync('ai-agent-normalized.json', JSON.stringify(normalized, null, 2), 'utf-8');
console.log('✅ Opgeslagen: ai-agent-normalized.json');
console.log(`📊 ${Object.keys(normalized).length} hoofdcategorieën`);