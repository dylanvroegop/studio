/** Eenvoudige materiaalraming. Geen legplan, strokenoptimalisatie of reststukhergebruik. */
interface Row { [key: string]: any }
interface Point { x: number; y: number }
export function dimensionMm(value: unknown): number {
  const text = String(value ?? '').trim().toLowerCase().replace(',', '.');
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(mm|millimeter|cm|centimeter|m|meter)?$/);
  if (!match) throw new Error('Een geldige maat ontbreekt');
  const number = Number(match[1]);
  return number * (/^(cm|centimeter)$/.test(match[2]) ? 10 : /^(m|meter)$/.test(match[2]) ? 1000 : 1);
}
function area(points: Point[]): number {
  return Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
}
function clip(points: Point[], axis: 'x' | 'y', edge: number, greater: boolean): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const aIn = greater ? a[axis] >= edge : a[axis] <= edge;
    const bIn = greater ? b[axis] >= edge : b[axis] <= edge;
    if (aIn) out.push(a);
    if (aIn !== bIn) { const t = (edge - a[axis]) / (b[axis] - a[axis]); out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }); }
  }
  return out;
}
export function wallSurface(item: Row): { grossM2: number; openingsM2: number; netM2: number } {
  const length = dimensionMm(item.lengte);
  const height = dimensionMm(item.hoogte);
  if (length <= 0 || height < 0) throw new Error('Wandmaten ontbreken');
  const shape = item.shape || 'rectangle';
  if (item.variant === 'bottom') throw new Error('Onderzijdeprofiel vraagt controle');
  const left = item.hoogteLinks == null ? height : dimensionMm(item.hoogteLinks);
  const right = item.hoogteRechts == null ? height : dimensionMm(item.hoogteRechts);
  let polygon: Point[] = [{ x: 0, y: 0 }, { x: length, y: 0 }];
  if (shape === 'gable') {
    const peak = dimensionMm(item.hoogteNok);
    if (peak < Math.max(left, right)) throw new Error('Nokhoogte is lager dan de wanduiteinden');
    polygon.push({ x: length, y: right }, { x: length / 2, y: peak }, { x: 0, y: left });
  } else if (shape === 'slope') polygon.push({ x: length, y: right }, { x: 0, y: left });
  else if (shape === 'rectangle' || shape === 'rect') polygon.push({ x: length, y: height }, { x: 0, y: height });
  else throw new Error(`Wandvorm '${shape}' vraagt controle`);
  const grossM2 = area(polygon) / 1e6;
  if (!(grossM2 > 0)) throw new Error('Wandoppervlakte ontbreekt');
  const rectangles: Array<{ x: number; y: number; w: number; h: number }> = [];
  let openingsM2 = 0;
  for (const opening of item.openings || []) {
    const r = { x: dimensionMm(opening.fromLeft), y: dimensionMm(opening.fromBottom ?? 0), w: dimensionMm(opening.width ?? opening.openingWidth), h: dimensionMm(opening.height ?? opening.openingHeight) };
    if (r.w <= 0 || r.h <= 0) throw new Error('Openingsmaten ontbreken');
    if (rectangles.some(o => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y)) throw new Error('Overlappende openingen vragen controle');
    rectangles.push(r);
    let intersection = clip(polygon, 'x', r.x, true);
    intersection = clip(intersection, 'x', r.x + r.w, false);
    intersection = clip(intersection, 'y', r.y, true);
    intersection = clip(intersection, 'y', r.y + r.h, false);
    openingsM2 += area(intersection) / 1e6;
  }
  return { grossM2, openingsM2, netM2: Math.max(0, grossM2 - openingsM2) };
}
function configuredWastePercentage(entry: Row): number {
  const value = entry.wastePercentage;
  if (value == null || value === '') return 0;
  const percentage = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(percentage) || percentage < 0) throw new Error('Ongeldig afvalpercentage in de app');
  return percentage;
}
export function simpleMaterialRule(sectionKey: string, wastePercentage: number | 'user_input' = 'user_input'): Row {
  return {
    sectionKey, calculation_method: 'simple_quantity_estimate', wastePercentage,
    method: 'Bereken de benodigde netto m2, m1, m3, kg, liter of expliciete stuks voor deze materiaaltoepassing. Deel door de dekking/lengte/inhoud per verkoopeenheid. Geef basis_aantal zonder afval en zonder afronding. Gebruik de echte vorm en openingen. Elke geselecteerde zijde/laag telt eenmaal. Geen stroken, legplan, hele platen per rij/kolom, bin-packing of reststukken. Het afvalpercentage uit material_entry.wastePercentage in de app is leidend: 0 betekent geen afvalopslag. Gebruik nooit een vaste 10% of een eigen standaard. Bereken per toepassing de ongeronde basis met het bijbehorende afvalpercentage; voeg gelijke producten daarna samen en rond eenmaal naar boven af. Geef naast basis_aantal ook het uiteindelijke aantal en vermeld het gebruikte percentage in hoe_berekend.',
    missing_input_behavior: 'requires_manual_input',
  };
}
function jobs(body: Row): Row[] { const list = body.quote?.klussen; return Array.isArray(list) ? list : Object.values(list || {}); }
function basis(job: Row): Row[] { const b = job.maatwerk?.basis ?? job.maatwerk?.items; return Array.isArray(b) ? b : b?.items || []; }
function slug(job: Row): string { return job.meta?.slug || job.maatwerk?.meta?.slug || job.materialen?.jobKey || ''; }
export function prepareSimpleCalculation(body: Row): Row {
  const copy = JSON.parse(JSON.stringify(body));
  for (const job of jobs(copy)) {
    for (const [key, entry] of Object.entries(job.materialen?.materialen_lijst || {}) as Array<[string, Row]>) {
      entry.wastePercentage = configuredWastePercentage(entry);
      entry.rule = simpleMaterialRule(entry.sectionKey || key, entry.wastePercentage);
      delete entry.keralit_cut_plan;
      delete entry.configuredWastePercentageIgnored;
      delete entry.rule_meta;
    }
    for (const item of basis(job)) {
      // Oude plaat-/strookaantallen zijn geen invoer voor de nieuwe m2-raming.
      delete item.boeiboord_panelen; delete item.boeiboord_aantallen;
      if (item.calculatedData) { const { beams, params } = item.calculatedData; item.calculatedData = { beams, params }; }
      if (/wand/.test(slug(job))) {
        try { item.surface_estimate = wallSurface(item); } catch (e) { item.surface_estimate = { error: (e as Error).message }; }
      }
    }
  }
  return copy;
}
function materialName(row: Row): string { return String(row.materiaal ?? row.product ?? row.materiaalnaam ?? '').trim(); }
function ceilQuantity(value: number, unit: string, wastePercentage: number): number {
  const decimals = /^(m1|m2|m3|m²|m³|m|kg|l|liter)$/.test(unit.toLowerCase()) ? 100 : 1;
  return Math.ceil(value * (1 + wastePercentage / 100) * decimals - 1e-9) / decimals;
}
function coverage(material: Row): number {
  const explicit = material.dekking_m2 ?? material.inhoud_m2;
  if (explicit != null) { const n = Number(String(explicit).replace(',', '.')); if (n > 0) return n; }
  const perSheet = dimensionMm(material.lengte) * dimensionMm(material.breedte) / 1e6;
  if (!(perSheet > 0)) throw new Error('Plaatlengte of plaatbreedte ontbreekt');
  const name = String(material.materiaalnaam || '');
  const packedArea = name.match(/(\d+(?:[.,]\d+)?)\s*m[²2]\s*(?:per\s*)?(?:pak|rol|doos)/i);
  if (packedArea) return Number(packedArea[1].replace(',', '.'));
  const pack = name.match(/(\d+)\s*(?:stuks?|st\.?)(?:\s*per\s*pak)?\b/i);
  return perSheet * (pack ? Number(pack[1]) : 1);
}
/** Afval en afronding worden in code toegepast; de AI levert alleen de ongeronde basis. */
export function finalizeSimpleCalculation(body: Row, output: Row): Row {
  const rows: Row[] = Array.isArray(output.materialen) ? output.materialen : [];
  const groups = new Map<string, Row[]>();
  for (const row of rows) { const name = materialName(row); groups.set(name, [...(groups.get(name) || []), row]); }
  // Bewaar alle geselecteerde producten, ook wanneer de AI er een heeft overgeslagen.
  const entries = new Map<string, Array<{ job: Row; entry: Row; key: string }>>();
  for (const job of jobs(body)) for (const [key, entry] of Object.entries(job.materialen?.materialen_lijst || {}) as Array<[string, Row]>) {
    if (!entry.material) continue;
    const name = String(entry.material.materiaalnaam || '').trim();
    entries.set(name, [...(entries.get(name) || []), { job, entry, key }]);
  }
  const result: Row[] = [];
  for (const [name, sources] of entries) {
    const modelRows = groups.get(name) || [];
    const first = sources[0], mat = first.entry.material;
    const row: Row = { ...modelRows[0], materiaal: name, prijs_per_stuk: mat.prijs_per_stuk ?? mat.prijs ?? 0, eenheid: mat.eenheid || 'stuk', slotKey: first.key, klus_type: slug(first.job), wastePercentage: configuredWastePercentage(first.entry) };
    let base = 0, explanation = '', error = '';
    const isWallSheet = sources.every(s => /wand/.test(slug(s.job)) && /^(constructieplaat|afwerkplaat)(_[12])?$/.test(s.entry.sectionKey || s.key));
    try {
      if (sources.some(source => configuredWastePercentage(source.entry) !== row.wastePercentage)) throw new Error('Gelijke materialen met verschillende afvalpercentages vragen een berekening per toepassing');
      if (isWallSheet) {
        let net = 0;
        for (const source of sources) {
          const items = basis(source.job);
          if (!items.length) throw new Error('Wandmaten ontbreken');
          if (source.entry.quantity != null || source.entry.aantal != null) throw new Error('Handmatig plaataantal vraagt controle');
          const amount = items.reduce((sum, item) => sum + wallSurface(item).netM2, 0);
          net += amount;
          base += /^(m2|m²)$/.test(row.eenheid) ? amount : amount / coverage(source.entry.material);
        }
        explanation = `Netto wandoppervlak inclusief geselecteerde zijden: ${net.toFixed(4)} m². Oppervlakte per verkoopeenheid: ${/^(m2|m²)$/.test(row.eenheid) ? 1 : coverage(mat)} m². Materiaalraming op m²; geen zaagplan.`;
      } else {
        if (!modelRows.length) throw new Error('Materiaal ontbreekt in de berekening');
        for (const model of modelRows) {
          if (model.basis_aantal == null || !Number.isFinite(Number(model.basis_aantal)) || Number(model.basis_aantal) < 0 || model.berekening_status === 'requires_manual_input') throw new Error(model.voorstel || 'Benodigde maten, verbruik of aantallen ontbreken');
          base += Number(model.basis_aantal);
        }
        explanation = modelRows.map(r => r.hoe_berekend || '').join(' ');
      }
    } catch (e) { error = (e as Error).message; }
    if (error) Object.assign(row, { aantal: null, basis_aantal: null, berekening_status: 'requires_manual_input', voorstel: error, hoe_berekend: `Niet berekend: ${error}. Vul de ontbrekende gegevens of het aantal in.` });
    else Object.assign(row, { aantal: ceilQuantity(base, row.eenheid, row.wastePercentage), basis_aantal: base, berekening_status: 'estimated', voorstel: '', hoe_berekend: `${explanation} Basis ${base.toFixed(4)} × ${(1 + row.wastePercentage / 100).toLocaleString('nl-NL')} (${row.wastePercentage}% afval uit de app); eenmaal naar boven afgerond = ${ceilQuantity(base, row.eenheid, row.wastePercentage)} ${row.eenheid}.` });
    result.push(row);
  }
  return { ...output, materialen: result, calculation_policy: 'simple_estimate_app_waste', calculation_status: result.some(r => r.berekening_status === 'requires_manual_input') ? 'needs_review' : 'estimated' };
}
