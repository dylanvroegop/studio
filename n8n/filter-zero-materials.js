// Gebruik bij de laatste opslagstap, op de berekende data_json.
function filterZeroMaterials(value) {
  if (Array.isArray(value)) {
    return value.filter(row => {
      if (!row || typeof row !== 'object' || !(row.product || row.materiaal || row.materiaalnaam)) return true;
      const quantity = row.aantal;
      return !(typeof quantity === 'number' && quantity === 0)
        && !(typeof quantity === 'string' && quantity.trim() !== '' && Number(quantity.trim().replace(',', '.')) === 0);
    }).map(filterZeroMaterials);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, filterZeroMaterials(entry)]));
  }
  return value;
}
module.exports = { filterZeroMaterials };
