const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync('src/components/quote/SendQuoteModal.tsx', 'utf8');
const attachmentConfig = source.match(/const attachments: QuoteAttachmentOptions = (\{[\s\S]*?\});/)[1];
const handler = source.split('const handleDownloadAndOpenEmail = async () => {')[1].split('\n    };')[0];
function setup({ email = 'client@example.com', blocked = false, fail = false } = {}) {
  const events = []; const tab = { opener: {}, location: {}, close() { events.push('close'); } };
  const fn = new Function('window', 'toast', 'onDownloadPDF', 'onMarkAsSent', 'onClose', 'email', 'isLaunchingMailRef', String.raw`const isSending=false, attachments=${attachmentConfig}, subject='Offerte #1 & werk', body='Beste klant,\n\nGroet', afzenderEmail='vroegoptimmerwerken@gmail.com'; const setIsSending=()=>{}; return async () => {${handler}};`)(
    { open() { events.push('open'); return blocked ? null : tab; } }, () => {},
    async (options) => { assert.deepEqual(options, { includeOfferte: true, includeTekeningen: false, includeWerkbeschrijving: false }); events.push('download'); if (fail) throw Error('download'); await Promise.resolve(); },
    async () => events.push('mark'), () => events.push('done'), email, { current: false });
  return { fn, tab, events };
}
test('dubbelklik opent één Gmail-concept met zakelijk account en ingevulde inhoud', async () => {
  const s=setup(); await Promise.all([s.fn(),s.fn()]);
  assert.equal(s.events.filter(x=>x==='open').length,1);
  const url=new URL(s.tab.location.href);
  assert.equal(url.hostname,'mail.google.com');
  assert.equal(url.searchParams.get('authuser'),'vroegoptimmerwerken@gmail.com');
  assert.equal(url.searchParams.get('to'),'client@example.com');
  assert.equal(url.searchParams.get('su'),'Offerte #1 & werk');
  assert.equal(s.tab.opener,null);
});
test('ongeldig adres en geblokkeerd venster wijzigen geen status', async () => {
  for(const options of [{email:'invalid'},{blocked:true}]) { const s=setup(options); await s.fn(); assert.ok(!s.events.includes('mark')); assert.ok(!s.events.includes('download')); }
});
test('mislukte download sluit gereserveerd tabblad en wijzigt geen status', async () => {
  const s=setup({fail:true}); await s.fn(); assert.ok(s.events.includes('close')); assert.ok(!s.events.includes('mark')); assert.equal(s.tab.location.href,undefined);
});
