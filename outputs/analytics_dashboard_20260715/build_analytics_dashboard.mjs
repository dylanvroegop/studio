import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const outputDir = "/Users/dylanvroegop/Documents/studio/outputs/analytics_dashboard_20260715";
const referencePath = "/Users/dylanvroegop/.codex/plugins/cache/openai-curated-remote/openai-templates/0.1.0/skills/artifact-template-analytics-dashboard/assets/reference.xlsx";
const outputPath = path.join(outputDir, "analytics_dashboard.xlsx");

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(referencePath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,drawing",
  maxChars: 9000,
  tableMaxRows: 8,
  tableMaxCols: 8,
});
console.log("OVERVIEW");
console.log(overview.ndjson);

const sheets = JSON.parse(
  (await workbook.inspect({
    kind: "sheet",
    include: "id,name",
    maxChars: 4000,
  })).ndjson
    .trim()
    .split("\n")
    .find((line) => line.includes("\"sheets\"") || line.includes("\"sheet\"")) ?? "{}",
);

const sheetNames = [];
for (const line of (await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 })).ndjson.trim().split("\n")) {
  try {
    const item = JSON.parse(line);
    if (item.name) sheetNames.push(item.name);
    if (Array.isArray(item.sheets)) {
      for (const sheet of item.sheets) {
        if (sheet.name) sheetNames.push(sheet.name);
      }
    }
  } catch {
    // Ignore non-JSON diagnostic lines from inspection output.
  }
}

const uniqueSheetNames = [...new Set(sheetNames)];
console.log("SHEETS", JSON.stringify(uniqueSheetNames));

for (const sheetName of uniqueSheetNames) {
  const region = await workbook.inspect({
    kind: "region,formula",
    sheetId: sheetName,
    range: "A1:Z60",
    maxChars: 5000,
    options: { maxResults: 80 },
  });
  console.log(`INSPECT ${sheetName}`);
  console.log(region.ndjson);

  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, `${sheetName.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "sheet"}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
  maxChars: 8000,
});
console.log("FORMULA_ERRORS");
console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`SAVED ${outputPath}`);
