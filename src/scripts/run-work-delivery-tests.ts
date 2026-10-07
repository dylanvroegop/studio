import assert from 'node:assert/strict';
import { sanitizeWorkDeliveryScope, validateWorkDeliveryScope } from '../lib/work-delivery';

const summary = 'Een meterkastombouw maken met twee deurtjes en twee planken van 25 cm breed. De ombouw rond de vloerverwarming loopt door tot de muur van de trap.';
const dimensions = [
    'Volledige maat: breedte 1740 mm, hoogte 2555 mm',
    'Meterkast: breedte 890 mm, hoogte 2555 mm',
    'Vloerverwarming ombouw: breedte 850 mm, hoogte 500 mm',
];

for (const enabled of [false, true]) {
    const scope = sanitizeWorkDeliveryScope({
        title: 'Meterkastje maken',
        summary,
        work_scope: [summary],
        dimensions,
        afvalAfvoeren: true,
        finishLevel: 'volledig_afgewerkt',
        electricalScope: { enabled },
    });
    assert.equal(scope.title, 'Meterkastje maken');
    assert.equal(scope.summary, summary);
    assert.deepEqual(scope.work_scope, [summary]);
    assert.deepEqual(scope.dimensions, dimensions);
    assert.deepEqual(validateWorkDeliveryScope(scope), { valid: true, errors: [] });
    assert.deepEqual(sanitizeWorkDeliveryScope(scope), scope);
}

for (const electricalText of [
    'De groepenkast in de meterkast vervangen.',
    'Elektrische aansluitingen in de meterkast aanpassen.',
    'Kabels in de meterkast verplaatsen.',
    'Een stopcontact in de meterkast plaatsen.',
]) {
    const input = { title: 'Installatiewerk', summary: electricalText, work_scope: [electricalText] };
    const disabled = sanitizeWorkDeliveryScope(input);
    assert.equal(disabled.summary, '');
    assert.deepEqual(disabled.work_scope, []);
    assert.ok(validateWorkDeliveryScope(input).errors.includes('Elektrawerk staat uit, maar klanttekst bevat elektrawerk.'));
    const enabled = sanitizeWorkDeliveryScope({ ...input, electricalScope: { enabled: true } });
    assert.equal(enabled.summary, electricalText);
    assert.deepEqual(enabled.work_scope, [electricalText]);
}

console.log('Werk & Levering: meterkasttimmerwerk behouden en elektrawerk gecontroleerd.');
