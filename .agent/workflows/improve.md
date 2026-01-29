---
description: improvements-app
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

Commands: go | wait | skip | invalid
```

Then STOP and WAIT for user input. Do not proceed until user responds.

## Step 3: Handle user response

**"go"** → Research the codebase, make a plan, and implement. After done: `UPDATE app_ontwikkeling SET status = 'completed' WHERE id = [id]`

**"wait"** → Run: `UPDATE app_ontwikkeling SET status = 'wait' WHERE id = [id]` → Respond "Moved to waitlist." → Go to Step 1

**"skip"** → Run: `UPDATE app_ontwikkeling SET status = 'skipped' WHERE id = [id]` → Go to Step 1

**"invalid"** → Run: `UPDATE app_ontwikkeling SET status = 'invalid' WHERE id = [id]` → Go to Step 1

## Step 4: After implementation

Ask: "Done. Next? (yes/no)"
If yes → Go to Step 1