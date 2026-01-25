# Ultimate Audit Report - Offertehulp
**Datum:** 25 januari 2026  
**Workflow:** /workflow - Ultimate Audit

## Executive Summary

De audit heeft **1 kritieke bug** en **2 potentiële inconsistenties** gevonden in de materiaalnaam-consistentie tussen Supabase, n8n workflows en de frontend.

---

## 🔴 KRITIEKE BUG: Verkeerde kolomnaam in PDF-generator

### Locatie
`src/app/api/offerte/generate/route.ts` - Regel 108

### Probleem
De code probeert materialen op te halen uit Supabase met:
```typescript
.in('id', Array.from(materialIdsToBeFetched));
```

**Maar de Supabase tabel `materialen` gebruikt `row_id` als primary key, niet `id`.**

### Impact
- Materialen worden **NIET** correct opgehaald uit Supabase tijdens PDF-generatie
- Materialnamen worden niet verrijkt met volledige details
- PDF's kunnen verkeerde of ontbrekende materiaalnamen bevatten
- Prijzen kunnen ontbreken of verkeerd zijn

### Oplossing
✅ **OPGELOST** - Wijzig regel 108 van:
```typescript
.in('id', Array.from(materialIdsToBeFetched));
```

Naar:
```typescript
.in('row_id', Array.from(materialIdsToBeFetched));
```

En wijzig regel 115 om `row_id` te gebruiken als key:
```typescript
materialMap.set(m.row_id, { ...m, prijs: isNaN(pr) ? 0 : pr, prijs_per_stuk: isNaN(prStuk) ? 0 : prStuk });
```

**Status:** ✅ Gefixed op 25 januari 2026

---

## ⚠️ INCONSISTENTIE 1: Veldnaam-verschil tussen n8n en Supabase

### Probleem
- **Supabase tabel `materialen`:** gebruikt veld `materiaalnaam`
- **n8n workflow output:** gebruikt veld `materiaal` (zie "Material calculator + Work description" workflow)
- **Frontend:** gebruikt `materiaalnaam` bij opslaan

### Locaties
- n8n workflow `jNsZ7b8Vwc5FsLcg` ("Material calculator + Work description"):
  - Regel 246: `materiaal: item.materiaal`
  - Regel 267: `"materiaal": "{{ $json.product }}"`
  - Regel 447: `materiaal: mainItem.materiaal`

### Impact
- Wanneer n8n materialen terugstuurt met `materiaal`, maar de frontend verwacht `materiaalnaam`, kan dit parsing-problemen veroorzaken
- PDF-generatie kan verkeerde veldnamen gebruiken

### Oplossing
**Optie A (Aanbevolen):** Standaardiseer op `materiaalnaam` in n8n workflows
- Update alle n8n workflows om `materiaalnaam` te gebruiken in plaats van `materiaal`

**Optie B:** Maak de frontend flexibel
- Accepteer zowel `materiaal` als `materiaalnaam` in de frontend parsing logic

---

## ⚠️ INCONSISTENTIE 2: ID-veld mapping in Firestore vs Supabase

### Probleem
- **Firestore quotes:** Materialen worden opgeslagen met `id` veld (verwijst naar Supabase `row_id`)
- **Supabase:** Primary key is `row_id`, niet `id`
- **API route:** Probeert te queryen op `id` in plaats van `row_id`

### Locaties
- `src/app/api/offerte/generate/route.ts` regel 89: `if (sel?.id) materialIdsToBeFetched.add(sel.id);`
- `src/firestore_schema.md` regel 123: `id: string; // DB ID`

### Impact
- Als Firestore `id` bevat die verwijst naar Supabase `row_id`, dan moet de query `.in('row_id', ...)` gebruiken
- Huidige code gebruikt `.in('id', ...)` wat niet werkt

### Oplossing
Zie kritieke bug hierboven - dit is hetzelfde probleem.

---

## ✅ POSITIEVE BEVINDINGEN

1. **Supabase `klus_regels` tabel:** Bevat 4 actieve klus types met gedetailleerde calculation rules:
   - Knieschotten
   - HSB Voorzetwand
   - HSB Buiten Wand
   - Metalstud Wand

