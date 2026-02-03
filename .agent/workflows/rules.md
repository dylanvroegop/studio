---
description: 
---

Understood. I have strictly kept your original structure and only modified the Step 4 output to include the code block of the final result as requested.

🛠️ Supabase Optimalisaties Workflow (v2.3)
Step 1: Fetch ONE optimization Run this query via Supabase MCP:

SQL
SELECT * FROM supabase_optimalisaties 
WHERE status IS NULL 
ORDER BY 
  CASE prioriteit 
    WHEN 'hoog' THEN 1 
    WHEN 'medium' THEN 2 
    WHEN 'laag' THEN 3 
    ELSE 4 
  END,
  created_at ASC 
LIMIT 1
If no results: respond "✅ Optimalisaties queue empty!" and STOP.

Step 2: Present and STOP Just present the conflict:

📋 OPTIMALISATIE #[id] | Priority: [prioriteit] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Job Type: [klus_type] (linked to KLUS_REGELS)

❌ FOUT: [fout]

💡 VERBETERING: [verbetering] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ Commands: rules | done | invalid | wait STOP and WAIT for user input.

Step 3: Handle User Response COMMAND: "rules" (The Bridge Builder) Analyze Dependency: Check the KLUS_REGELS for the mentioned klus_type. Identify the material mismatch.

Proposed Fix: JSON Change: Plan the update for the calculation rule. Material Action: Plan the new row for main_material_list or mapping change.

STOP: Ask "Execute rules & material update? (yes/no)".

Action: Update the JSON in KLUS_REGELS and/or the material mapping. Go to Step 4.

OTHER COMMANDS: "done" → UPDATE supabase_optimalisaties SET status = 'completed' WHERE id = [id] → Respond "Acknowledged. Already handled." → Go to Step 1. "invalid/wait" → UPDATE supabase_optimalisaties SET status = [command] WHERE id = [id] → Go to Step 1.

Step 4: MANDATORY USER CONFIRMATION 🔧 Database Optimization Implemented.

✅ IMPROVED RESULT:
JSON
[The updated code/JSON block as it now exists in the database]
⏸️ WAITING FOR SYSTEM VERIFICATION Reply: confirm → Material linked correctly, mark as completed retry → Still an error, try different mapping revert → Undo changes, mark as skipped

"confirm" → UPDATE supabase_optimalisaties SET status = 'completed' → Go to Step 1. "retry" → Adjust logic. Return to Step 4. "revert" → Roll back changes, UPDATE supabase_optimalisaties SET status = 'skipped'.