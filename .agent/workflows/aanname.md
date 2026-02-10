---
description: /aanname
---

I have overhauled the workflow. The "rules" command is now a high-powered automation path: it links the klus_type from your assumption directly to the JSON in the klus_regels table, proposes a plan, and then updates the database.

Improve Klus Aannames Workflow (v2: Auto-Rules)
Step 1: Fetch ONE assumption
Run this query via Supabase MCP:

SQL
SELECT * FROM klus_aannames 
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
Step 2: Present and STOP
DO NOT research yet. Just present:

📋 AANNAME #[id] | Priority: [prioriteit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: [titel]
Job Type: [klus_type] (linked to KLUS_REGELS)
Logic: [aanname_omschrijving]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commands: rules | go | done | wait | skip | invalid
STOP and WAIT for user input.

Step 3: Handle User Response
COMMAND: "rules" (The Auto-Updater)
Fetch: Get the current JSON from klus_regels where slug (or name) matches the klus_type from the assumption.

Plan: Present a "Change Plan":

Current Formula: [Existing line from JSON]

Proposed Formula: [Fixed line based on assumption]

Reasoning: [Short explanation]

STOP: Ask "Execute update? (yes/no)".

Action: If "yes", UPDATE klus_regels with the new JSON. Go to Step 4.

OTHER COMMANDS:
"go" → Manual code implementation (non-JSON changes). Go to Step 4.

"done" → UPDATE klus_aannames SET status = 'completed' → Go to Step 1.

"wait/skip/invalid" → Update status accordingly → Go to Step 1.

Step 4: MANDATORY USER CONFIRMATION
📐 KLUS_REGELS updated in Supabase.

⏸️ WAITING FOR CALCULATION VERIFICATION

Reply:
  confirm → Logic correct, mark as completed
  retry   → Calculation error, try again
  revert  → Undo changes, skip this
"confirm" → UPDATE klus_aannames SET status = 'completed' → Ask "Next? (yes/no)"

"retry" → Adjust logic. Return to Step 4.

"revert" → Roll back klus_regels change, set status to skipped.