2. **n8n Workflow structuur:** 
   - "KLUS_REGELS" workflow (actief) haalt correct regels op uit Supabase
   - "Webhook N8n" workflow (actief) verwerkt materialen correct
   - "Material calculator + Work description" workflow bevat uitgebreide logica

3. **Frontend consistentie:**
   - Gebruikt consistent `materiaalnaam` bij opslaan
   - Material selection modal gebruikt correcte veldnamen

---

## 📋 AANBEVOLEN ACTIES

### Prioriteit 1 (Kritiek)
1. ✅ **Fix Supabase query in `/api/offerte/generate/route.ts`** - **VOLTOOID**
   - ✅ Wijzig `.in('id', ...)` naar `.in('row_id', ...)`
   - ✅ Wijzig `materialMap.set(m.id, ...)` naar `materialMap.set(m.row_id, ...)`
   - ⚠️ Test PDF-generatie na fix (nog te testen)

### Prioriteit 2 (Hoog)
2. ⚠️ **Standaardiseer veldnamen tussen n8n en Supabase**
   - Besluit: gebruik `materiaalnaam` overal
   - Update n8n workflows om `materiaalnaam` te gebruiken
   - Of: maak frontend flexibel voor beide veldnamen

### Prioriteit 3 (Medium)
3. 📝 **Documentatie update**
   - Update `firestore_schema.md` om duidelijk te maken dat `id` verwijst naar Supabase `row_id`
   - Voeg commentaar toe in code over ID-mapping

4. 🧪 **Test suite**
   - Voeg unit tests toe voor materiaalnaam-consistentie
   - Test PDF-generatie end-to-end met verschillende materialen

---

## 🔍 DETAILS: Database Scan Resultaten

### Supabase `klus_regels` Tabel
- **Totaal records:** 4 actieve klus types
- **Laatste update:** 24 januari 2026
- **Status:** ✅ Actief en up-to-date

### Supabase `materialen` Tabel
- **Kolommen:** `row_id` (UUID, primary key), `materiaalnaam`, `prijs`, `eenheid`, `subsectie`, `leverancier`, `gebruikerid`, `volgorde`, `aangemaakt_op`, `prijs_per_stuk`
- **Sample data:** 20 materialen gevonden met correcte `materiaalnaam` formaten
- **Status:** ✅ Structuur is correct, maar API gebruikt verkeerde kolomnaam

### n8n Workflows Status
- **Actieve workflows:** 6
  - "Webhook N8n" (7oOMhnpaayrU31EL) - ✅ Actief
  - "KLUS_REGELS" (nl2PYHUilIBpfpsb) - ✅ Actief
  - "RESEARCH VERBRUIK AGENT" (Hvwno55rBuJ8YXxB) - ✅ Actief
  - "add rows supabase" (JVjReiRx9Du7irX9) - ✅ Actief
  - "delete rows supabase" (MjgtFJhHxaQi7fzO) - ✅ Actief
  - "supabase fetch materials" (qrEsilRokzgmUX09) - ✅ Actief

- **Inactieve workflows:** 16 (waaronder "Material calculator + Work description")

---

## 📊 Frontend Match Analyse

### Material Name Usage in Frontend
- ✅ `src/app/materialen/page.tsx`: Gebruikt `materiaalnaam` consistent
- ✅ `src/components/MaterialSelectionModal.tsx`: Gebruikt `materiaalnaam` bij opslaan
- ✅ `src/app/offertes/[id]/klus/[klusId]/[category]/[slug]/materialen/page.tsx`: Gebruikt `materiaalnaam` in Firestore opslag
- ⚠️ `src/app/api/offerte/generate/route.ts`: Probeert materialen op te halen met verkeerde kolomnaam

---

## 🎯 Conclusie

De belangrijkste bevinding is de **kritieke bug in de PDF-generator** die materialen niet correct ophaalt uit Supabase. Dit moet onmiddellijk worden opgelost.

Daarnaast is er een **veldnaam-inconsistentie** tussen n8n (`materiaal`) en Supabase/Frontend (`materiaalnaam`) die kan leiden tot parsing-problemen.

Na het oplossen van deze issues zal de materiaalnaam-consistentie tussen Supabase en de n8n PDF-generator volledig zijn.
