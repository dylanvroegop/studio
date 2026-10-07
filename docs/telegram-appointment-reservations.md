# Telegram-afspraakvoorstellen en Google Agenda

Bijgewerkt: 7 oktober 2026.

## Gedrag

- Een nieuwe aanvraag krijgt één beschikbare datum en tijd. De oude grens van vier dagen is verwijderd. De zoekperiode wordt zo nodig uitgebreid, tot maximaal 366 dagen om een eindeloze zoeklus te voorkomen.
- Zondag is ook beschikbaar voor Telegram-werkbesprekingen, naast de ingestelde werkdagen voor klussen.
- Een agenda-item dat in Google als `vrij` (`transparent`) staat, blokkeert geen voorstel via zijn lokale planningkopie. De import controleert dit steeds met verse Google-gegevens; PENDING, Telegram-reserveringen en lopende/mislukte synchronisaties blijven beschermd. Een klus met vaste uren blokkeert uitsluitend die uren.
- De klanttekst vraagt na dat ene voorstel: “Mocht dit moment niet uitkomen, welke dag en tijd zouden u beter uitkomen?” De oude uitnodiging zonder datum wordt niet meer gebruikt.
- Vóór de voorsteltekst wordt teruggegeven, staat het moment als `PENDING` in Google Agenda. Het blok telt als bezet voor andere aanvragen.
- Een reservering verloopt niet automatisch. Bevestiging werkt hetzelfde Google-event bij en verwijdert het PENDING-label.
- Handmatige verwijdering in Google wordt bij de volgende import of agendasynchronisatie verwerkt. Calvora bewaart de annulering, zodat herhaling van dezelfde screenshot het verwijderde voorstel niet opnieuw aanmaakt.
- Gelijktijdige imports gebruiken een gedeelde Firestore-vergrendeling. Google-writes gebruiken een stabiel event-ID en een tijdelijke synchronisatievergrendeling.
- Een technische agenda- of identiteitsfout gaat naar de bestaande foutmelding aan de eigenaar; er wordt geen onbevestigd tijdslot in een klanttekst gezet.

## Productie

De negen runtimebestanden zijn oorspronkelijk uitgerold via commit `748e278f` en Vercel-deployment `6907330076`. Zondag is toegevoegd via `9da51831`. De n8n-workflow `Xal6adg1neOkMczi` is inmiddels gepubliceerd als **Vrije klusdagen blokkeren geen afspraakvoorstel**, versie `7cbe16dd-4e19-4270-90a4-116024c0c445`. Deze versie respecteert ook bij vervolgberichten vrije Google-items; de koppeling van reistijden aan agenda-items blijft intact.

De gedownloade configuratie bevat 26 nodes. Parameters, credentials, webhook-ID's en verbindingen zijn vergeleken met de geteste migratie. De losse Google-aanmaak en -update zijn uit n8n verwijderd: de Calvora-API beheert de afspraak.

De migratie staat in `scripts/reserve-telegram-appointments.cjs`. Pas deze alleen toe op de verwachte oorspronkelijke export. Volledige exports bevatten authenticatieheaders en blijven buiten git.

Voor een bestaande 26-node-export kan de losse, idempotente `excludeTransparentCalendarEvents`-transformatie op de code van `Code in JavaScript1` worden toegepast. De correctie voor de lokale kopie van vrije Google-items staat in commit `d375d7ce`, succesvol gepubliceerd als Vercel-productiedeployment `6919213772`.

## Bestaande voorstellen hersteld

Acht aantoonbaar verstuurde, nog onbevestigde voorstellen zijn onder hun oorspronkelijke afspraak-ID en datum als PENDING in Google hersteld. Vijf lokale planningrijen ontbraken; drie bestonden nog zonder Google-koppeling. Alle acht koppelingen en Google-events zijn daarna opnieuw gelezen en gecontroleerd.

| Datum | Tijd | Aantal oude voorstellen |
| --- | --- | --- |
| 8 oktober 2026 | 19:00 | 3 |
| 9 oktober 2026 | 19:00 | 3 |
| 10 oktober 2026 | 19:00 | 2 |

Dit zijn bestaande overlappende toezeggingen. Het herstel kiest geen klant en verschuift geen afspraak. De eigenaar kan de voorstellen in Google verwijderen of aanpassen na overleg.

Tijdens de overgang bleek één bevestigde afspraak zowel door de nieuwe API als door de oude n8n-stap te zijn aangemaakt. Alleen de extra kopie is verwijderd, na controle van sessie, datum, tijd en deelnemers. De oorspronkelijke gekoppelde afspraak bleef behouden. Herhaling via de productie-API gaf vervolgens HTTP 200, dezelfde afspraak-ID en `calendar_synced: true`.

## Controle

De geïsoleerde releasecontrole slaagde: 157 tests, volledige typecontrole en productiebuild. Twee tests die een afzonderlijke historische export vereisen zijn overgeslagen. De scoped lintcontrole had geen fouten en drie bestaande hookwaarschuwingen. De laatste uitbreiding van het herstelscript slaagde voor 13 tests.

De correctie voor vrije klusdagen slaagt voor 51 API-/reserveringstests en 6 workflowtests met de historische export, plus een geïsoleerde productiebuild inclusief typecontrole en schone lintcontrole. De opgeslagen n8n-export is volledig vergeleken: alleen de code van de planningsnode is gewijzigd.

Afgedekt zijn onder meer aanvragen na veertien bezette dagen, drie gelijktijdige aanvragen, herhaalde imports, bevestiging, handmatige verwijdering, synchronisatieraces en behoud van bestaande gegevens. Er zijn bij de herstel- en productiecontroles geen Telegram- of klantberichten verstuurd. De volledige ontvangst en beeldherkenning van een nieuwe Telegram-screenshot is niet opnieuw uitgevoerd.

`scripts/restore-telegram-pending-reservations.cjs` leest standaard alleen. `--apply` is uitsluitend bedoeld voor gecontroleerd herstel van bestaande legacyvoorstellen; niet voor het genereren van nieuwe voorstellen.
