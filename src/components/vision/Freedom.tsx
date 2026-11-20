'use client';
import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { shiftMonth, uid, type Workspace, type Scenario } from '@/lib/vision/model';
import { bankTotal, cashInputs, euro, project, receiptCheck, type Finances } from '@/lib/vision/projection';
import { Choice, Details, Field, grid, inputClass, Metric, NumberField, Panel, Text, Toggle } from './Fields';
import type { Change } from './useVision';

const numeric = [
  ['months', 'Extra werkmaanden', 12],
  ['revenue', 'Omzet per werkmaand excl. btw (€)', 30000],
  ['price', 'Aankoop Sprinter incl. btw (€)', 60000],
  ['extras', 'Aanvullend investeringsbudget (€)', 5000],
  ['travel', 'Reisbudget per maand excl. bus (€)', 4000],
  ['buffer', 'Minimale noodbuffer (€)', 30000],
  ['annual', 'Werkmaanden per reisjaar', 12],
] as const;
const costs = [
  ['operating', 'Bedrijfskosten per werkmaand, excl. verrekenbare btw (€)'],
  ['workLiving', 'Privé-uitgaven per werkmaand, excl. bus (€)'],
  ['lease', 'Huidige lease per maand (€)'],
  ['ownership', 'Eigen bus per maand, incl. onderhoud, belasting en verzekering (€)'],
  ['taxRate', 'Effectieve IB-reservering over nieuwe winst (%)'],
  ['vatRate', 'Btw op nieuwe omzet (%)'],
] as const;
const history: Record<string, string> = {
  monthReceipts: 'Operationele bankontvangsten · deze maand',
  revenue: 'Gefactureerde omzet excl. btw',
  costs: 'Zakelijke uitgaven incl. investeringen',
  netCosts: 'Lopende kosten excl. btw',
  margin: 'Indicatieve marge op omzet (%)',
  investments: 'Gereedschap en investeringen',
  withdrawals: 'Privéopnames via bank',
  bankDeposits: 'Privéstortingen via bank',
  cashDeposits: 'Privé-inleg in de kas',
  privatePurchases: 'Direct privé contant betaald',
  hours: 'Geregistreerde uren',
};
const roundLabel = (v: number) => v.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
export function runwayLabel(p: ReturnType<typeof project>) {
  return !p
    ? 'Onbekend'
    : p.runway === null
      ? p.simple && p.burn === 0
        ? 'Geen maandelijkse burn'
        : '> 240 maanden'
      : roundLabel(p.runway) + ' maanden';
}
const colors = ['#34d399', '#60a5fa', '#f59e0b'];
function Chart({
  title,
  rows,
  series,
  x = 'label',
  bars = false,
  money = true,
}: {
  title: string;
  rows: Record<string, string | number | null>[];
  series: string[];
  x?: string;
  bars?: boolean;
  money?: boolean;
}) {
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="hsl(var(--border))" />
      <XAxis dataKey={x} minTickGap={25} fontSize={10} />
      <YAxis
        width={44}
        fontSize={10}
        tickFormatter={(n) => (Math.abs(n) >= 1000 ? Math.round(n / 1000) + 'k' : String(n))}
      />
      <Tooltip
        contentStyle={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 8,
        }}
        formatter={(v) => (money ? euro(Number(v)) : roundLabel(Number(v)) + ' mnd')}
      />
      <Legend wrapperStyle={{ fontSize: 11 }} />
    </>
  );
  return (
    <Panel title={title}>
      <div className="h-52 min-w-0" role="img" aria-label={title}>
        <ResponsiveContainer width="100%" height="100%">
          {bars ? (
            <BarChart data={rows}>
              {axes}
              {series.map((s, i) => (
                <Bar key={s} name={s} dataKey={s} fill={colors[i]} isAnimationActive={false} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={rows}>
              {axes}
              {series.map((s, i) => (
                <Line
                  key={s}
                  dataKey={s}
                  stroke={colors[i]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
export function Sprinter({ w, change }: { w: Workspace; change: Change }) {
  return (
    <Details title="Mercedes Sprinter L2H2 · wonen, reizen en werken">
      <div className="text-sm">
        De bestaande inrichting en het gereedschap gaan mee. Met een eigen bus heb je een woonplek en kun je
        in Nederland je werk hervatten.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr>
              <th>Afweging</th>
              <th>Kopen</th>
              <th>Leasen</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Autonomie', 'Zelf inrichten en houden', 'Afhankelijk van contract'],
              ['Flexibiliteit', 'Verkopen of langer doorrijden', 'Looptijd en kilometerafspraken'],
              ['Eigendom', 'Eigen voertuig en restwaarde', 'Eigendom volgens leasevorm'],
              ['Onderhoud', 'Zelf plannen en betalen', 'Dekking hangt af van contract'],
              ['Gemoedsrust', 'Eigen woon- en werkplek', 'Voorspelbare termijnen'],
            ].map((r) => (
              <tr className="border-t" key={r[0]}>
                {r.map((c) => (
                  <td className="p-2 align-top" key={c}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Losse onderdelen komen boven op het aanvullende budget. Zet dat budget op nul als de lijst alles
        omvat.
      </p>
      {w.scenario.items.map((item) => (
        <div key={item.id} className={grid}>
          <Text
            label="Onderdeel"
            value={item.name}
            onChange={(name) =>
              change((v) => ({
                ...v,
                scenario: {
                  ...v.scenario,
                  items: v.scenario.items.map((x) => (x.id === item.id ? { ...x, name } : x)),
                },
              }))
            }
          />
          <NumberField
            label="Bedrag (€)"
            value={item.amount}
            onChange={(n) =>
              change((v) => ({
                ...v,
                scenario: {
                  ...v.scenario,
                  items: v.scenario.items.map((x) => (x.id === item.id ? { ...x, amount: n ?? 0 } : x)),
                },
              }))
            }
          />
          <Button
            variant="ghost"
            onClick={() =>
              change((v) => ({
                ...v,
                scenario: { ...v.scenario, items: v.scenario.items.filter((x) => x.id !== item.id) },
              }))
            }
          >
            Onderdeel verwijderen
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        onClick={() =>
          change((v) => ({
            ...v,
            scenario: { ...v.scenario, items: [...v.scenario.items, { id: uid(), name: '', amount: 0 }] },
          }))
        }
      >
        Onderdeel toevoegen
      </Button>
    </Details>
  );
}
export function Freedom({
  w,
  change,
  f,
  refresh,
  kostenCash,
  loading,
}: {
  w: Workspace;
  change: Change;
  f: Finances;
  kostenCash: number | null;
  refresh: () => void;
  loading: boolean;
}) {
  const s = w.scenario,
    m = w.manual,
    [period, setPeriod] = useState('24');
  const set = <K extends keyof Scenario>(k: K, value: Scenario[K]) =>
    change((o) => ({ ...o, scenario: { ...o.scenario, [k]: value } }));
  const manual = <K extends keyof typeof m>(k: K, value: (typeof m)[K]) =>
    change((o) => ({ ...o, manual: { ...o.manual, [k]: value } }));
  const p = useMemo(() => project(w, f), [w, f]),
    missing = cashInputs(w, f).missing;
  const [compareSaved, setCompareSaved] = useState(false),
    [name, setName] = useState('');
  const saved = w.alternatives.slice(-2);
  const variants = useMemo(
    () =>
      (['conservatief', 'realistisch', 'optimistisch'] as const).map((mode) =>
        project({ ...w, scenario: { ...s, mode } }, f),
      ),
    [w, s, f],
  );
  const freedom = useMemo(
    () =>
      Array.from({ length: 13 }, (_, months) => ({
        label: String(months),
        Reisrunway: project({ ...w, scenario: { ...s, work: true, months } }, f)?.runway ?? null,
      })),
    [w, s, f],
  );
  const extra = project({ ...w, scenario: { ...s, work: true, months: (s.work ? s.months : 0) + 1 } }, f);
  const pts = p?.points.slice(0, 1 + Number(period)) ?? [],
    rows = pts.map((pt) => ({ label: pt.date, Saldo: pt.cash, Vrij: pt.free, In: pt.income, Uit: -pt.out }));
  const custom = [p, ...saved.map((a) => project({ ...w, scenario: a.scenario }, f))];
  const customKeys = ['Huidig', ...saved.map((a, i) => i + 1 + '. ' + a.name)];
  const customRows = pts.map((pt, i) =>
    Object.fromEntries([
      ['label', pt.date],
      ...customKeys.map((k, j) => [k, custom[j]?.points[i].free ?? null]),
    ]),
  );
  const comparisons = pts.map((pt, i) => ({
    label: pt.date,
    Conservatief: variants[0]?.points[i].free ?? null,
    Realistisch: variants[1]?.points[i].free ?? null,
    Optimistisch: variants[2]?.points[i].free ?? null,
  }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric name="Liquide na werkperiode" value={euro(p?.afterWork)} detail="Projectie vóór aankoop" />
        <Metric
          name="Liquide na buskeuze"
          value={euro(p?.afterPurchase)}
          detail="Inclusief gekozen onderdelen"
        />
        <Metric
          name="Vrij bij vertrek"
          value={euro(p?.freeAtDeparture)}
          detail="Na verplichtingen en buffer"
        />
        <Metric name="Reisrunway" value={runwayLabel(p)} detail="Vanaf vertrek" />
      </div>
      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 p-3 text-sm" role="status">
          Voor de projectie ontbreken nog <strong>{missing.join(', ')}</strong>. Vul een bedrag of expliciet
          nul in.
        </div>
      )}
      <Panel
        title="Financiële bronnen"
        aside={
          <Button variant="outline" size="sm" disabled={loading} onClick={refresh}>
            {loading ? 'Ophalen…' : 'Vernieuwen'}
          </Button>
        }
      >
        {f.errors.length > 0 && (
          <p className="text-sm text-amber-500">Niet beschikbaar · {f.errors.join(', ')}</p>
        )}
        {f.accounts.map((a) => (
          <div
            key={a.key}
            className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm"
          >
            <div>
              {a.name} · {a.iban.slice(-4)}
              <div className="font-semibold">{euro(a.amount)}</div>
              <small>Knab · {a.at.slice(0, 10) || 'peildatum onbekend'}</small>
            </div>
            <Choice
              label="Rekeningsoort"
              options={['onbekend', 'zakelijk', 'privé']}
              value={m.roles[a.key] ?? a.role}
              onChange={(v) => manual('roles', { ...m.roles, [a.key]: v as typeof a.role })}
            />
          </div>
        ))}
        <div className={grid}>
          {bankTotal(f) === null ? (
            <NumberField
              label="Totaal banksaldo (€) · handmatig bij ontbrekende koppeling"
              min={-1e9}
              value={m.bank}
              onChange={(v) => manual('bank', v)}
            />
          ) : (
            <Metric name="Totaal Knab · werkelijk" value={euro(bankTotal(f))} />
          )}
          <NumberField
            label="Huidig contant saldo (€) · handmatig"
            value={m.cash}
            onChange={(v) => manual('cash', v)}
          />
        </div>
        {kostenCash !== null && kostenCash !== m.cash && (
          <Button size="sm" variant="outline" onClick={() => manual('cash', kostenCash)}>
            Actueel contant saldo uit Kosten overnemen · {euro(kostenCash)}
          </Button>
        )}
        <Details
          title="Belastingen, schulden en zakelijke verplichtingen"
          open={missing.some((x) =>
            [
              'Openstaande btw',
              'Openstaande inkomstenbelasting',
              'Schulden',
              'Zakelijke verplichtingen',
            ].includes(x),
          )}
        >
          <p className="text-xs text-muted-foreground">
            Reserveer bestaande btw en IB, ook over eerdere facturen. Vul schulden en overige rekeningen apart
            in. Verwachte betalingen van klanten tellen alleen mee na bevestiging.
          </p>
          <div className={grid}>
            {(
              [
                ['vat', 'Nog te betalen btw'],
                ['tax', 'Nog te betalen inkomstenbelasting'],
                ['debt', 'Schulden / aflossingen te reserveren'],
                ['bills', 'Overige zakelijke verplichtingen'],
              ] as const
            ).map(([k, label]) => (
              <NumberField
                key={k}
                label={
                  label +
                  ' (€) · handmatig' +
                  (k === 'bills' && f.bills !== null ? ' · administratie ' + euro(f.bills) : '')
                }
                value={m[k]}
                onChange={(v) => manual(k, v)}
              />
            ))}
            <NumberField
              label="Verplichtingen betalen in planmaand (0 = direct)"
              value={s.billMonth}
              max={24}
              step={1}
              onChange={(v) => set('billMonth', v ?? 0)}
            />
          </div>
        </Details>
        <Details title={'Openstaande facturen · ' + (f.invoices === null ? 'Onbekend' : f.invoices.length)}>
          <p className="text-xs text-muted-foreground">
            Bevestig alleen bedragen die nog buiten het banksaldo vallen. De gekozen ontvangstdatum geldt voor
            het openstaande restant, inclusief btw. Nieuwe werkmaanden betreffen uitsluitend nieuwe omzet.
          </p>
          {f.invoices === null ? (
            <div className={grid}>
              <NumberField
                label="Verwachte betalingen (€) · handmatig"
                value={m.invoices}
                onChange={(v) => manual('invoices', v)}
              />
              <Text
                label="Verwachte ontvangstdatum"
                type="date"
                value={m.invoiceDate}
                onChange={(v) => manual('invoiceDate', v)}
              />
            </div>
          ) : (
            f.invoices.map((inv) => (
              <div key={inv.id} className={grid}>
                <div className="text-sm">
                  {inv.label} · {euro(inv.amount)}
                  <div className="text-xs">Vervalt {inv.due || 'op onbekende datum'}</div>
                </div>
                {inv.amount === null && (
                  <NumberField
                    label="Restbedrag (€) · handmatig"
                    value={m.invoiceAmounts[inv.id] ?? null}
                    onChange={(n) => {
                      const amounts = { ...m.invoiceAmounts };
                      if (n === null) delete amounts[inv.id];
                      else amounts[inv.id] = n;
                      manual('invoiceAmounts', amounts);
                    }}
                  />
                )}
                <Text
                  label="Ontvangstdatum · leeg sluit uit"
                  type="date"
                  value={m.confirmed[inv.id] ?? ''}
                  onChange={(v) => {
                    const next = { ...m.confirmed };
                    if (v) next[inv.id] = v;
                    else delete next[inv.id];
                    change((o) => ({
                      ...o,
                      manual: {
                        ...o.manual,
                        confirmed: next,
                        receiptChecks: { ...o.manual.receiptChecks, [inv.id]: receiptCheck(o, f, inv) },
                      },
                    }));
                  }}
                />
                {m.confirmed[inv.id] && m.receiptChecks[inv.id] !== receiptCheck(w, f, inv) && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      manual('receiptChecks', { ...m.receiptChecks, [inv.id]: receiptCheck(w, f, inv) })
                    }
                  >
                    Saldo gewijzigd · bevestig nog openstaand
                  </Button>
                )}
              </div>
            ))
          )}
        </Details>
        <Details title="Historische cijfers">
          <p className="text-xs">
            {f.period} · Kosten volgens de gekozen zakelijke Knab-rekening. Inleg, opnames en historische
            inkomsten tellen niet nogmaals mee in je startsaldo.
          </p>
          <div className={grid}>
            {Object.entries(history).map(([k, label]) => {
              const live = f.history[k];
              return live == null ? (
                <NumberField
                  key={k}
                  label={label + ' · handmatig'}
                  min={k === 'margin' ? -1e9 : 0}
                  value={m.history[k] ?? null}
                  onChange={(n) => {
                    const h = { ...m.history };
                    if (n === null) delete h[k];
                    else h[k] = n;
                    manual('history', h);
                  }}
                />
              ) : (
                <Metric
                  key={k}
                  name={label}
                  value={
                    k === 'hours'
                      ? roundLabel(live) + ' u'
                      : k === 'margin'
                        ? roundLabel(live) + '%'
                        : euro(live)
                  }
                  detail={k === 'margin' ? 'Geschat uit beschikbare administratie' : 'Werkelijk · Calvora'}
                />
              );
            })}
          </div>
        </Details>
      </Panel>
      <Panel title="Scenarioaannames">
        <div className={grid}>
          {numeric.map(([k, label, max]) => (
            <NumberField
              key={k}
              label={label}
              value={s[k]}
              slider={max}
              max={['months', 'annual'].includes(k) ? 12 : 1e9}
              step={['months', 'annual'].includes(k) ? 1 : 0.01}
              onChange={(v) => set(k, v ?? 0)}
            />
          ))}
        </div>
        <div className={grid}>
          {(
            [
              ['buy', 'Sprinter kopen (uit = leasen)'],
              ['work', 'Eerst extra maanden werken'],
              ['invest', 'Aanvullende investeringen meenemen'],
              ['repeat', 'Jaarlijks opnieuw werken'],
              ['collect', 'Bevestigde factuurbetalingen meenemen'],
              ['inflation', 'Inflatie op leef- en voertuigkosten'],
            ] as const
          ).map(([k, label]) => (
            <Toggle key={k} label={label} value={s[k]} onChange={(v) => set(k, v)} />
          ))}
        </div>
        <div className={grid}>
          <Choice
            label="Inkomensscenario"
            value={s.mode}
            options={['conservatief', 'realistisch', 'optimistisch']}
            onChange={(v) => set('mode', v as Scenario['mode'])}
          />
          <Text
            label="Geplande startdatum"
            value={s.start}
            type="date"
            onChange={(v) => {
              if (v) set('start', v);
            }}
          />
        </div>
        <Details title="Werk, voertuig en betaalmomenten" open={costs.some(([k]) => s[k] === null)}>
          <div className={grid}>
            {costs.map(([k, label]) => (
              <NumberField
                key={k}
                label={label}
                value={s[k]}
                max={k.endsWith('Rate') ? 100 : 1e9}
                onChange={(v) => set(k, v)}
              />
            ))}
            <NumberField
              label="Ontvangst nieuwe omzet na aantal maanden"
              step={1}
              max={12}
              value={s.lag}
              onChange={(v) => set('lag', v ?? 0)}
            />
            <NumberField
              label="Conservatief · omzetdaling (%)"
              max={100}
              value={s.lower}
              onChange={(v) => set('lower', v ?? 0)}
            />
            <NumberField
              label="Optimistisch · omzetstijging (%)"
              max={100}
              value={s.upper}
              onChange={(v) => set('upper', v ?? 0)}
            />
            {s.inflation && (
              <NumberField
                label="Jaarlijkse inflatie (%)"
                max={100}
                value={s.rate}
                onChange={(v) => set('rate', v ?? 0)}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            De projectie start op zijn vroegst bij de huidige saldometing. Bij een latere start geldt het
            ingevoerde beginsaldo ook op die datum. Het model reserveert nieuwe btw en IB bij facturering en
            betaalt die per drie planmaanden. Werkelijke aangiftedatums kunnen afwijken. Gebruik netto
            bedrijfskosten en neem de bus apart op. De aankoop is een kasuitgave inclusief btw, zonder
            toekomstige teruggave. Jaarlijks werk valt aan het eind van ieder reisjaar.
          </p>
        </Details>
      </Panel>
      <Details title={'Opgeslagen scenario’s · ' + w.alternatives.length}>
        <div className={grid}>
          <Text label="Naam voor huidig scenario" value={name} onChange={setName} />
          <Button
            variant="outline"
            disabled={!name.trim() || w.alternatives.length >= 20}
            onClick={() => {
              const item = { id: uid(), name: name.trim(), scenario: s };
              change((v) => ({ ...v, alternatives: [...v.alternatives, item] }));
              setName('');
              setCompareSaved(true);
            }}
          >
            Scenario bewaren
          </Button>
        </div>
        {w.alternatives.map((a) => (
          <div className="flex flex-wrap items-center gap-2 text-sm" key={a.id}>
            <strong>{a.name}</strong>
            <span>
              {a.scenario.months} werkmaanden · {euro(a.scenario.travel)} reisbudget
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => change((v) => ({ ...v, scenario: a.scenario }))}
            >
              Aannames laden
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                change((v) => ({ ...v, alternatives: v.alternatives.filter((x) => x.id !== a.id) }))
              }
            >
              Verwijderen
            </Button>
          </div>
        ))}
        {saved.length > 0 && (
          <Toggle
            label="Vergelijk huidig plan met de laatste twee opgeslagen scenario’s"
            value={compareSaved}
            onChange={setCompareSaved}
          />
        )}
      </Details>
      <Sprinter w={w} change={change} />
      <Panel title="Werk en reisvrijheid">
        <div className={grid}>
          <Metric name="Noodbuffer bereikt" value={p ? p.threshold || 'Buiten projectie' : 'Onbekend'} />
          <Metric
            name="Eén extra werkmaand"
            value={
              p?.runway != null && extra?.runway != null
                ? roundLabel(extra.runway - p.runway) + ' reismaanden'
                : 'Onbekend'
            }
          />
          <Metric
            name="Benodigd werk per jaar"
            value={
              p?.annualNeeded == null
                ? 'Onbekend'
                : p.annualNeeded > 12
                  ? 'Meer dan 12 maanden'
                  : roundLabel(p.annualNeeded) + ' maanden'
            }
            detail="Huidig prijspeil, structurele uitgaven"
          />
          <Metric name="Netto maandlast op reis" value={euro(p?.burn)} detail="Vóór nieuwe werkinkomsten" />
        </div>
        <div className="border-l-2 border-emerald-500 pl-3 text-sm">
          <p>{p?.points[0].date ?? s.start} · Begin projectie</p>
          <p>
            {p?.departure ?? shiftMonth(s.start, s.work ? s.months : 0)} ·{' '}
            {s.buy ? 'Sprinter kopen' : 'Lease voortzetten'} en reizen
          </p>
        </div>
      </Panel>
      <Field label="Grafiekperiode">
        <select className={inputClass} value={period} onChange={(e) => setPeriod(e.target.value)}>
          {[6, 12, 24].map((n) => (
            <option value={n} key={n}>
              {n} maanden
            </option>
          ))}
        </select>
      </Field>
      {p ? (
        <div className={grid}>
          <Chart title="Liquide middelen en vrije reserves" rows={rows} series={['Saldo', 'Vrij']} />
          <Chart title="Maandelijkse cashflow (€)" rows={rows} series={['In', 'Uit']} bars />
          <Chart
            title="Vrije reserves per scenario"
            rows={compareSaved && saved.length ? customRows : comparisons}
            series={
              compareSaved && saved.length ? customKeys : ['Conservatief', 'Realistisch', 'Optimistisch']
            }
          />
          <Chart title="Werkmaanden en reisvrijheid" rows={freedom} series={['Reisrunway']} money={false} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          De vier grafieken verschijnen zodra de benodigde bedragen bekend zijn.
        </p>
      )}
    </div>
  );
}
