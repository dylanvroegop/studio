# Boodschappenlijst (privé)

De materiaallijst en boodschappenlijst gebruiken dezelfde `ChecklistHome`,
`ChecklistDetail` en API-handlers. Alleen labels, URL's en collectienamen
verschillen. De tab staat naast Materiaallijst en in de navigatie.

| | Materiaallijst | Boodschappenlijst |
| --- | --- | --- |
| App | `/materiaallijsten` | `/boodschappenlijst` |
| Lijsten | `material_lists` | `grocery_lists` |
| Regels | `material_list_items` | `grocery_list_items` |
| Telegram-invoer | `/api/material-lists/telegram` | `/api/grocery-lists/telegram` |
| Openstaande regels | `/api/material-lists/reminder` | `/api/grocery-lists/reminder` |

De gedeelde regels behouden het bestaande veld `material_list_id`. Bij
boodschappen verwijst dit uitsluitend naar `grocery_lists`. De Firestore-regels
controleren dezelfde eigenaar als bij materialen. Op 15 september 2026 zijn
alleen de nieuwe boodschappenregels aan de bestaande live regels toegevoegd.

## n8n

- Bron: `Telegram materiaallijst`, workflow `wadI3Mkx1FZmkmXR`.
- Kopie: `boodschappenlijst`, workflow `WUZV4SnYH214qRvt`.
- De 11 nodes, verbindingen, Nederlandse spraaktranscriptie, invoer en
  bevestigingen zijn overgenomen. De opslag-URL's en bevestigingstekst verwijzen
  naar boodschappen. De OpenAI-credential blijft dezelfde.
- Er is geen nieuw tijdschema toegevoegd: de bronworkflow bevat alleen tekst-
  en spraakinvoer. De herinnerings-API is wel op dezelfde manier beschikbaar.
- `scripts/copy-grocery-workflow.cjs` maakt de kopie reproduceerbaar. Nieuwe
  node- en webhook-ID's voorkomen hergebruik van de bestaande bot-webhook.
  Telegram-credentials worden bij het kopiëren verwijderd; de kopie blijft
  ongepubliceerd totdat de nieuwe bot is gekoppeld.
- Exports bevatten de bestaande webhook-authenticatieheader. Bewaar ze buiten
  git. De scripts zelf bevatten geen secrets.

## Laatste koppeling

Het nieuwe credentialformulier **Boodschappenlijst privé** staat klaar in n8n.
De gebruiker vult de bot-token in en slaat de credential op. Selecteer diezelfde
credential vervolgens bij alle vier Telegram-nodes: ontvangen, spraak downloaden,
spraak bevestigen en tekst bevestigen. n8n kan bij het openen van een node
automatisch een bestaande credential voorstellen; controleer daarom alle vier.

De app-wijzigingen moeten op `app.calvora.nl` zijn uitgerold voordat de workflow
wordt gepubliceerd. Open daarna één keer Boodschappenlijst om de algemene lijst
aan te maken (de lijst van de eigenaar is tijdens de lokale controle al aangemaakt).
Test na publicatie één tekstbericht en één spraakbericht met de nieuwe bot.

## Uitgevoerde controles

- TypeScript en gerichte ESLint: geslaagd.
- Gedeelde API-tests: gescheiden opslag, authenticatie, invoercontrole,
  dubbele levering, selectie van open regels en juiste lijstlinks.
- Vergelijking met de echte workflow-export: alle 11 nodes behouden; opgeslagen
  n8n-kopie opnieuw gedownload en parameters, verbindingen en credentials gecontroleerd.
- Browser op desktop en 390 × 844: tabwisseling, toevoegen, afvinken, archief,
  terugzetten en mobiel toevoegen gecontroleerd.
- Lokale Telegram-API met echte opslag: eerste verzoek opgeslagen, herhaling
  als duplicaat herkend, regel direct in de browser zichtbaar.
- Drie eigen testregels zijn na afloop verwijderd. Bestaande materialen zijn
  behouden. Ontvangst en verzending via de nieuwe bot wachten op de token.

```sh
node --test scripts/checklists.test.cjs
MATERIAL_WORKFLOW_EXPORT='/pad/naar/Telegram materiaallijst.json' node --test scripts/checklists.test.cjs
```
