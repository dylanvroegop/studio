import { JOB_REGISTRY } from './job-registry';
import * as fs from 'fs';

const normalized: Record<string, Record<string, string>> = {};

function asString(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? '') : value;
}

for (const [, categoryConfig] of Object.entries(JOB_REGISTRY)) {
  for (const item of categoryConfig.items) {
    const { materialSections, categoryConfig: itemCategoryConfig } = item;
    if (!materialSections || materialSections.length === 0) continue;

    for (const section of materialSections) {
      const { label, categoryFilter, category } = section;
      if (!categoryFilter || !category) continue;

      const categoryKey = asString(category);
      let hoofdcategorie: string = categoryKey;
      if (itemCategoryConfig) {
        const configEntry = (itemCategoryConfig as Record<string, { title: string; order: number }>)[categoryKey];
        if (configEntry) hoofdcategorie = configEntry.title;
      }

      if (!normalized[hoofdcategorie]) normalized[hoofdcategorie] = {};
      normalized[hoofdcategorie][label] = asString(categoryFilter);
    }
  }
}

fs.writeFileSync('ai-agent-normalized.json', JSON.stringify(normalized, null, 2), 'utf-8');
console.log('✅ Opgeslagen: ai-agent-normalized.json');
console.log(`📊 ${Object.keys(normalized).length} hoofdcategorieën`);
