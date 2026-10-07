// Zelfstandige scenario's voor zowel node:test als een geïsoleerde n8n-testtak.
function runIdentityScenarios(resolveSession) {
  const a = { client_name: 'Testklant A', city: 'Almere', job_title: 'Binnenwand', phone: '+31611111111', email: 'a@example.invalid', appointment_status: 'not_found' };
  const b = { client_name: 'Testklant B', city: 'Utrecht', job_title: 'Kozijn', phone: '+31622222222', email: 'b@example.invalid', appointment_status: 'not_found' };
  const row = (client, id) => ({ id, chat_id: '123', client_json: client, appointment_status: 'not_found' });
  const rows = [row(a, 'sessie-A'), row(b, 'sessie-B')];
  const followup = client => ({ ...client, phone: null, email: null, appointment_status: 'confirmed', appointment_date: '2026-10-01', appointment_time: '19:00' });
  const results = [];
  const check = (name, fn) => { fn(); results.push({ scenario: name, result: 'PASS' }); };
  const eq = (actual, expected) => { if (actual !== expected) throw new Error('Onverwacht testresultaat: ' + String(actual) + ' != ' + String(expected)); };
  const blocked = fn => { let stopped = false; try { fn(); } catch { stopped = true; } eq(stopped, true); };
  check('A1, B1, A2: A houdt eigen nummer', () => { const r = resolveSession(rows, followup(a), 123); eq(r.id, 'sessie-A'); eq(r.client_json.phone, a.phone); eq(r.client_json.email, a.email); });
  check('A1, B1, B2: B houdt eigen nummer', () => { const r = resolveSession(rows, followup(b), 123); eq(r.id, 'sessie-B'); eq(r.client_json.phone, b.phone); eq(r.client_json.email, b.email); });
  check('Omgekeerde databasevolgorde verandert de klant niet', () => { const r = resolveSession([...rows].reverse(), followup(a), 123); eq(r.id, 'sessie-A'); eq(r.client_json.phone, a.phone); });
  check('Eén screenshot B met afspraak erft geen nummer van openstaande A', () => { const r = resolveSession([rows[0]], followup(b), 123); eq(r.id, undefined); eq(r.client_json.phone, null); eq(r.client_json.email, null); });
  check('Eén complete screenshot B wordt zelfstandig aangemaakt', () => { const r = resolveSession([rows[0]], b, 123); eq(r.id, undefined); eq(r.client_json.phone, b.phone); });
  check('Naam B met telefoon A stopt', () => blocked(() => resolveSession(rows, { ...b, phone: a.phone }, 123)));
  check('Telefoon A met e-mail B stopt', () => blocked(() => resolveSession(rows, { ...a, email: b.email }, 123)));
  check('Ontbrekende klantnaam stopt', () => blocked(() => resolveSession(rows, { ...followup(a), client_name: null }, 123)));
  check('Gelijke namen met verschillende nummers stoppen zonder eenduidige match', () => blocked(() => resolveSession([rows[0], row({ ...a, phone: b.phone, email: b.email }, 'andere-A')], followup(a), 123)));
  check('Vervuilde oude sessie wordt niet hergebruikt', () => blocked(() => resolveSession([rows[0], row({ ...b, phone: a.phone, email: a.email }, 'vervuild')], followup(b), 123)));
  check('Klant uit andere chat levert geen oude gegevens', () => { const r = resolveSession(rows, followup(a), 456); eq(r.id, undefined); eq(r.client_json.phone, null); });
  check('Opnieuw insturen koppelt aan dezelfde sessie', () => { const r = resolveSession(rows, a, 123); eq(r.id, 'sessie-A'); eq(r.client_json.phone, a.phone); });
  check('Complete nieuwe screenshot passeert geen tegenstrijdige oude sessie op dezelfde naam en plaats', () => blocked(() => resolveSession([rows[0], row({ ...a, phone: b.phone, email: b.email }, 'vervuild-A')], a, 123)));
  return results;
}
module.exports = { runIdentityScenarios };
