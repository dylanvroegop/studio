# Klantgesprekken

De nieuwe pagina staat op `/klantgesprekken`, bereikbaar via **Klantgesprekken** in het linkerzijmenu en mobiele menu. Alle bediening staat op deze pagina. De bestaande klant- en offertepagina’s krijgen geen extra opnameknoppen.

## Gebruik

1. Kies een bestaand klantdossier, een onderwerp en eventueel een bijbehorende conceptofferte.
2. Bevestig dat de klant instemt met opnemen en verwerking door AI. Start daarna de opname.
3. Houd Safari zichtbaar en het scherm ontgrendeld. Pauzeer, hervat of stop met de knoppen in de pagina.
4. Na stoppen worden de lokaal opgeslagen audiofragmenten geüpload en wordt de verwerking in de wachtrij gezet. Een mislukte upload kan opnieuw worden gestart vanaf de lokale opname.
5. Bekijk **Beschrijving**, **Projectgegevens** en **Transcript**. De oorspronkelijke transcriptie blijft ongewijzigd. Bronverwijzingen openen het relevante transcriptfragment; audio wordt alleen na een geauthenticeerd verzoek geladen.
6. Controleer projectgegevens en zet alleen afgesproken gegevens op **Bevestigd** en **Gecontroleerd**. Minstens één werkzaamheid moet bevestigd en gecontroleerd zijn.
7. Maak een conceptofferte of voeg de gegevens toe aan de geselecteerde, ongestuurde conceptofferte. Bestaande notities blijven behouden. Herhaald klikken opent dezelfde offerte.

De vrije beschrijving kan onzekerheden bevatten en wordt daarom niet als definitieve scope gekopieerd. De overdracht bewaart gecontroleerde scope, oorspronkelijke maten/eenheden, materialen en overige bevestigde feiten in de bestaande offertenotities, plus een gestructureerde bronkopie. In de offerte blijven de bestaande calculatie en AI-knop bij Werk & Levering beschikbaar. Er worden geen prijzen verzonnen en geen offertes verzonden. Wijzigingen ná overdracht worden niet stilzwijgend opnieuw naar de offerte geschreven.

## Architectuur

- Firebase Authentication-token op iedere API-aanroep; eigenaar en exacte klant/offertekoppeling worden server-side gecontroleerd.
- `client_meetings/{uuid}` bevat metadata, ontvangsttijdstip van de toestemmingsbevestiging, status, revisie en verslag. Subcollecties `chunks` en `transcripts` bevatten audio-metadata en transcriptfragmenten.
- Firebase Storage bewaart audio onder `client-meetings/{uid}/{uuid}/{index}`. Geen downloadtokens of publieke URL’s. De browser heeft geen rechtstreekse toegang tot deze Storage- of Firestore-paden.
- Uploads zijn herhaalbaar en create-only, met SHA-256-verificatie. De server accepteert maximaal 12 MiB per fragment, valideert volgorde/aansluiting en begrenst op 90 minuten.
- De browser legt tijdens opnemen periodiek audio vast in IndexedDB en sluit korte, zelfstandig afspeelbare opnamedelen af. MediaRecorder-timeslice-fragmenten worden nooit individueel als volledig audiobestand behandeld.
- `scripts/client-meetings-worker.ts` verwerkt de duurzame Firestore-wachtrij los van webrequests. Transacties claimen een lease; voltooide transcriptfragmenten worden hergebruikt na een fout of herstart. Na drie mislukte pogingen verschijnt een herstartknop. Verwijdermarkeringen verhinderen dat een vertraagde worker een verwijderd gesprek terugzet.
- Bestaande OpenAI-sleutel en REST-aanpak worden hergebruikt. De volledige transcriptie gaat naar schema-gevalideerde projectanalyse. Exacte citaten worden gecontroleerd; AI-risico’s en ontbrekende informatie hebben een eigen aanduiding. Alle AI-gegevens starten zonder handmatige goedkeuring.
- Standaard `gpt-transcribe` voor meertalige transcriptie met bouwtermen. Tijden zijn opnameniveaus per fragment, geen verzonnen woordtijden. Optioneel ondersteunt `gpt-4o-transcribe-diarize` sprekerlabels en fijnere tijden. Sprekerlabels zijn dan uitsluitend binnen hetzelfde fragment geldig; beschikbaarheid/deprecatie moet vóór modelkeuze worden gecontroleerd.
- Offertecreatie en nummerreservering zijn één Firestore-transactie. De bestaande offertevoorkeuren zijn gedeeld via `buildEmptyQuoteDefaults`; handmatige offertes gebruiken dezelfde helper.

