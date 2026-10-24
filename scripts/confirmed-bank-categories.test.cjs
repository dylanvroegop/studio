const assert = require('node:assert/strict');
const test = require('node:test');
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs', moduleResolution: 'node' } });
const { isCremanCounterparty, isFuelCounterparty } = require('../src/lib/confirmed-bank-categories');

test('tankstationmerken en bewezen locaties worden herkend zonder factuurgegevens', () => {
  for (const name of ['Shell Schweitzerdreef', 'BP Laserdreef', 'Esso Schiphol', 'Texaco', 'Tango', 'TinQ',
    'Tamoil', 'AVIA', 'Argos', 'Q8', 'Gulf', 'Firezone', 'TotalEnergies A2', 'Circle K', 'CircleK Lelystad',
    'Tankstation de Brug', 'Stam Tankstations', 'GSSP Rijswijk', 'Haan Bergermeer', 'Gabriels Maasmechelen']) {
    assert.equal(isFuelCounterparty(name), true, name);
  }
});

test('betaalterminalprefixen, locatiecodes en spaties verbergen de merchant niet', () => {
  for (const name of ['BCK*SHELL DEN RUYGENHO', 'CCV*BP LASERDREEF', 'SumUp: Esso Utrecht', 'Zettle* TinQ',
    'CCV: BCK* Shell', 'BCK*NL12345 Tamoil', '  bck*   CIRCLE   K  ', 'Shéll Utrecht']) {
    assert.equal(isFuelCounterparty(name), true, name);
  }
});

test('Total en OK vragen een stationspatroon of gecontroleerde locatie', () => {
  for (const name of ['Total NN1234', 'Total Express', 'Total Tankstation', 'Total Beverwijk',
    'Total Vissers De IJssel', 'Total Vissers De IJsse', 'OK Tankstation', 'OK Eemnes', 'OK Rotterdam HS']) {
    assert.equal(isFuelCounterparty(name), true, name);
  }
  for (const name of ['Total', 'Total Service BV', 'Total Bouwmaterialen', 'Total NN', 'OK', 'OK Bouw',
    'OK Rotterdam Service', 'CCV*Total Service', 'CCV*OK Opleidingen']) {
    assert.equal(isFuelCounterparty(name), false, name);
  }
});

test('energie, laadpassen en wasstraten zijn geen tankbetalingen', () => {
  for (const name of ['Shell Energy', 'Shell Recharge', 'Shell Charging', 'Shell Laadpas', 'Shell Laadpaal',
    'BP Carwash', 'Esso Wasstraat', 'TotalEnergies Energie', 'Shell Consulting', 'BP Advies']) {
    assert.equal(isFuelCounterparty(name), false, name);
  }
});

test('omschrijving is alleen fallback bij lege of placeholder-tegenpartij', () => {
  for (const name of [undefined, null, '', '  ', '.', '---', ' . - . ']) {
    assert.equal(isFuelCounterparty(name, 'BCK*SHELL DEN RUYGENHO'), true, String(name));
  }
  assert.equal(isFuelCounterparty('Bouwmaat', 'Shell brandstoftoeslag'), false);
  assert.equal(isFuelCounterparty('Onbekende leverancier', 'BP Laserdreef'), false);
  assert.equal(isFuelCounterparty('', 'Overboeking naar Shell'), false);
  assert.equal(isFuelCounterparty(null, null), false);
  assert.equal(isFuelCounterparty({}, {}), false);
});

test('woordgrenzen voorkomen herkenning in willekeurige leveranciernamen', () => {
  for (const name of ['Webpartner BV', 'BPOST', 'Shellfish Restaurant', 'Q80 Bouw', 'Avian Services',
    'TangoSchool', 'Circle Kitchen', 'Other Shell Utrecht', 'Stichting Derdengelden Creman']) {
    assert.equal(isFuelCounterparty(name), false, name);
  }
});

test('Creman-uitzondering geldt alleen voor de bevestigde tegenpartij', () => {
  for (const name of ['Stichting Derdengelden Creman', ' stichting  derdengelden CREMAN via S ']) {
    assert.equal(isCremanCounterparty(name), true, name);
  }
  for (const name of [undefined, null, '', 'Creman', 'Stichting Derdengelden CremanAndere',
    'Betaling Stichting Derdengelden Creman', 'Stichting Derdengelden Andere']) {
    assert.equal(isCremanCounterparty(name), false, String(name));
  }
});

test('bevestigde Adolf Roth-merchant blijft herkenbaar zonder gelijkende bedrijven mee te nemen', () => {
  assert.equal(isFuelCounterparty('Adolf Roth GmbH & Co.'), true);
  assert.equal(isFuelCounterparty('BCK*Adolf Roth GmbH & Co.'), true);
  assert.equal(isFuelCounterparty('Adolf Roth Andere'), false);
  assert.equal(isFuelCounterparty('Adolf Roth GmbH & Co. Andere'), false);
});
