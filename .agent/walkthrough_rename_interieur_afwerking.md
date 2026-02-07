
# Walkthrough - Renamed 'Interieur afwerking' to 'Afwerk plaat'

I have updated the `VELUX_MATS` and `LICHTKOEPEL_MATS` arrays in `src/lib/job-registry.ts` to rename the material section label.

## Changes

### 1. Updated `VELUX_MATS` and `LICHTKOEPEL_MATS` in `src/lib/job-registry.ts`

- **Renamed Label**: Changed "Interieur afwerking" to "Afwerk plaat".
- **Keys and Filters**: The `key` ("betimmering") and `categoryFilter` ("Interieur Platen, Afwerking") remain the same to preserve functionality.

```typescript
// Example from VELUX_MATS
{ label: 'Afwerk plaat', categoryFilter: 'Interieur Platen, Afwerking', category: 'afwerking', key: 'betimmering', category_ultra_filter: '' },
```

## Verification

You should now see the "Afwerk plaat" label instead of "Interieur afwerking" in both the Velux Dakraam and Lichtkoepel material lists.
