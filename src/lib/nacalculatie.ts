import type {
  NacalculatieCostEntry,
  NacalculatieDoc,
  NacalculatieLaborEntry,
  NacalculatieMaterialEntry,
  NacalculatieTransportEntry,
} from './winst-types';

function createId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeLaborEntries(value: unknown): NacalculatieLaborEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): NacalculatieLaborEntry | null => {
      if (!row || typeof row !== 'object') return null;
      const source = row as Partial<NacalculatieLaborEntry>;
      const id = safeString(source.id).trim() || createId();
      const date = safeString(source.date).trim() || new Date().toISOString().slice(0, 10);
      const hours = Math.max(0, safeNumber(source.hours));
      const hourRateExcl = Math.max(0, safeNumber(source.hourRateExcl));
      const note = safeString(source.note).trim();
      return {
        id,
        date,
        hours,
        hourRateExcl,
        ...(note ? { note } : {}),
      };
    })
    .filter((row): row is NacalculatieLaborEntry => row !== null);
}

function normalizeMaterialEntries(value: unknown): NacalculatieMaterialEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): NacalculatieMaterialEntry | null => {
      if (!row || typeof row !== 'object') return null;
      const source = row as Partial<NacalculatieMaterialEntry>;
      const id = safeString(source.id).trim() || createId();
      const date = safeString(source.date).trim() || new Date().toISOString().slice(0, 10);
      const name = safeString(source.name).trim();
      const qty = Math.max(0, safeNumber(source.qty));
      const unitCostExcl = Math.max(0, safeNumber(source.unitCostExcl));
      const computedTotal = qty * unitCostExcl;
      const explicitTotal = Math.max(0, safeNumber(source.totalExcl));
      const totalExcl = explicitTotal > 0 ? explicitTotal : computedTotal;
      const note = safeString(source.note).trim();
      return {
        id,
        date,
        name,
        qty,
        unitCostExcl,
        totalExcl,
        ...(note ? { note } : {}),
      };
    })
    .filter((row): row is NacalculatieMaterialEntry => row !== null);
}

function normalizeTransportEntries(value: unknown): NacalculatieTransportEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): NacalculatieTransportEntry | null => {
      if (!row || typeof row !== 'object') return null;
      const source = row as Partial<NacalculatieTransportEntry>;
      const id = safeString(source.id).trim() || createId();
      const date = safeString(source.date).trim() || new Date().toISOString().slice(0, 10);
      const km = Math.max(0, safeNumber(source.km));
      const costExcl = Math.max(0, safeNumber(source.costExcl));
      const revenueExcl = Math.max(0, safeNumber(source.revenueExcl));
      const note = safeString(source.note).trim();
      return {
        id,
        date,
        km,
        costExcl,
        revenueExcl,
        ...(note ? { note } : {}),
      };
    })
    .filter((row): row is NacalculatieTransportEntry => row !== null);
}

function normalizeCostEntries(value: unknown): NacalculatieCostEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row): NacalculatieCostEntry | null => {
      if (!row || typeof row !== 'object') return null;
      const source = row as Partial<NacalculatieCostEntry>;
      const id = safeString(source.id).trim() || createId();
      const date = safeString(source.date).trim() || new Date().toISOString().slice(0, 10);
      const name = safeString(source.name).trim();
      const costExcl = Math.max(0, safeNumber(source.costExcl));
      const note = safeString(source.note).trim();
      return {
        id,
        date,
        name,
        costExcl,
        ...(note ? { note } : {}),
      };
    })
    .filter((row): row is NacalculatieCostEntry => row !== null);
}

export function createDefaultNacalculatieDoc(params: {
  quoteId: string;
  userId: string;
  defaultHourRateExcl?: number;
}): NacalculatieDoc {
  const defaultHourRateExcl = Math.max(0, safeNumber(params.defaultHourRateExcl));
  return {
    quoteId: params.quoteId,
    userId: params.userId,
    status: 'concept',
    labor: {
      entries: [
        {
          id: createId(),
          date: new Date().toISOString().slice(0, 10),
          hours: 0,
          hourRateExcl: defaultHourRateExcl,
        },
      ],
      actualHours: 0,
      actualDays: 0,
      actualCostExcl: 0,
    },
    materials: {
      groot: {
        entries: [],
        actualCostExcl: 0,
      },
      verbruik: {
        entries: [],
        actualCostExcl: 0,
      },
    },
    transport: {
      entries: [],
      actualCostExcl: 0,
      actualKm: 0,
      actualRevenueExcl: 0,
    },
    materieel: {
      entries: [],
      actualCostExcl: 0,
    },
    overhead: {
      entries: [],
      actualCostExcl: 0,
    },
    notes: '',
  };
}