## Configuratie en activering

De webapp alleen starten/deployen start **geen worker**. Zonder worker blijven uploads veilig in de wachtrij; de pagina meldt dat verwerking nog niet verbonden is.

| Variabele | Waar | Betekenis |
| --- | --- | --- |
| `OPENAI_API_KEY` | Webapp en worker | Bestaande server-side sleutel. Nooit `NEXT_PUBLIC_` gebruiken. |
| `FIREBASE_PROJECT_ID` | Worker en eventueel webapp | Bestaand project; de applicatieconfiguratie bevat al de fallback. |
| `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Alleen waar geen ADC beschikbaar is | Bestaande Admin SDK-configuratie. Gebruik bij hosting bij voorkeur Application Default Credentials. |
| `FIREBASE_STORAGE_BUCKET` | Optioneel beide | Standaard de bucket uit `src/firebase/config.ts`. |
| `MEETING_WORKER_ENABLED=true` | Webapp | Geef pas na workerinstallatie aan dat achtergrondverwerking is geconfigureerd. De pagina controleert daarnaast een actuele worker-heartbeat. |
| `OPENAI_MEETING_TRANSCRIPTION_MODEL` | Optioneel worker | Standaard `gpt-transcribe`. |
| `OPENAI_MEETING_ANALYSIS_MODEL` | Optioneel worker | Standaard `OPENAI_MODEL`, anders `gpt-5.5`, overeenkomstig de bestaande AI-integratie. |

Lokale start vanuit de repository:

```sh
npm run dev
```

Worker in een tweede proces:

```sh
npm run meetings:worker
```

Een enkele verwerkings-/opschoningsronde:

```sh
npm run meetings:worker -- --once
```

De worker leest lokaal `.env.local`. Productie: voer hetzelfde commando uit op een beheerde Node 20+-worker met automatische herstart en blijvende CPU, dezelfde codeversie en servercredentials. Installeer ook `ts-node` (de bestaande devDependency, bijvoorbeeld `npm ci --include=dev`). Gebruik geen los gestart achtergrondproces in een Next.js-request of een HTTP-container die na het antwoord wordt stilgezet. De worker kan ook als herhaalde taak met `--once` draaien, mits de uitvoering voldoende tijd krijgt voor een hele opname. De lease beveiligt overlappende workers.

Benodigde bestaande IAM-rechten: toegang tot de relevante Firestore-documenten en lezen/schrijven/verwijderen van objecten in de private bucket. Geef geen publieke bucketrechten. Installeer de gewijzigde Firestore- en Storage-regels met de gebruikelijke Firebase-deployment. Er is geen SQL-migratie of nieuwe samengestelde index nodig; de nieuwe collecties ontstaan bij gebruik. Stel daarna `MEETING_WORKER_ENABLED` in de hostingomgeving in en deploy de webapp. Deze stappen worden niet automatisch door deze codewijziging uitgevoerd.

## Bewaartermijn en verwijderen

- Online audio, transcript en verslag verlopen 30 dagen na aanmaak. De API weigert daarna toegang; de worker verwijdert de inhoud. Bij een gestopte worker vindt fysieke opschoning plaats zodra deze weer draait.
- Een handmatige verwijdering blokkeert onmiddellijk toegang. Bij een opslagstoring blijft opschoning in de wachtrij. Een minimale verwijdermarkering met eigenaar/id/tijdstip blijft staan om vertraagde uploads te blokkeren.
- Gecontroleerde gegevens die al naar een offerte zijn gekopieerd blijven onderdeel van die offerte, ook als het gesprek wordt verwijderd. Dit staat in de bevestigingsdialoog.
- Lokale audio dient als herstelkopie op het gebruikte apparaat. Verwijder die via de opnamebediening wanneer die niet meer nodig is; wissen van browserdata verwijdert eveneens die kopie. Lokale verslagconcepten verlopen tegelijk met het online gesprek en worden bij terugkeer opgeschoond.
- OpenAI-verwerking verloopt server-side; de Responses-aanroep gebruikt `store:false`. Dit stelt geen eigen bewaartermijn bij de AI-provider vast. De toestemmingsmelding noemt opname en AI-verwerking; maak geen juridische garantie over providerretentie.

## Grenzen en verificatie

Safari kan de microfoon onderbreken bij achtergrondgebruik, schermvergrendeling of telefoongesprekken. De UI pauzeert bij waargenomen onderbrekingen en probeert het scherm wakker te houden als de browser dat ondersteunt. Er wordt geen achtergrondopname beloofd. Een harde browser-/OS-stop kan het laatste nog niet opgeslagen of nog niet afgesloten fragment aantasten. Herstel verwerkt een onafgesloten bestand alleen wanneer het decodeerbaar is; anders blijft het voor download beschikbaar en wordt geen ongemerkt onvolledige analyse gemaakt. Korte segmentovergangen kunnen de transcriptie rond een woordgrens beïnvloeden. Controleer kritieke maten altijd met de audio.

Transcripties boven de expliciete analysegrens worden geweigerd; er wordt geen stilzwijgend afgekapt verslag opgeslagen. Eén gebruiker kan de pagina verlaten tijdens serververwerking en later terugkeren. De worker moet daarvoor actief zijn.

Gerichte checks:

```sh
npm run test:meetings
npm run test:meetings:recorder
npm run typecheck
git diff --check
```

De recordertest gebruikt geïsoleerde Chromium-profielen, echte IndexedDB en een gesimuleerde microfoon; daarnaast controleert hij of echte MediaRecorder-fragmenten afzonderlijk decodeerbaar zijn. Er worden geen klantgegevens of AI-verzoeken verstuurd. Op macOS gebruikt hij de geïnstalleerde Chrome; elders is een bestaande Playwright Chromium-installatie nodig. `MEETING_TEST_CHROME_PATH` kan een bestaande browser aanwijzen.

Uitgevoerd op 7 oktober 2026: 25 server-/overdrachtstests, 10 recordercontroles, de TypeScript-controle, gerichte ESLint-controle en productiebuild slagen. Alle tien API-methoden/routes geven zonder authenticatie HTTP 401. De browser wordt zonder ingelogde sessie naar `/login` gestuurd. Er zijn geen live klantgesprekken naar OpenAI verzonden of productiegegevens aangemaakt; Firebase-regels en worker zijn met deze wijziging nog niet uitgerold.

Vóór productieacceptatie op een echte iPhone: 15–90 minuten Nederlands/Engels bouwgesprek; schermvergrendeling, binnenkomend gesprek, appwissel, microfoonweigering, netwerkuitval, herladen tijdens upload, workerherstart, twee gelijktijdige verwerkingspogingen, verwijderen tijdens verwerking en een andere ingelogde gebruiker. Controleer ook `80 cm — nee, 82 cm`, meerdere klussen, vrijblijvende opties en een nog onbekende afwerking. Een geslaagde build of gesimuleerde test bewijst deze hardware- en productiegedragingen niet.

Technische bronnen: [OpenAI transcriptie](https://developers.openai.com/api/docs/guides/speech-to-text), [MDN MediaRecorder-fragmenten en Safari-onderbrekingen](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event), [MDN Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).
