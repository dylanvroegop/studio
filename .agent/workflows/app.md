---
description: /app
---

# Improve App Workflow

Description: Process app improvements from Supabase queue

Content:

## Step 1: Fetch ONE improvement

Run this query via Supabase MCP:

```sql
SELECT * FROM app_ontwikkeling 
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
```

If no results: respond "✅ Queue empty!" and STOP.

## Step 2: Present and STOP

**DO NOT research the codebase yet. DO NOT analyze files. Just present:**

```
📋 IMPROVEMENT #[id] | Priority: [prioriteit]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Title: [github_issue_titel]

Request: [feature_request]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ This is an AI suggestion - may be invalid

Commands: go | wait | skip | invalid | rules [msg] | split [msg]
```

Then STOP and WAIT for user input.

## Step 3: Handle user response

**"go"** → Research the codebase, implement. Then go to Step 4.

**"wait"** → `UPDATE app_ontwikkeling SET status = 'wait' WHERE id = [id]` → Go to Step 1

**"skip"** → `UPDATE app_ontwikkeling SET status = 'skipped' WHERE id = [id]` → Go to Step 1

**"invalid"** → `UPDATE app_ontwikkeling SET status = 'invalid' WHERE id = [id]` → Go to Step 1

**"rules [message]"** → Insert into supabase_optimalisaties, `UPDATE app_ontwikkeling SET status = 'forwarded_to_rules' WHERE id = [id]` → Go to Step 1

**"split [message]"** → Insert into supabase_optimalisaties, then implement app part. Go to Step 4.

## Step 4: MANDATORY USER CONFIRMATION

After implementing code changes:

```
🔨 Implementation complete. Code changes made.

⏸️ WAITING FOR YOU TO TEST IN THE APP

Reply:
  confirm → Working, mark as completed
  retry   → Not working, try again
  revert  → Undo changes, skip this
```

**CRITICAL: DO NOT verify the implementation yourself. DO NOT check if it works. DO NOT update Supabase status. DO NOT fetch the next item. ONLY the user can confirm.**

**You MUST stop here and wait for the user to type "confirm", "retry", or "revert".**

**"confirm"** → `UPDATE app_ontwikkeling SET status = 'completed' WHERE id = [id]` → Ask "Next? (yes/no)"

**"retry"** → User will explain what's wrong. Try a different approach. Return to Step 4.

**"revert"** → Undo changes, `UPDATE app_ontwikkeling SET status = 'skipped' WHERE id = [id]` → Go to Step 1