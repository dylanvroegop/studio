const editable = ['category','subcategory','vat_treatment','classification','recurring','notes'];
export function mergeTransactions(previous, incoming, rules) {
  const records = new Map(previous.filter(x => x.stable_key).map(x => [x.stable_key,x]));
  const keys = new Set();
  for (const row of incoming) {
    if (!row.stable_key || !row.account_id) throw new Error('Ontbrekende stabiele transactie-ID of rekening-ID.');
    const existing = records.get(row.stable_key);
    if (existing && (Number(existing.amount)!==Number(row.amount) || String(existing.currency)!==String(row.currency))) {
      throw new Error(`Bronconflict voor transactie ${row.stable_key}; controleer originele exports.`);
    }
    if (row.duplicate_status === 'conflict') throw new Error('Conflicterende bankregels: import gestopt.');
    if (keys.has(row.stable_key)) continue;
    keys.add(row.stable_key);
    const rule = rules.find(x => String(x.counterparty).trim().toLowerCase()===String(row.counterparty).trim().toLowerCase());
    const record = { ...row, duplicate_status: '' };
    if (existing) for (const field of editable) record[field] = existing[field] ?? row[field];
    else if(rule) for (const field of editable) if(rule[field]) record[field]=rule[field];
    // Bewezen interne transfers gaan vóór leveranciersregels en handmatige omzetclassificatie.
    if(row.internal_transfer===true || row.classification==='internal') record.classification='internal';
    records.set(row.stable_key,record);
  }
  return [...records.values()].sort((a,b)=>String(a.booking_date).localeCompare(String(b.booking_date))||a.stable_key.localeCompare(b.stable_key));
}

export function sourceFingerprint(row) {
  return [row.account_id,row.booking_date,row.amount,row.currency,row.counterparty,row.description].join('|');
}

export function findPossibleDuplicates(rows) {
  const seen = new Map();
  const warnings = [];
  for(const row of rows){const key=sourceFingerprint(row);if(seen.has(key)&&seen.get(key)!==row.stable_key)warnings.push(row.stable_key);else seen.set(key,row.stable_key);}
  return warnings;
}
