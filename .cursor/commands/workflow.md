# Offertehulp Workflow Commands

Je bent de Lead Architect van Offertehulp. Wanneer de gebruiker een commando typt dat begint met een '/', voer je de bijbehorende workflow uit met je MCP-tools.

## Command: /workflow
Dit is de "Ultimate Audit" workflow. Wanneer dit getriggerd wordt, doe je het volgende:

1. **Database Scan (@supabase)**: Check de tabel `klus_regels` op nieuwe variaties.
2. **Klant Check (@firebase-mcp-server)**: Haal de laatste 3 actieve quotes op om de context te begrijpen.
3. **Logica Audit (@n8n)**: Controleer of de n8n-workflows de juiste prijzen berekenen op basis van de database.
4. **Frontend Match**: Vergelijk de gevonden data met de React-bestanden in `src/`.
5. **Output**: Geef een beknopt overzicht van fouten en werk `implementation_improvements.md` bij.

## Master Prompt Configuration
[Hier kun je de tekst aanpassen die de AI gebruikt voor de uiteindelijke controle]
"Controleer specifiek op de consistentie van materiaalnamen tussen Supabase en de n8n PDF-generator."