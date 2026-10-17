import { getInvoiceQuoteIds, isSupplementaryInvoice, type InvoiceBillingRow } from './invoice-billing';
import { PROJECT_COST_CATEGORY_LABELS, normalizeProjectCostCategory } from './project-costs';

export interface ReportRow { [key: string]: unknown }
export interface JobReportInput {
  now: Date;
  invoices: ReportRow[];
  quotes: ReportRow[];
  costs: ReportRow[];
  hours: ReportRow[];
  warnings?: string[];
}
export function reportDate(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
  }
  const timestamp = value as { toDate?: () => Date; seconds?: number } | null;
  const date = value instanceof Date ? value : typeof timestamp?.toDate === 'function' ? timestamp.toDate()
    : typeof timestamp?.seconds === 'number' ? new Date(timestamp.seconds * 1000)
    : typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) : null;
}
export function previousReportDate(now: Date): string {
  const day = new Date(`${reportDate(now)}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
export function reportNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
const object = (value: unknown): ReportRow => value && typeof value === 'object' ? value as ReportRow : {};
const clean = (value: unknown): string => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const round = (value: number): number => Math.round(value * 100) / 100;
const money = (value: number | null): string => value === null ? 'n.b.' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
const total = (values: Array<number | null>): number | null => values.some(value => value === null) ? null : round(values.reduce<number>((sum, value) => sum + value!, 0));
const subtract = (left: number | null, right: number | null): number | null => left === null || right === null ? null : round(left - right);
const quoteIds = (row: ReportRow): string[] => getInvoiceQuoteIds(row as unknown as InvoiceBillingRow);
const issued = (row: ReportRow): boolean => ['verzonden', 'gedeeltelijk_betaald', 'betaald'].includes(String(row.status));

export interface ReportCostLine {
  id: string; costId: string; quoteId: string; category: string; date: string | null;
  supplier: string; description: string; quantity: number | null;
  excl: number | null; incl: number | null; confirmed: boolean;
}

/** Productregels bepalen de groep/koppeling; een kopbedrag wordt nooit nogmaals opgeteld. */
export function reportCostLines(costs: ReportRow[]): ReportCostLine[] {
  return costs.flatMap(row => {
    const lines = Array.isArray(row.line_items) ? row.line_items.map(object) : [];
    const headerExcl = reportNumber(row.amount_excl_btw);
    const sumExcl = total(lines.map(line => reportNumber(line.total_price)));
    const consistent = lines.length === 0 || (headerExcl !== null && sumExcl !== null && Math.abs(headerExcl - sumExcl) <= 0.02);
    return (lines.length ? lines : [row]).map((line, index) => {
      const excl = consistent ? reportNumber(lines.length ? line.total_price : row.amount_excl_btw) : null;
      const rate = reportNumber(line.btw_percentage ?? row.btw_percentage);
      const incl = lines.length
        ? reportNumber(line.total_incl_btw) ?? (excl !== null && rate !== null ? round(excl * (1 + rate / 100)) : null)
        : reportNumber(row.amount_incl_btw);
      return { id: `${row.id}:${index}`, costId: String(row.id), quoteId: clean(line.offerte_id) || clean(row.offerte_id),
        category: normalizeProjectCostCategory(row.reportCategoryOverride ?? line.category ?? row.category), date: reportDate(row.date),
        supplier: clean(row.supplier_name), description: clean(line.description) || clean(row.description) || 'Aankoop zonder omschrijving',
        quantity: lines.length ? reportNumber(line.quantity) : null, excl, incl,
        confirmed: ['confirmed', 'bank_transaction'].includes(String(row.status)) };
    });
  });
}

export function splitReportText(text: string, maximum = 3500): string[] {
  const parts: string[] = [];
  let part = '';
  for (const line of text.split('\n')) {
    let remainder = line;
    do {
      const space = maximum - part.length - (part ? 1 : 0);
      if (space <= 0) { parts.push(part); part = ''; continue; }
      part += (part ? '\n' : '') + remainder.slice(0, space);
      remainder = remainder.slice(space);
      if (remainder) { parts.push(part); part = ''; }
    } while (remainder);
  }
  if (part) parts.push(part);
  return parts;
}

export function buildJobFinanceReports(input: JobReportInput) {
  const yesterday = previousReportDate(input.now);
  const eligible = input.invoices.filter(row => row.invoiceType === 'eind' && issued(row)
    && !isSupplementaryInvoice(row as unknown as InvoiceBillingRow) && reportDate(row.sentAt) === yesterday);
  const allLines = reportCostLines(input.costs);
  return eligible.map(finalInvoice => {
    const ids = new Set(quoteIds(finalInvoice));
    const warnings = new Set(input.warnings || []);
    const titles = input.quotes.filter(row => ids.has(String(row.id))).map(row => clean(row.titel) || clean(row.title) || `Offerte ${row.offerteNummer ?? row.id}`);
    const source = object(finalInvoice.sourceQuote);
    const title = titles.join(' + ') || clean(source.titel) || 'Klus';
    const customer = clean(object(source.klantSnapshot).naam);
    if (!ids.size) warnings.add('De eindfactuur heeft geen herkenbare offertekoppeling.');
    if (ids.size > 1) warnings.add('Gecombineerde eindfactuur: één rapport voor de gekoppelde offertes samen; omzet is niet per offerte verdeeld.');
    const relevantInvoices = input.invoices.filter(row => issued(row) && quoteIds(row).some(id => ids.has(id)));
    const crossesScope = relevantInvoices.some(row => quoteIds(row).some(id => !ids.has(id)));
    const multipleFinals = relevantInvoices.filter(row => row.invoiceType === 'eind' && !isSupplementaryInvoice(row as unknown as InvoiceBillingRow)).length > 1;
    if (crossesScope || multipleFinals) warnings.add('Factuurtoewijzing is niet eenduidig; omzet, ontvangst en winst zijn n.b.');
    const amountsAllowed = ids.size > 0 && !crossesScope && !multipleFinals;
    const revenueIncl = amountsAllowed ? total(relevantInvoices.map(row => reportNumber(object(row.totalsSnapshot).totaalInclBtw))) : null;
    const receivedIncl = amountsAllowed ? total(relevantInvoices.map(row => reportNumber(object(row.paymentSummary).paidAmount))) : null;
    const revenueExcl = amountsAllowed ? total(relevantInvoices.map(row => {
      const totals = object(row.totalsSnapshot);
      const excl = reportNumber(totals.totaalExclBtw), incl = reportNumber(totals.totaalInclBtw), vat = reportNumber(totals.btw);
      return excl !== null && incl !== null && vat !== null && Math.abs(excl + vat - incl) <= 0.02 ? excl : null;
    })) : null;
    if (revenueExcl === null) warnings.add('Exclusief-btw-bedragen ontbreken of sluiten niet aan. Winst excl. btw is n.b.; er wordt geen btw-percentage aangenomen.');
    const work = input.hours.filter(row => ids.has(clean(row.quote_id)));
    const validWork = work.filter(row => reportDate(row.work_date) && reportDate(row.work_date)! <= yesterday && (reportNumber(row.worked_hours) ?? 0) > 0);
    const dates = [...new Set(validWork.map(row => reportDate(row.work_date)!))].sort();
    const invalidHours = work.some(row => !reportDate(row.work_date) || reportNumber(row.worked_hours) === null || (reportNumber(row.worked_hours) ?? 0) < 0);
    const hours = !invalidHours && validWork.length ? total(validWork.map(row => reportNumber(row.worked_hours))) : null;
    const days = !invalidHours && dates.length ? dates.length : null;
    const firstDay = !invalidHours ? dates[0] || null : null;
    const lastDay = !invalidHours ? dates[dates.length - 1] || null : null;
    if (hours === null) warnings.add('Geen volledige urenregistratie: werkperiode, winst per uur en per werkdag kunnen niet betrouwbaar worden vastgesteld.');
    const linked = allLines.filter(line => ids.has(line.quoteId));
    const projectCosts = linked.filter(line => !['profit', 'eigen_verbruik', 'gereedschap'].includes(line.category));
    const periodTools = firstDay && lastDay ? allLines.filter(line => line.category === 'gereedschap' && line.date && line.date >= firstDay && line.date <= lastDay) : [];
    const costsExcl = total(projectCosts.map(line => line.confirmed ? line.excl : null));
    const costsIncl = total(projectCosts.map(line => line.confirmed ? line.incl : null));
    const toolsExcl = firstDay && lastDay ? total(periodTools.map(line => line.confirmed ? line.excl : null)) : null;
    const profitExcl = subtract(revenueExcl, costsExcl);
    if (!projectCosts.length) warnings.add('Er zijn geen aankopen aan deze klus gekoppeld; controleer of de kosten compleet zijn.');
    if (projectCosts.some(line => !line.confirmed || line.excl === null)) warnings.add('Kostenregels zijn onbevestigd of sluiten niet aan op hun bon/factuur; winst is n.b.');
    const perHour = profitExcl !== null && hours !== null && hours > 0 ? round(profitExcl / hours) : null;
    const perDay = profitExcl !== null && days !== null && days > 0 ? round(profitExcl / days) : null;
    const purchases = (lines: ReportCostLine[]) => lines.map(line =>
      `• [${PROJECT_COST_CATEGORY_LABELS[normalizeProjectCostCategory(line.category)]}] ${line.date || 'datum n.b.'} · ${line.supplier || 'leverancier n.b.'}\n  ${line.quantity === null ? '' : `${line.quantity} × `}${line.description}\n  ${money(line.excl)} excl. btw${line.quoteId && !ids.has(line.quoteId) ? ' · gekoppeld aan andere offerte' : ''}${!line.confirmed ? ' · onbevestigd' : ''}`);
    const text = [
      `💶 Klus afgerond · ${title}`, customer, `Eindfactuur ${clean(finalInvoice.invoiceNumberLabel)} verstuurd: ${yesterday}`,
      `Werkperiode: ${firstDay || 'n.b.'} t/m ${lastDay || 'n.b.'}`,
      `Gewerkt: ${hours === null ? 'n.b.' : hours.toLocaleString('nl-NL')} uur · ${days ?? 'n.b.'} werkdagen`, '',
      `Gefactureerd totaal, incl. voorschotten: ${money(revenueIncl)} incl. btw`,
      `Totaal ontvangen: ${money(receivedIncl)} incl. btw`,
      `Nog te ontvangen: ${money(subtract(revenueIncl, receivedIncl))} incl. btw`,
      `Omzet: ${money(revenueExcl)} excl. btw`,
      `Kluskosten zonder gereedschap: ${money(costsExcl)} excl. btw`,
      `Waarvan materiaal: ${money(total(projectCosts.filter(line => line.category === 'materiaal').map(line => line.confirmed ? line.excl : null)))}`,
      '', `Voorlopige kluswinst: ${money(profitExcl)} excl. btw`,
      `Per gewerkt uur: ${money(perHour)}`, `Per geregistreerde werkdag: ${money(perDay)}`,
      `Ontvangen minus kluskosten zonder gereedschap, vóór btw-correctie: ${money(subtract(receivedIncl, costsIncl))}`,
      '', `Gereedschap aangeschaft in werkperiode: ${money(toolsExcl)} excl. btw`,
      'Gereedschap staat alleen ter informatie en wordt nergens van de winst afgetrokken.',
      '', 'Aankopen gekoppeld aan deze klus (per regel, zonder gereedschap)', ...purchases(linked.filter(line => line.category !== 'gereedschap')),
      '', 'Gereedschapsaankopen in de werkperiode (ook bij andere klussen)', ...purchases(periodTools),
      ...(linked.some(line => line.category === 'gereedschap' && !periodTools.some(tool => tool.id === line.id))
        ? ['', 'Klusgekoppeld gereedschap buiten/bij onbekende werkperiode', ...purchases(linked.filter(line => line.category === 'gereedschap' && !periodTools.some(tool => tool.id === line.id)))] : []),
      '', 'Voorlopige winst = omzet min geregistreerde kluskosten, zonder gereedschap. Eigen loon, algemene overhead, afschrijving en inkomstenbelasting zijn niet verwerkt. Privé en interne overboekingen tellen niet mee. Geen fiscale winst. Bank-/kostenvolledigheid is niet bevestigd.',
      ...[...warnings].map(warning => `⚠️ ${warning}`),
      '', `https://app.calvora.nl/facturen/${encodeURIComponent(String(finalInvoice.id))}`,
    ].filter((line): line is string => typeof line === 'string').join('\n');
    const parts = splitReportText(text);
    return { invoiceId: String(finalInvoice.id), quoteIds: [...ids], title, sentDate: yesterday, generatedAt: input.now.toISOString(),
      revenueIncl, receivedIncl, revenueExcl, costsExcl, profitExcl, perHour, perDay, hours, days, firstDay, lastDay,
      toolsExcl, warnings: [...warnings],
      messages: parts.map((part, index) => `Klusrapport ${clean(finalInvoice.invoiceNumberLabel).slice(0, 100)} (${index + 1}/${parts.length})\n${part}`) };
  });
}
