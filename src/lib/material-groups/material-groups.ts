// src/lib/material-groups/material-groups.ts

export type MaterialGroupConfig = Record<string, { title: string; order: number }>;

type LayoutItem = { id: string; title: string };
type Layout = LayoutItem[];

// NL: Zet een simpele layout om naar config met automatische volgorde (1..n)
export function maakGroepConfig(layout: Layout): MaterialGroupConfig {
  const cfg: MaterialGroupConfig = {};
  layout.forEach((item, i) => {
    cfg[item.id] = { title: item.title, order: i + 1 };
  });
  return cfg;
}

// NL: Alles per job slug in 1 plek. 40 jobs = 40 entries hier, klaar.
export const GROUPS_PER_JOB: Record<string, MaterialGroupConfig> = {
  // ✅ voorbeeld: hsb-voorzetwand (zoals jouw UI nu toont)
  'hsb-voorzetwand': maakGroepConfig([
    { id: 'hout', title: 'FRAMEWERK' },
    { id: 'isolatie', title: 'ISOLATIE & FOLIES' },
    { id: 'beplating', title: 'BEPLATING' },
    { id: 'afwerking', title: 'AFWERKEN' },
    { id: 'gips_afwerking', title: 'NADEN & STUCWERK' },
    { id: 'Kozijnen', title: 'KOZIJNEN' },
    { id: 'Deuren', title: 'DEUREN' },
    { id: 'Koof', title: 'LEIDINGKOOF / OMKASTING' },
    { id: 'Installatie', title: 'INSTALLATIE & ELEKTRA' },
    { id: 'Schakelmateriaal', title: 'SCHAKELMATERIAAL' },
    // als jij “extra” ook als sectie wil tonen:
    // { id: 'extra', title: 'EXTRA MATERIALEN' },
  ]),

  // voeg hier de rest toe:
  // 'metalstud-voorzetwand': maakGroepConfig([ ... ]),
  // 'knieschotten': maakGroepConfig([ ... ]),
};
