# Telegram-workflow: gecontroleerd herstel op 15 september 2026

Workflow: `auto making client` (`Xal6adg1neOkMczi`).

## Vastgestelde oorzaak

Uitvoering 1580, 15 september om 13:23, gaf vanuit Calvora `success: true`,
een klant-ID en offerte-ID terug, maar `appointment_status: none` en
`telegram_message: null`. Telegram verstuurde vervolgens letterlijk `null`.
`If2` bevatte een expressie met tekstspaties vóór `{{ ... }}` en losse
typeconversie. De bedoelde controle hield deze reactie niet tegen.

Geen voorstel is een geldige uitkomst: de Calvora-planner zoekt binnen
1–4 dagen en kan geen vrije plek vinden. Daarom mag ontbreken van een
voorsteltekst niet als mislukte klantimport worden behandeld. De precieze
reden waarom uitvoering 1580 geen voorstel kreeg, is niet vastgesteld.

Uitvoering 1584 om 15:20 las de bevestiging correct uit, maar vond drie
Supabase-sessies voor dezelfde klant, contactgegevens en klus. De controle op
precies één resultaat wees alle drie af. De foutnode verstuurde daardoor drie
meldingen. De daaropvolgende agenda-aanmaak om 15:24 was een handmatige
hersteluitvoering, geen vertraagd herstel van de mislukte uitvoering.

## Gepubliceerde wijzigingen

- Strikte succescontrole op boolean `success` plus geldige klant- en offerte-ID's.
- Een bruikbare terugmelding als voorsteltekst ontbreekt; afzonderlijke tekst
  voor een bestaande bevestigde afspraak, een voorstel of geen voorstel.
- De eerste import verstuurt één JSON-object met echte nulls. Namen met
  aanhalingstekens of nieuwe regels breken de JSON niet meer.
- Ontbrekende sessie of onvoldoende klantidentiteit stopt de import.
- Alleen de eerste, afspraakloze Calvora-import krijgt maximaal drie pogingen,
  met dezelfde sessiesleutel en een timeout van 30 seconden per poging.
  Aanmaken van Supabase-rijen en Google Agenda-afspraken krijgt geen retries.
- Foutuitgangen van AI, klantopslag, klantopzoeking, agendalezen, planning en
  import leiden naar de bestaande Telegram-foutmelding.
- Geen eenduidige klantmatch geeft een melding, zonder eindeloze wachtroute.
- Lege klant- en agendaresultaten gaan door naar de bestaande controle/code.
- De planner controleert 60 minuten, overeenkomstig het opgeslagen agendablok,
  en stopt als geen vrij blok bestaat. Bevestigde tijden blijven behouden.
- De herinnering na twee dagen start uitsluitend na bevestigde import.
- Iedere inzending zoekt eerst een bestaande sessie. Meerdere rijen worden
  alleen samengenomen bij overeenkomstige contactgegevens en klus, zonder
  conflicterende identiteit. Bevestigde sessies krijgen voorrang; anders wordt
  de meest recente passende sessie gebruikt. Bestaande gegevens blijven behouden.
- Nieuwe klanten gaan via aanmaken naar dezelfde afspraakcontrole. Een
  onduidelijke match stopt eenmaal; de foutnode draait eenmaal per invoerset.
- Een bestaande agenda-afspraak op de opgegeven dag wordt herkend via de
  sessiemarkering of de bestaande klant-, telefoon- en werkregels. Opnieuw
  verwerken werkt die afspraak bij. Meerdere passende afspraken geven een fout.

Laatste gepubliceerde versienaam: **Bestaande klant en agenda-afspraak hergebruiken**.

## Regressiecontrole

De reproduceerbare wijziging staat in `scripts/harden-telegram-workflow.cjs`.
Dit is een gerichte migratie van de onderzochte export, geen algemene reparatie
van willekeurige latere versies. Hij stopt als de verwachte planningscode wijzigt.

```sh
node --test scripts/harden-telegram-workflow.test.cjs
TELEGRAM_WORKFLOW_EXPORT=/pad/naar/oorspronkelijke-export.json node --test scripts/harden-telegram-workflow.test.cjs
```

Met de oorspronkelijke export slagen 13 tests. Zonder export draaien de acht
zelfstandige tests van importvalidatie, berichten en expressies.

In n8n zelf zijn daarnaast 13 synthetische reacties door dezelfde If-expressie
gestuurd: 9 geldige imports en 4 ongeldige imports. Beide controle-nodes gaven
`PASS`; er waren nul null-berichten. Alleen de geïsoleerde handmatige testtak
draaide, zonder klantopslag, Telegram-verzending of Google Agenda-wijzigingen.
Daarna zijn alle testnodes verwijderd.

De vervolgmigratie staat in `scripts/resolve-telegram-session.cjs`. Deze neemt
de export na de eerste reparatie als invoer. Voer de migraties niet opnieuw
over een al gemigreerde export uit.

```sh
node --test scripts/resolve-telegram-session.test.cjs
TELEGRAM_WORKFLOW_EXPORT=/pad/naar/export-na-eerste-reparatie.json node --test scripts/resolve-telegram-session.test.cjs
```

Met die export slagen 17 tests; zonder export draaien 16 zelfstandige tests.
Deze dekken onder andere drie identieke sessies, tegenstrijdige contactgegevens,
behoud van bevestigingen, telefoonnormalisatie en hergebruik van agenda-afspraken.

De correcte AI-uitvoer uit uitvoering 1584 is vervolgens opnieuw verwerkt met
de echte Supabase-, Calvora- en Google Agenda-stappen. Drie sessies werden één
match. De afspraak voor 19 september 2026 van 19:00 tot 20:00 is opgeslagen in
Calvora en Google Agenda, met één succesmelding in de Telegram-chat van de
eigenaar. Een tweede verwerking via de update-node behield hetzelfde agenda-ID
en de oorspronkelijke aanmaaktijd. Daarbij is geen tweede succesbericht verstuurd.

De uiteindelijke download is vergeleken met de geteste configuratie: 29 nodes,
overeenkomstige parameters, credentials en verbindingen, geen testnodes en geen
vastgezette replaygegevens. De editor bevestigde `Published`.

## Grenzen van deze controle

De herstelcontrole hergebruikte de aantoonbaar correcte AI-uitlezing; ontvangst
en beeldherkenning zijn niet opnieuw uitgevoerd. Oude dubbele sessies zijn
bewaard. Reeds wachtende uitvoeringen kunnen hun oude configuratie behouden.
Gelijktijdige eerste inzendingen zijn niet met een databasevergrendeling beschermd.
Agendahergebruik zoekt binnen de opgegeven dag; verplaatsen naar een andere dag
is hiermee niet bewezen. Herhaal bij een fout niet blind de hele workflow:
controleer eerst welke opslagstappen zijn voltooid.

Volledige n8n-exports bevatten bestaande authenticatieheaders. Bewaar ze privé
en voeg ze niet toe aan git. De migratiescriptcode en tests bevatten geen secrets.
