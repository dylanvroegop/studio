
# Walkthrough - Adding Aftimmering to Lichtkoepel

I have updated the `Lichtkoepel` job configuration to include an "Aftimmering" section, similar to the "Velux Dakraam" job.

## Changes

### 1. Updated `LICHTKOEPEL_MATS` in `src/lib/job-registry.ts`

- **Separated Roof Finishing**: Moved the existing "Dakbedekking" to a new category key `afwerking_dak` to keep it distinct from interior finishing.
- **Added Interior Finishing**: Added two new material sections:
    - `Interieur afwerking` (Key: `betimmering`)
    - `Plinten` (Key: `plinten`)
    - Both use the `afwerking` category, which is standard for interior finishing (Aftimmering).

```typescript
const LICHTKOEPEL_MATS: MaterialSection[] = [
  { label: 'Lichtkoepel', categoryFilter: 'Lichtkoepels', category: 'koepel', key: 'koepel', category_ultra_filter: '' },
  { label: 'Opstand Houtbalk of Prefab Set', categoryFilter: 'Lichtkoepels, Vuren hout', category: 'opstand', key: 'opstand', category_ultra_filter: '' },
  // Roof finishing now uses 'afwerking_dak'
  { label: 'Dakbedekking', categoryFilter: 'Epdm, Dakrollen', category: 'afwerking_dak', key: 'dakbedekking', category_ultra_filter: '' },
  // New Interior sections
  { label: 'Interieur afwerking', categoryFilter: 'Interieur Platen, Afwerking', category: 'afwerking', key: 'betimmering', category_ultra_filter: '' },
  { label: 'Plinten', categoryFilter: 'Afwerking', category: 'afwerking', key: 'plinten', category_ultra_filter: '' },
];
```

### 2. Updated Job Configuration

- Updated the `categoryConfig` for the `lichtkoepel` job to reflect these changes.
- **Aftimmering** is now the last section (Order 4).

```typescript
        categoryConfig: {
          koepel: { title: 'Koepel', order: 1 },
          opstand: { title: 'Opstand', order: 2 },
          afwerking_dak: { title: 'Dakafwerking', order: 3 }, // Corresponds to Dakbedekking
          afwerking: { title: 'Aftimmering', order: 4 },      // Corresponds to Interieur/Plinten
        },
```

## Verification

You should now see the following sections on the "Lichtkoepel" materials page:
1.  **Koepel**
2.  **Opstand**
3.  **Dakafwerking** (containing Dakbedekking)
4.  **Aftimmering** (containing Interieur afwerking and Plinten)
