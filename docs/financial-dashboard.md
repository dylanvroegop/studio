# Financieel dashboard

De zelfstandige Excel-werkmap staat in `outputs/financial-dashboard/Financieel-dashboard.xlsx`. De 21 tabbladen bevatten brongegevens, zakelijke en privé-overzichten, belastingplanning voor 2026, bus/ombouw, doelen, werk-/reisplanning, vermogen, controles en een prognose van 36 maanden. De werkmap start zonder verzonnen persoonsgegevens of saldi. `n.b.` betekent dat een noodzakelijke invoer ontbreekt.

## Eerste ingebruikname

1. Open Studio, synchroniseer Knab en bunq en klik bij Banktransacties op **Financiële export**. De knop is onderdeel van de lokale codewijziging en is pas op productie beschikbaar na deployment.
2. Pak de ZIP uit. Bewaar deze als origineel: `snapshot.json` bevat oorspronkelijke transacties; de CSV-bestanden kunnen ook in Excel via Gegevens → Van tekst/CSV of Power Query worden geladen. Excel krijgt geen bankcredentials.
3. Sluit de werkmap in Excel. Importeer de snapshot met onderstaande opdracht. Een backup van de werkmap en een kopie van de snapshot blijven bewaard.
4. Vul in **Settings & Assumptions** bij Accounts per rekening type, openingssaldo en datum in. Het openingssaldo is het geboekte saldo aan het eind van die datum. Controleer het geselecteerde geboekte eindsaldo. De importer vult alleen bekende geboekte saldosoorten in; anders kies je het juiste saldo uit `balances.csv`.
5. Zet `include` alleen op 1 voor rekeningen die meetellen. Dubbele koppelingen van dezelfde fysieke rekening mogen niet beide meetellen. Zet `coverage` alleen op 1 wanneer de transacties tussen begin en einde volledig zijn. Controleer het verschil in **Data Quality & Reconciliation**. Meer dan twaalf bronrekeningen blokkeert import expliciet totdat de rekeningtabel en controles zijn uitgebreid.
6. Vul onbekende transactieclassificaties, factuurbedragen exclusief btw, btw-behandeling, aftrekbare voorbelasting, betaalstatus en investeringsclassificatie aan. Studio bewaart niet voor iedere factuur een apart netto- en btw-bedrag. Deze worden nooit met een aangenomen 21%-tarief ingevuld.
7. Bevestig vervolgens de vier broncontroles. Formulecontroles houden bank-, factuur- en kostencijfers alsnog tegen bij onvolledige essentiële velden. Vul nul expliciet in voor afwezige schulden, activa, betaalde belasting en reserves. Leeg betekent onbekend.

```bash
/Users/dylanvroegop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  /Users/dylanvroegop/Documents/studio/outputs/financial-dashboard/import.mjs \
  /volledig/pad/naar/snapshot.json
```

Een optioneel derde argument kiest een andere werkmap. De lokale dependency-symlink verwijst naar de gebundelde Codex-runtime. De werkmap zelf werkt zonder Node, Studio of internet; alleen een nieuwe import gebruikt dit script. Bewerk nooit dezelfde werkmap tegelijk met Excel en het importscript.

## Herhaalde import

De importer voegt banktransacties samen op stabiele sleutel en voorkomt opnieuw meetellen van overlappende exports. Afwijkend bedrag of valuta bij dezelfde sleutel stopt de import. Mogelijke dubbelen met verschillende sleutels worden gemeld, niet stil verwijderd: twee identieke betalingen kunnen legitiem zijn. De oorspronkelijke snapshot blijft beschikbaar.

De kolommen category, subcategory, vat_treatment, classification, recurring en notes blijven op transactie-ID behouden. Exacte tegenpartijregels in Settings worden alleen op nieuwe transacties toegepast. Een nieuwe regel verandert geen historie. Bewezen transfers tussen eigen rekeningen blijven interne transfers. Facturen en kosten worden vernieuwd vanuit de volledige nieuwe snapshot. Handmatig aangevulde ontbrekende netto-/btw-bedragen en fiscale classificaties blijven behouden.

