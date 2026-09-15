export type ChecklistKind = 'materials' | 'groceries';

export const CHECKLIST_CONFIG = {
  materials: {
    lists: 'material_lists',
    items: 'material_list_items',
    route: '/materiaallijsten',
    title: 'Materiaallijst',
    defaultTitle: 'Mijn materiaallijst',
    noun: 'materiaal',
    itemLabel: 'Materiaal',
    plural: 'materialen',
    placeholder: 'Bijv. zwarte kit',
    nameLabel: 'Materiaalnaam',
  },
  groceries: {
    lists: 'grocery_lists',
    items: 'grocery_list_items',
    route: '/boodschappenlijst',
    title: 'Boodschappenlijst (privé)',
    defaultTitle: 'Mijn boodschappenlijst',
    noun: 'product',
    itemLabel: 'Product',
    plural: 'producten',
    placeholder: 'Bijv. melk',
    nameLabel: 'Productnaam',
  },
} as const;
