---
description: improvements-app
---

# Improve App Workflow

Description: Process AI-suggested app/UI improvements from Supabase

Content:

## Step 1: Fetch next pending improvement

Use the Supabase MCP to fetch ONE pending app improvement, prioritizing "hoog" first:

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

If no results, respond: "✅ No pending app improvements found. Queue is empty!"

## Step 2: Analyze and present

**CRITICAL WARNINGS:**
- These suggestions come from an AI agent in n8n that does NOT have access to the codebase
- The agent may hallucinate or suggest changes to things that don't exist
- ALWAYS verify the actual current implementation before planning changes
- Check if referenced files, functions, components actually exist

Parse the `ontwikkeling` JSONB column. It contains an array of improvement objects with fields like:
- `github_issue_titel` - title of the suggestion
- `feature_request` - detailed description
- `prioriteit` - priority level

Present in this format:

```
📋 APP IMPROVEMENT #[id]
━━━━━━━━━━━━━━━━━━━━━━━━

🎯 SUGGESTION
Title: [github_issue_titel]
Priority: [prioriteit]
Request: [feature_request]

🔎 VERIFICATION
[Check if this suggestion is valid]
[Does the referenced component/page exist?]
[Is the suggested change actually needed or already implemented?]

📝 IMPLEMENTATION PLAN
[Step-by-step plan if valid, or explanation why invalid]

⚠️ CONCERNS
[Any risks or issues to watch out for]
```

## Step 3: Wait for decision

Wait for user input:

- **"go"** or **"proceed"** → Execute the plan
- **"skip"** → Mark as completed without implementing, fetch next
- **"invalid"** → Mark as completed (suggestion was wrong), fetch next
- **"modify [instructions]"** → User provides adjusted requirements

## Step 4: Execute and complete

**If proceeding:**
1. Implement the changes
2. After successful implementation, mark as completed:
   ```sql
   UPDATE app_ontwikkeling SET status = 'completed' WHERE id = [row_id]
   ```
3. Offer to commit: "Changes implemented. Run /commit?"

**If skipping or invalid:**
1. Mark as completed:
   ```sql
   UPDATE app_ontwikkeling SET status = 'skipped' WHERE id = [row_id]
   ```
   or for invalid:
   ```sql
   UPDATE app_ontwikkeling SET status = 'invalid' WHERE id = [row_id]
   ```
2. Immediately fetch the next pending improvement (return to Step 1)

## Step 5: Continue

After completing an improvement, ask:
"Done. Next improvement? (yes/no)"

If yes → return to Step 1