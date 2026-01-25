---
description: # Database Debugger Workflow
---

### OPDRACHT: Volledige Permissie Herstel-operatie
Mijn dashboard en client-info geven nog steeds 'insufficient permissions'. Voer nu de ultieme check uit:

1. **Code Audit**: Scan alle bestanden in `src/` op Firestore queries (zoek naar `collection`, `doc`, `where`). 
2. **Schema Matching**: Vergelijk deze queries met de huidige `firestore.rules`. 
3. **Fix & Sync**: 
   - Voeg de ontbrekende regels toe voor `users`, `counters`, `klanten` en subcollecties.
   - Zorg dat de `match` paden 100% overeenkomen met hoe de app de data aanroept.
4. **Deploy**: Voer direct `npx firebase deploy --only firestore:rules` uit.