Na iedere import staan broncontroles en rekeningdekking opnieuw uit. De export ververst de bank niet en bewijst geen volledige historie. Exportdatum is niet hetzelfde als laatste banksynchronisatie. Bewaar maandafsluitingen voor begin-/eindsaldo en historisch nettovermogen.

## Berekeningen

- Omzet komt uitsluitend uit uitgereikte facturen, exclusief concepten en annuleringen. Een bijbehorende bankbetaling is uitsluitend cashflow. Kosten komen uit de kostenadministratie; bankafschrijvingen worden daar niet nogmaals bij opgeteld.
- Privéconsumptie sluit interne transfers en privéonttrekkingen uit. Classificatie `owner_transfer` is een vermogensverschuiving van de ondernemer.
- Vrije cash = banksaldi − overige schulden − open leveranciers − resterende belasting − unieke reserves. De belastingpot is al onderdeel van banksaldo en wordt niet nogmaals afgetrokken naast de belastingverplichting. Open klantfacturen zijn geen cash.
- Nettovermogen = bank + niet-contante activa + klantvorderingen − schulden − leveranciers − belasting. Spaardoelen zijn geen extra activa of schulden.
- €650 per dag is een omzetaanname. Netto werkdag = maximaal nul of omzet minus variabele kosten en toegerekende vaste kosten, daarna verminderd met het planningspercentage IB/Zvw. Lege kostenaannames blokkeren werkdagenberekeningen.
- De prognose start met werkelijke totale banksaldi. Werkdagen, reizen, investeringen, busbetalingen en belastingbetalingen worden per maand ingevoerd, inclusief bewuste nullen. Omzet en kosten zijn exclusief btw; netto btw-cashmutaties moeten expliciet worden ingevoerd. Ontvangst in dezelfde maand is een zichtbare aanname; verschuif vertraagde betalingen met extra cashflow.
- Eén scenariokeuze rekent het hele 36-maandsmodel opnieuw. De scenariofactoren zijn bewerkbaar; 12-, 24- en 36-maandsuitkomsten zijn formules. De werk-/reisvergelijking en busvarianten staan daarnaast als afzonderlijke eenvoudige scenariovergelijkingen in tabellen.

## Belastingafbakening

De belastingraming gebruikt configureerbare tarieven voor **2026, vóór AOW**. De Belastingdienst-bronnen staan in Dutch Taxes. Zelfstandigenaftrek, startersaftrek en MKB-vrijstelling worden alleen bij een expliciete toepassingskeuze gebruikt. KIA, heffingskortingen, ander box-1-inkomen, betaalde/ingehouden belasting en bijzondere correcties zijn persoonlijke invoer. De tariefcorrectie op ondernemersaftrek/MKB is zichtbaar.

De vereenvoudigde Zvw-berekening gaat niet uit van een al elders benutte bijdragegrondslag. Box 3, fiscale partnerverdeling, verliesverrekening, buitenlandse of gemengde btw en bijzondere situaties worden niet automatisch bepaald. Vul daarvoor bevestigde correcties in of laat de tax-scopecontrole uit. De toekomstige cashprognose gebruikt geplande belastingbetalingen en de vrijheidsberekening een expliciete reserveaanname; zij beweert geen fiscale berekening voor 2027–2029 te zijn.

## Controle en resterende verificatie

Gerichte tests dekken gebruikersafbakening, paginering boven 500 transacties, CSV-formule-injectie, ontbrekende bedragen, interne overboekingen, duplicaten en behoud van correcties. De werkmap heeft formulecontroles en gerenderde controles per tabblad. De verificatiescript test ontbrekende gegevens, netto dagopbrengst, de drie prognosescenario’s en een aankoop in een latere maand. Native Microsoft Excel en een geauthenticeerde export van de echte rekeninggegevens moeten nog in de gebruikersomgeving worden doorlopen. Er is niets gedeployed.

Handmatige bronnen blijven nodig voor projecturen, niet-contante waarderingen, volledig bevestigde abonnementen, fiscale keuzes en openingsstanden. De werkmap doet geen claims over doelkansen: er is geen onderbouwd statistisch kansmodel.
