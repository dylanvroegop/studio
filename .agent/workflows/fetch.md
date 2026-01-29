---
description: 
---

# Fetch Notes Workflow

Description: Fetch personal notes from Supabase and append to personal_improvements.md

Content:

## Step 1: Fetch all notes
Run this query via Supabase MCP:
```sql
SELECT id, created_at, notes FROM notes ORDER BY created_at ASC
```

If no results: respond "📭 No new notes to fetch." and STOP.

## Step 2: Filter and format
Skip any notes starting with `/` (commands like /clear).

Group remaining notes by date and format as:
```
## YYYY-MM-DD
- [note content]
- [note content]
```

## Step 3: Append to personal_improvements.md
Add the formatted notes to the end of `personal_improvements.md`.

## Step 4: Clear processed notes from Supabase
Delete the fetched notes:
```sql
DELETE FROM notes WHERE id IN ([comma-separated ids from Step 1])
```

## Step 5: Confirm
```
✅ Fetched [X] notes → personal_improvements.md
🗑️ Cleared notes table
```