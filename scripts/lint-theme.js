#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();

const filesToCheck = [
  'src/components/ui/dialog.tsx',
  'src/components/BottomNav.tsx',
  'src/components/quote/MaterialsTab.tsx',
  'src/components/quote/LaborTab.tsx',
  'src/components/planning/PlanningGrid.tsx',
  'src/components/AppNavigation.tsx',
];

const bannedPatterns = [
  /\bbg-zinc-9\d\d\b/g,
  /\bbg-black\/(?:20|30|40|50|60|70)\b/g,
  /\btext-zinc-(?:100|200|300|400|500)\b/g,
  /\bborder-zinc-(?:700|800)\b/g,
  /\bborder-white\/(?:5|10|15|20)\b/g,
  /\btext-white\b/g,
];

const failures = [];

for (const rel of filesToCheck) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, 'utf8');

  for (const pattern of bannedPatterns) {
    const matches = content.match(pattern);
    if (matches && matches.length > 0) {
      failures.push({ rel, pattern: pattern.toString(), examples: [...new Set(matches)].slice(0, 4) });
    }
  }
}

if (failures.length > 0) {
  console.error('Theme lint failed. Found hard-coded dark-first classes in guarded files:');
  for (const failure of failures) {
    console.error(`- ${failure.rel} (${failure.pattern}) => ${failure.examples.join(', ')}`);
  }
  process.exit(1);
}

console.log('Theme lint passed.');