export function recalculateNacalculatie(doc: NacalculatieDoc): NacalculatieDoc {
  const laborEntries = normalizeLaborEntries(doc.labor?.entries);
  const grootEntries = normalizeMaterialEntries(doc.materials?.groot?.entries);
  const verbruikEntries = normalizeMaterialEntries(doc.materials?.verbruik?.entries);
  const transportEntries = normalizeTransportEntries(doc.transport?.entries);
  const materieelEntries = normalizeCostEntries(doc.materieel?.entries);
  const overheadEntries = normalizeCostEntries(doc.overhead?.entries);

  const laborHours = laborEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const laborDays = Math.max(0, safeNumber(doc.labor?.actualDays));
  const laborCost = laborEntries.reduce((sum, entry) => sum + entry.hours * entry.hourRateExcl, 0);
  const grootCost = grootEntries.reduce((sum, entry) => sum + (entry.totalExcl ?? entry.qty * entry.unitCostExcl), 0);
  const verbruikCost = verbruikEntries.reduce((sum, entry) => sum + (entry.totalExcl ?? entry.qty * entry.unitCostExcl), 0);
  const transportCost = transportEntries.reduce((sum, entry) => sum + entry.costExcl, 0);
  const transportKm = transportEntries.reduce((sum, entry) => sum + entry.km, 0);
  const transportRevenue = transportEntries.reduce((sum, entry) => sum + entry.revenueExcl, 0);
  const materieelCost = materieelEntries.reduce((sum, entry) => sum + entry.costExcl, 0);
  const overheadCost = overheadEntries.reduce((sum, entry) => sum + entry.costExcl, 0);

  return {
    ...doc,
    status: doc.status,
    notes: safeString(doc.notes),
    labor: {
      entries: laborEntries,
      actualHours: laborHours,
      actualDays: laborDays,
      actualCostExcl: laborCost,
    },
    materials: {
      groot: {
        entries: grootEntries,
        actualCostExcl: grootCost,
      },
      verbruik: {
        entries: verbruikEntries,
        actualCostExcl: verbruikCost,
      },
    },
    transport: {
      entries: transportEntries,
      actualCostExcl: transportCost,
      actualKm: transportKm,
      actualRevenueExcl: transportRevenue,
    },
    materieel: {
      entries: materieelEntries,
      actualCostExcl: materieelCost,
    },
    overhead: {
      entries: overheadEntries,
      actualCostExcl: overheadCost,
    },
  };
}

export function normalizeNacalculatieDoc(params: {
  quoteId: string;
  userId: string;
  source?: unknown;
  defaultHourRateExcl?: number;
}): NacalculatieDoc {
  const base = createDefaultNacalculatieDoc({
    quoteId: params.quoteId,
    userId: params.userId,
    defaultHourRateExcl: params.defaultHourRateExcl,
  });
  const source = params.source;
  if (!source || typeof source !== 'object') return base;

  const row = source as Partial<NacalculatieDoc>;
  const merged: NacalculatieDoc = {
    ...base,
    ...row,
    quoteId: params.quoteId,
    userId: params.userId,
    status:
      row.status === 'in_progress' || row.status === 'afgerond' || row.status === 'concept'
        ? row.status
        : 'concept',
    labor: {
      ...base.labor,
      ...(row.labor ?? {}),
      entries: normalizeLaborEntries(row.labor?.entries),
    },
    materials: {
      groot: {
        ...base.materials.groot,
        ...(row.materials?.groot ?? {}),
        entries: normalizeMaterialEntries(row.materials?.groot?.entries),
      },
      verbruik: {
        ...base.materials.verbruik,
        ...(row.materials?.verbruik ?? {}),
        entries: normalizeMaterialEntries(row.materials?.verbruik?.entries),
      },
    },
    transport: {
      ...base.transport,
      ...(row.transport ?? {}),
      entries: normalizeTransportEntries(row.transport?.entries),
    },
    materieel: {
      ...base.materieel,
      ...(row.materieel ?? {}),
      entries: normalizeCostEntries(row.materieel?.entries),
    },
    overhead: {
      ...base.overhead,
      ...(row.overhead ?? {}),
      entries: normalizeCostEntries(row.overhead?.entries),
    },
    notes: safeString(row.notes),
  };

  return recalculateNacalculatie(merged);
}
