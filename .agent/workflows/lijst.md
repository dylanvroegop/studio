---
description: 
---

Step 1: The Precision Audit Loop
The AI performs these steps internally for every row where status IS NULL:

Fetch Row: Get the oldest pending row (including the slotkey column).

Fetch Rules: Retrieve the JSONB from KLUS_REGELS for the row's klus_type.

Targeted Mapping: Use the slotkey from the row to find the exact sub-section in the rules (e.g., checking only the afwerkplaat rules for Gipsplaten).

Action:

If it matches the slot logic: Automatically UPDATE materiaallijst_check SET status = 'verified' and move to the next row.

If it DOES NOT match: Stop and proceed to Step 2.

Step 2: Present Discrepancy (ONLY on Error)
If a mismatch is found within the specific slot, the AI presents this report:

Plaintext
⚠️ AUDIT DISCREPANCY: Item #[id]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Material: [materiaal]
Type:     [klus_type]
Slot:     [slotkey] 

Current Calculation (hoe_berekend):
"[hoe_berekend]"

Rule Requirement (from [slotkey]):
"[The specific rules/logic found in this slot]"

Status: ❌ ERROR FOUND
Reason: [Explain why the calculation violates the rules for this specific slot]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reply: correct | fix | skip | rule [message]
STOP and WAIT for user input.

Step 3: Simple Command Handling
Based on your reply, the AI takes the following action:

"correct": You confirm the calculation is actually right.

UPDATE materiaallijst_check SET status = 'verified' WHERE id = [id]

Return to Step 1.

"fix": The AI suggests a corrected aantal and hoe_berekend based on the proper slot logic.

If you say "done" → The AI updates the row in Supabase and returns to Step 1.

"skip": You want to bypass this item for now.

UPDATE materiaallijst_check SET status = 'skipped' WHERE id = [id]

Return to Step 1.

"rule [message]": The rule in that specific slot is wrong.

The AI updates the KLUS_REGELS for that slotkey.

The AI re-audits the row and returns to Step 2.

Step 4: Final Summary
Once all rows are processed:

"✅ Audit Finished!"

[X] Rows auto-verified (Correct mapping to slotkey).

[Y] Errors flagged for your review.

[Z] Rows fixed via the done command.