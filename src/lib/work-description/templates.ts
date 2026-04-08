export type WorkDescriptionTemplateSections = {
  voorbereiding: string[];
  uitvoering: string[];
  afwerking: string[];
};

export type WorkDescriptionTemplate = {
  key: string;
  label: string;
  aliases: string[];
  sections: WorkDescriptionTemplateSections;
};

const TEMPLATES: WorkDescriptionTemplate[] = [
  {
    key: 'dakisolatie',
    label: 'Dakisolatie',
    aliases: ['dakisolatie', 'dak isolatie', 'dak na-isolatie', 'dak naisolatie'],
    sections: {
      voorbereiding: [
        'Werkplek afzetten en vloer beschermen.',
        'Bestaande constructie en maatvoering controleren.',
        'Materialen aanvoeren en op hoogte klaarzetten.',
      ],
      uitvoering: [
        'Rachels/regelwerk uitlijnen en bevestigen volgens maatvoering.',
        'Dampremmende laag en isolatiemateriaal vakkundig aanbrengen.',
        'Aansluitingen rondom doorvoeren en randen luchtdicht afwerken.',
      ],
      afwerking: [
        'Beplating monteren en naden voorbereiden voor afwerking.',
        'Werkplek opruimen en restmateriaal afvoeren.',
        'Uitvoering opleveren en werkzaamheden kort nalopen met opdrachtgever.',
      ],
    },
  },
  {
    key: 'cinewall',
    label: 'Cinewall',
    aliases: ['cinewall', 'tv wand', 'tv-wand'],
    sections: {
      voorbereiding: [
        'Maatvoering en positie van TV/haard met opdrachtgever afstemmen.',
        'Ondergrond controleren en installaties in kaart brengen.',
      ],
      uitvoering: [
        'Frame en achterconstructie waterpas opbouwen.',
        'Leidingen, bekabeling en voorzieningen voor apparatuur verwerken.',
        'Beplating en uitsparingen voor apparatuur op maat realiseren.',
      ],
      afwerking: [
        'Naden en overgangen strak afwerken.',
        'Zichtwerk controleren en opleverpunten doornemen.',
      ],
    },
  },
  {
    key: 'wand',
    label: 'Wand',
    aliases: ['wand', 'voorzetwand', 'scheidingswand'],
    sections: {
      voorbereiding: [
        'Maatvoering uitzetten en referentielijnen controleren.',
        'Ondergrond en aansluitpunten inspecteren.',
      ],
      uitvoering: [
        'Regelwerk/metal stud plaatsen en uitlijnen.',
        'Isolatie en installaties verwerken waar nodig.',
        'Beplating monteren conform gewenste opbouw.',
      ],
      afwerking: [
        'Naden en hoeken voorbereiden voor verdere afwerking.',
        'Werkplek schoon opleveren.',
      ],
    },
  },
];

export function findWorkDescriptionTemplate(input: {
  category?: string | null;
  title?: string | null;
  context?: string | null;
}): WorkDescriptionTemplate | null {
  const category = String(input.category || '').toLowerCase().trim();
  const title = String(input.title || '').toLowerCase().trim();
  const context = String(input.context || '').toLowerCase().trim();
  const haystack = `${category} ${title} ${context}`.trim();
  if (!haystack) return null;

  for (const template of TEMPLATES) {
    if (template.aliases.some((alias) => haystack.includes(alias))) {
      return template;
    }
  }

  return null;
}

export function cloneTemplateSections(template: WorkDescriptionTemplate): WorkDescriptionTemplateSections {
  return {
    voorbereiding: [...template.sections.voorbereiding],
    uitvoering: [...template.sections.uitvoering],
    afwerking: [...template.sections.afwerking],
  };
}
