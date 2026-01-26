# ⚡ Workflow: Simulate Job Calculation
**Trigger:** `/makejob` (Random Job Selection)

## DOEL
Simuleer een volledige calculatie voor een **willekeurig geselecteerde klus** uit de `JOB_REGISTRY`. Dit test de robuustheid van de logica over verschillende categorieën heen.

## STAPPENPLAN

1. **Random Job Selectie**
   - Lees `src/lib/job-registry.ts` en parse het `JOB_REGISTRY` object.
   - Verzamel ALLE beschikbare slugs (bijv. `hsb-voorzetwand`, `dakrenovatie-hellend`, `vlonder-terras`, etc.).
   - **Kies WILLEKEURIG** één slug uit deze lijst.
   - Toon de gekozen Job Titel en Slug.
   - Haal de bijbehorende `materialSections` en `measurements` op.

2. **Random Input Generatie**
   - Verzin realistische waarden voor de `measurements` (bijv. Lengte: 4500mm, Hoogte: 2600mm).
   - Toon deze input duidelijk aan het begin.

3. **Material Mapping & Calculatie**
   - Loop door elke sectie in `materialSections`.
   - **Zoek Materiaal:** Query de `materialen` tabel (via `execute_sql`) op basis van `categoryFilter`. Selecteer EEN willekeurig passend materiaal uit de database.
   - **Bereken Aantal:** Pas "Construction Logic" toe op basis van de verzonnen afmetingen:
     - *Hout/Regelwerk:* Schatting o.b.v. h.o.h. afstand (bijv. 600mm) en lengte.
     - *Platen:* Oppervlakte + 15% zaagverlies.
     - *Isolatie:* Oppervlakte.
     - *Stuks:* (Bijv. deuren/kozijnen) = 1 (of logisch aantal).

4. **Rapportage**
   - Genereer een "Offerte" tabel in Markdown format:
   - | Categorie | Onderdeel | Gekozen Materiaal | Aantal | Eenheid | Prijs/st | Totaal |
   - Toon ook een Totaalprijs onderaan.

## RESULTAAT
- Een eenmalige, gesimuleerde materiaallijst voor de gekozen klus.
- Bewijst dat de mapping tussen `job-registry` en database werkt.