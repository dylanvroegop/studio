import { NextResponse } from 'next/server';

import { noStoreHeaders, resolveBankIdentity } from '@/lib/bank-api-auth';
import { normalizeBunqProfile } from '@/lib/bunq/client';
import { ensureDemoTrialActiveByUid } from '@/lib/demo-trial-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OPENAI_MODEL = 'gpt-5.4';
const MAX_TRANSACTIONS = 600;

type InputTransaction = {
  id: string;
  bookingDate: string;
  description: string;
  counterpartyName: string;
  amount: number;
  direction: 'incoming' | 'outgoing';
  accountName: string;
};

type ClarificationAnswer = {
  transactionId: string;
  answer: string;
};

type DateRange = {
  start: string;
  endExclusive: string;
};

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTransactions(value: unknown): InputTransaction[] {
  if (!Array.isArray(value)) return [];
  const rows: InputTransaction[] = [];
  for (const item of value) {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!row) continue;
    const id = safeString(row.id);
    if (!id) continue;
    rows.push({
      id,
      bookingDate: safeString(row.bookingDate) || safeString(row.booking_date),
      description: safeString(row.description) || 'Transactie',
      counterpartyName: safeString(row.counterpartyName) || '-',
      amount: safeNumber(row.amount),
      direction: safeNumber(row.amount) < 0 ? 'outgoing' : 'incoming',
      accountName: safeString(row.accountName) || 'Rekening',
    });
  }
  return rows.slice(0, MAX_TRANSACTIONS);
}

function normalizeAnswers(value: unknown): ClarificationAnswer[] {
  if (!Array.isArray(value)) return [];
  const rows: ClarificationAnswer[] = [];
  for (const item of value) {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    if (!row) continue;
    const transactionId = safeString(row.transactionId);
    const answer = safeString(row.answer);
    if (!transactionId || !answer) continue;
    rows.push({ transactionId, answer });
  }
  return rows.slice(0, 120);
}

function looksLikeInternalName(value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    normalized.includes('d. vroegop')
    || normalized.includes('d vroegop')
    || normalized.includes('dylan vroegop')
    || normalized === 'dylan'
    || normalized.includes('dylan')
  );
}

function isInternalTransfer(tx: InputTransaction): boolean {
  return looksLikeInternalName(tx.counterpartyName);
}

function currentMonthRange(): DateRange {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: end.toISOString().slice(0, 10),
  };
}

function last30DaysRange(): DateRange {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().slice(0, 10),
    endExclusive: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).toISOString().slice(0, 10),
  };
}

async function loadTransactionsForAnalysis(params: {
  bankUserId: string;
  profileRaw: unknown;
  periodRaw: unknown;
}): Promise<InputTransaction[]> {
  const profile = normalizeBunqProfile(params.profileRaw);
  const linkRef = `bunq:${profile}:${params.bankUserId}`;

  let connectionResult = await supabaseAdmin
    .from('bank_connections')
    .select('id')
    .eq('provider', 'bunq')
    .eq('link_ref', linkRef)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!connectionResult.error && !connectionResult.data && profile === 'personal') {
    connectionResult = await supabaseAdmin
      .from('bank_connections')
      .select('id')
      .eq('provider', 'bunq')
      .eq('link_ref', `bunq:${params.bankUserId}`)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (connectionResult.error || !connectionResult.data?.id) {
    return [];
  }

  const accountsResult = await supabaseAdmin
    .from('bank_accounts')
    .select('id,name')
    .eq('connection_id', connectionResult.data.id)
    .eq('status', 'active');

  if (accountsResult.error) {
    throw new Error(`Kon rekeningen voor analyse niet laden: ${accountsResult.error.message}`);
  }

  const accounts = Array.isArray(accountsResult.data) ? accountsResult.data : [];
  const accountIds = accounts
    .map((item) => (typeof item.id === 'string' ? item.id : ''))
    .filter(Boolean);
  const accountNameById = new Map<string, string>(
    accounts.map((item) => [String(item.id || ''), String(item.name || 'Rekening')])
  );

  if (accountIds.length === 0) return [];

  const period = safeString(params.periodRaw) === 'last_30_days' ? 'last_30_days' : 'this_month';
  const range = period === 'last_30_days' ? last30DaysRange() : currentMonthRange();

  const txResult = await supabaseAdmin
    .from('bank_transactions')
    .select('id,booking_date,value_date,remittance_information,counterparty_name,amount,bank_account_id')
    .in('bank_account_id', accountIds)
    .gte('booking_date', range.start)
    .lt('booking_date', range.endExclusive)
    .order('booking_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5000);

  if (txResult.error) {
    throw new Error(`Kon transacties voor analyse niet laden: ${txResult.error.message}`);
  }

  const rows = Array.isArray(txResult.data) ? txResult.data : [];
  return normalizeTransactions(rows.map((row) => ({
    id: row.id,
    bookingDate: row.booking_date || row.value_date,
    description: row.remittance_information,
    counterpartyName: row.counterparty_name,
    amount: row.amount,
    accountName: accountNameById.get(String(row.bank_account_id || '')) || 'Rekening',
  })));
}

function extractResponseText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>;
  const direct = safeString(root.output_text);
  if (direct) return direct;

  const output = Array.isArray(root.output) ? root.output : [];
  const chunks: string[] = [];

  for (const entry of output) {
    if (!entry || typeof entry !== 'object') continue;
    const content = Array.isArray((entry as Record<string, unknown>).content)
      ? ((entry as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const row = part as Record<string, unknown>;
      const text = safeString(row.text) || safeString(row.output_text);
      if (text) chunks.push(text);
    }
  }

  return chunks.join('\n').trim();
}

function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = stripCodeFences(raw);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const firstCurly = cleaned.indexOf('{');
    const lastCurly = cleaned.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly > firstCurly) {
      return JSON.parse(cleaned.slice(firstCurly, lastCurly + 1)) as Record<string, unknown>;
    }
    throw new Error('AI output bevat geen geldig JSON-object.');
  }
}

