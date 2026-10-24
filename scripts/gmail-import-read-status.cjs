const { randomUUID } = require('node:crypto');
function updateWorkflow(original, tableId) {
  const w = structuredClone(original);
  const node = name => w.nodes.find(n => n.name === name);
  const link = (from, to, output = 0) => {
    w.connections[from] ??= { main: [] };
    w.connections[from].main[output] = [{ node: to, type: 'main', index: 0 }];
  };
  const add = (name, type, parameters, position, typeVersion = 2) => {
    w.nodes.push({ id: randomUUID(), name, type: `n8n-nodes-base.${type}`, typeVersion, parameters, position });
  };
  for (const name of ['Mark a message as read', 'Mark a message as read1', 'Wait For Invoice And PDF']) {
    w.nodes = w.nodes.filter(n => n.name !== name);
    delete w.connections[name];
  }
  for (const n of w.nodes.filter(n => n.type === 'n8n-nodes-base.gmailTrigger')) {
    n.parameters.filters.readStatus = 'both';
    link(n.name, 'Select Invoice PDF');
  }
  // De accountnaam hoort bij de sleutel: Gmail-IDs zijn mailboxgebonden.
  node('Select Invoice PDF').parameters.jsCode = `const names = ['vroegoptimmerwerken@gmail.com', 'facturenvroegoptimmerwerken@gmail.com'];
const active = names.filter(name => $(name).isExecuted);
if (active.length !== 1) throw new Error('Precies één Gmail-bron vereist.');
const mailbox = active[0];
const supported = /[.](pdf|png|jpe?g|webp|heic|heif)$/i;
return $input.all().flatMap((item, index) => {
  const source = item.json;
  if (!source.id) throw new Error('Gmail bericht-ID ontbreekt.');
  const sender = source.from?.email || source.from || source.sender || null;
  return Object.entries(item.binary || {})
    .filter(([key, file]) => key.startsWith('attachment_') && file.isAttachment !== false && (file.mimeType === 'application/pdf' || String(file.mimeType || '').startsWith('image/') || supported.test(file.fileName || key)))
    .map(([key, file]) => ({ json: { ...source, selectedAttachment: key, attachmentFileName: file.fileName || key, source_filename: file.fileName || key, source_email: sender ? String(sender) : null,
      processing_key: JSON.stringify([mailbox, String(source.id), key]), source_mailbox: mailbox },
      binary: { invoice_pdf: file }, pairedItem: { item: index } }));
});`;
  const table = { __rl: true, value: tableId, mode: 'id' };
  const filters = { conditions: [{ keyName: 'processing_key', condition: 'eq', keyValue: '={{ $json.processing_key }}' }] };
  add('Nog niet verwerkt', 'dataTable', { resource: 'row', operation: 'rowNotExists', dataTableId: table, matchType: 'allConditions', filters }, [650, 400], 1);
  add('Verwerk bijlage', 'splitInBatches', { batchSize: 1, options: {} }, [880, 400], 3);
  link('Select Invoice PDF', 'Nog niet verwerkt');
  link('Nog niet verwerkt', 'Verwerk bijlage');
  w.connections['Verwerk bijlage'] = { main: [[], [{ node: 'Archive Original PDF in Calvora', type: 'main', index: 0 }]] };
  // Eerst archiveren, daarna analyseren. Eén bijlage per lus voorkomt vermenging.
  link('Archive Original PDF in Calvora', 'Normalize Archived PDF');
  node('Normalize Archived PDF').parameters.jsCode = `const response = $input.first().json;
const file = response.data?.receipt_file;
if (response.ok !== true || !file?.archive_id) throw new Error('Originele bijlage niet opgeslagen.');
return [{ json: { archived_receipt_file: file }, binary: $('Verwerk bijlage').item.binary, pairedItem: { item: 0 } }];`;
  link('Normalize Archived PDF', 'Upload Invoice PDF');
  link('Parse Invoice Analysis', 'Attach PDF To Cost Data');
  node('Attach PDF To Cost Data').parameters.jsCode = `return $input.all().map((item, index) => {
const file = $('Normalize Archived PDF').item.json.archived_receipt_file;
if (!file?.archive_id) throw new Error('Gearchiveerde bijlage ontbreekt.');
return { json: { data: { ...item.json.data, receipt_files: [file], receipt_url: file.url || null } }, pairedItem: { item: index } };
});`;
  node('Skip Non-Financial Attachment').parameters.jsCode = `return [{ json: { processing_key: $('Verwerk bijlage').item.json.processing_key }, pairedItem: { item: 0 } }];`;
  add('Bevestig geslaagde import', 'code', { jsCode: `return $input.all().map((item, index) => {
if (item.json.ok !== true) throw new Error('Calvora heeft de import niet bevestigd. Niet als verwerkt geregistreerd.');
return { json: { processing_key: $('Verwerk bijlage').item.json.processing_key }, pairedItem: { item: index } };
});` }, [2900, 350]);
  add('Registreer verwerkt', 'dataTable', { resource: 'row', operation: 'upsert', dataTableId: table, matchType: 'allConditions', filters,
    columns: { mappingMode: 'defineBelow', value: { processing_key: '={{ $json.processing_key }}' }, matchingColumns: [], schema: [{ id: 'processing_key', displayName: 'processing_key', type: 'string', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true }], attemptToConvertTypes: false, convertFieldsToString: false }, options: {} }, [3140, 500], 1);
  link('Maak Kost Aan', 'Bevestig geslaagde import');
  link('Save For Quote Linking', 'Bevestig geslaagde import');
  link('Bevestig geslaagde import', 'Registreer verwerkt');
  link('Skip Non-Financial Attachment', 'Registreer verwerkt');
  link('Registreer verwerkt', 'Verwerk bijlage');
  w.pinData = {};
  return w;
}
module.exports = { updateWorkflow };
if (require.main === module) {
 const fs = require('node:fs');
 const [input, output, tableId] = process.argv.slice(2);
 fs.writeFileSync(output, JSON.stringify(updateWorkflow(JSON.parse(fs.readFileSync(input)), tableId), null, 2), { mode: 0o600 });
}