function buildPrompt(transactions: InputTransaction[], answers: ClarificationAnswer[]): string {
  const outgoing = transactions.filter((tx) => tx.amount < 0);
  const totalOut = outgoing.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return `
Je bent een financieel analyse-assistent voor een Nederlandse ZZP'er/timmerman.

Doel:
- Analyseer ALLE transacties en leg uit waar het geld heen ging.
- Categoriseer uitgaven in duidelijke categorieen.
- Label per uitgave: business of personal.
- Geef duidelijke aanbevelingen: wat was waarschijnlijk nodig, en wat had mogelijk voorkomen kunnen worden.
- Als je onzeker bent over specifieke transacties, stel concrete vragen.

Belangrijke regels:
- Gebruik alleen de meegeleverde transacties en antwoorden; verzin geen externe feiten.
- Wees eerlijk over onzekerheid.
- Houd bedragen in EUR.
- Focus op uitgaande transacties voor uitgavenanalyse.
- Maximaal 12 verduidelijkingsvragen.

Geef ALLEEN JSON terug met exact deze structuur:
{
  "periodSummary": {
    "transactionCount": number,
    "outgoingCount": number,
    "totalOutgoing": number,
    "shortConclusion": string
  },
  "categoryBreakdown": [
    {
      "category": string,
      "totalAmount": number,
      "sharePct": number,
      "businessPct": number,
      "personalPct": number,
      "explanation": string
    }
  ],
  "businessPersonalSummary": {
    "businessAmount": number,
    "personalAmount": number,
    "mixedOrUnknownAmount": number,
    "explanation": string
  },
  "neededVsAvoidable": {
    "likelyNeeded": [string],
    "possiblyAvoidable": [string]
  },
  "keyFindings": [string],
  "unclearTransactions": [
    {
      "transactionId": string,
      "question": string,
      "guessedCategory": string,
      "guessedType": "business" | "personal" | "mixed"
    }
  ],
  "nextActions": [string]
}

Context totalen:
- Aantal transacties: ${transactions.length}
- Aantal uitgaand: ${outgoing.length}
- Totale uitgaand: ${totalOut.toFixed(2)}

Transacties JSON:
${JSON.stringify(transactions)}

Gebruiker antwoorden op eerdere vragen JSON:
${JSON.stringify(answers)}
`;
}

function normalizeAnalysis(payload: Record<string, unknown>): Record<string, unknown> {
  const periodSummary = payload.periodSummary && typeof payload.periodSummary === 'object'
    ? (payload.periodSummary as Record<string, unknown>)
    : {};

  const categoryBreakdown = Array.isArray(payload.categoryBreakdown)
    ? payload.categoryBreakdown.filter((item) => item && typeof item === 'object')
    : [];

  const businessPersonalSummary = payload.businessPersonalSummary && typeof payload.businessPersonalSummary === 'object'
    ? payload.businessPersonalSummary as Record<string, unknown>
    : {};

  const neededVsAvoidable = payload.neededVsAvoidable && typeof payload.neededVsAvoidable === 'object'
    ? payload.neededVsAvoidable as Record<string, unknown>
    : {};

  const toStringList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => safeString(entry)).filter(Boolean).slice(0, 30);
  };

  const unclearTransactions = Array.isArray(payload.unclearTransactions)
    ? payload.unclearTransactions
      .filter((item) => item && typeof item === 'object')
      .map((item) => {
        const row = item as Record<string, unknown>;
        const guessedType = safeString(row.guessedType);
        return {
          transactionId: safeString(row.transactionId),
          question: safeString(row.question),
          guessedCategory: safeString(row.guessedCategory),
          guessedType: guessedType === 'business' || guessedType === 'personal' || guessedType === 'mixed' ? guessedType : 'mixed',
        };
      })
      .filter((item) => item.transactionId && item.question)
      .slice(0, 12)
    : [];

  return {
    periodSummary: {
      transactionCount: safeNumber(periodSummary.transactionCount),
      outgoingCount: safeNumber(periodSummary.outgoingCount),
      totalOutgoing: safeNumber(periodSummary.totalOutgoing),
      shortConclusion: safeString(periodSummary.shortConclusion) || 'Analyse afgerond.',
    },
    categoryBreakdown: categoryBreakdown.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        category: safeString(row.category) || 'Onbekend',
        totalAmount: safeNumber(row.totalAmount),
        sharePct: safeNumber(row.sharePct),
        businessPct: safeNumber(row.businessPct),
        personalPct: safeNumber(row.personalPct),
        explanation: safeString(row.explanation),
      };
    }),
    businessPersonalSummary: {
      businessAmount: safeNumber(businessPersonalSummary.businessAmount),
      personalAmount: safeNumber(businessPersonalSummary.personalAmount),
      mixedOrUnknownAmount: safeNumber(businessPersonalSummary.mixedOrUnknownAmount),
      explanation: safeString(businessPersonalSummary.explanation),
    },
    neededVsAvoidable: {
      likelyNeeded: toStringList(neededVsAvoidable.likelyNeeded),
      possiblyAvoidable: toStringList(neededVsAvoidable.possiblyAvoidable),
    },
    keyFindings: toStringList(payload.keyFindings),
    unclearTransactions,
    nextActions: toStringList(payload.nextActions),
  };
}

function computeExactOutgoingTotals(transactions: InputTransaction[]): {
  transactionCount: number;
  outgoingCount: number;
  totalOutgoing: number;
} {
  const outgoing = transactions.filter((tx) => tx.amount < 0);
  return {
    transactionCount: transactions.length,
    outgoingCount: outgoing.length,
    totalOutgoing: outgoing.reduce((sum, tx) => sum + Math.abs(tx.amount), 0),
  };
}

async function runOpenAiAnalysis(apiKey: string, transactions: InputTransaction[], answers: ClarificationAnswer[]): Promise<Record<string, unknown>> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: 'medium' },
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildPrompt(transactions, answers),
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = safeString((payload as { error?: { message?: unknown } }).error?.message) || 'AI analyse mislukt.';
    throw new Error(message);
  }

  const outputText = extractResponseText(payload);
  if (!outputText) throw new Error('AI gaf geen leesbare output terug.');

  const parsed = extractJsonObject(outputText);
  const normalized = normalizeAnalysis(parsed);
  const exact = computeExactOutgoingTotals(transactions);
  const periodSummary =
    normalized.periodSummary && typeof normalized.periodSummary === 'object'
      ? (normalized.periodSummary as Record<string, unknown>)
      : {};

  // Never trust model math for totals; lock to exact transaction sums.
  normalized.periodSummary = {
    ...periodSummary,
    transactionCount: exact.transactionCount,
    outgoingCount: exact.outgoingCount,
    totalOutgoing: exact.totalOutgoing,
  };

  return normalized;
}

export async function POST(request: Request) {
  try {
    const identity = await resolveBankIdentity(request);
    const trialBlockedResponse = await ensureDemoTrialActiveByUid(identity.firebaseUid);
    if (trialBlockedResponse) {
      trialBlockedResponse.headers.set('Cache-Control', 'no-store');
      return trialBlockedResponse;
    }

    const apiKey = safeString(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ ok: false, message: 'OPENAI_API_KEY ontbreekt op de server.' }, { status: 500, headers: noStoreHeaders() });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const transactions = await loadTransactionsForAnalysis({
      bankUserId: identity.bankUserId,
      profileRaw: body?.profile,
      periodRaw: body?.period,
    });
    const answers = normalizeAnswers(body?.answers);

    if (transactions.length === 0) {
      return NextResponse.json({ ok: false, message: 'Geen transacties gevonden voor deze periode.' }, { status: 400, headers: noStoreHeaders() });
    }

    const internalTransfers = transactions.filter(isInternalTransfer);
    const internalTransferOutgoingAmount = internalTransfers
      .filter((tx) => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
    const transactionsForAnalysis = transactions.filter((tx) => !isInternalTransfer(tx));

    if (transactionsForAnalysis.length === 0) {
      return NextResponse.json(
        { ok: false, message: 'Alle transacties in deze periode lijken interne overboekingen.' },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const analysis = await runOpenAiAnalysis(apiKey, transactionsForAnalysis, answers);
    const normalized = analysis as Record<string, unknown>;
    const keyFindings = Array.isArray(normalized.keyFindings) ? normalized.keyFindings : [];
    normalized.keyFindings = [
      `Interne overboekingen (${internalTransfers.length} stuks, ${internalTransferOutgoingAmount.toFixed(2)} EUR uitgaand) zijn uitgesloten van de uitgavenanalyse.`,
      ...keyFindings,
    ].slice(0, 30);

    return NextResponse.json({ ok: true, analysis: normalized }, { headers: noStoreHeaders() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kon uitgavenanalyse niet uitvoeren.';
    const status = message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, message }, { status, headers: noStoreHeaders() });
  }
}
