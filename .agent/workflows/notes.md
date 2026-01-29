---
description: 
---

# Notes Workflow

Description: Process manual improvement notes and bugs from personal_improvements.md

Content:

## Step 1: Read notes file

Read the file `personal_improvements.md` in the project root or src folder.

Parse the first item that does NOT have `[DONE]`, `[SKIP]`, `[WAIT]`, or `[RULES]` in its title.

If no items found: respond "✅ All notes processed!" and STOP.

## Step 2: Present and STOP

**DO NOT research the codebase yet. Just present:**

```
📝 NOTE | Priority: [priority] | Type: [type]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Title: [title]
Page: [page]

Description: [description]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commands: go | plan | done | wait | skip | rules [msg]
```

Then STOP and WAIT for user input.

## Step 3: Handle user response

**"go"** → Research the codebase, implement the fix/feature. Then go to Step 4.

**"plan"** → Research the codebase and propose a solution, but DO NOT edit any code. Present the plan and ask:
```
📋 PROPOSED SOLUTION
━━━━━━━━━━━━━━━━━━━━
[Describe what you found and how you would fix it]

[List the files that would need changes]

[Explain the approach]

━━━━━━━━━━━━━━━━━━━━
Commands:
  execute → Implement this plan now
  wait    → Save for later
  skip    → Don't do this
  next    → Move to next note without changes
```
Then STOP and WAIT. Do not edit any files.

**"done"** → Change title to `## [DONE] Title` → Go to Step 1

**"wait"** → Change title to `## [WAIT] Title` → Go to Step 1

**"skip"** → Change title to `## [SKIP] Title` → Go to Step 1

**"rules [message]"** → Insert into supabase_optimalisaties, change title to `## [RULES] Title` → Go to Step 1

## Step 4: MANDATORY USER CONFIRMATION

After implementing code changes, show this message:

```
🔨 Implementation complete. Code changes made.

⏸️ WAITING FOR YOU TO TEST IN THE APP

Reply:
  confirm → Working, mark as done
  retry   → Not working, try again
  revert  → Undo changes, skip this
```

### ⛔ CRITICAL RULES - READ CAREFULLY:

1. **NEVER decide yourself that something is "already implemented" or "already works"**
2. **NEVER mark an item as done without user typing "confirm"**
3. **NEVER skip the confirmation step**
4. **NEVER verify the implementation yourself - only the USER can test in the real app**
5. **NEVER fetch the next item until user confirms**

Even if you see code that looks correct, even if you think the feature exists, even if you verified the logic - YOU MUST WAIT FOR THE USER TO TEST AND CONFIRM.

The user will type ONE of these commands:
- **"confirm"** → Change title to `## [DONE] Title` → Ask "Next? (yes/no)"
- **"retry"** → User will explain what's wrong. Try a different approach. Return to Step 4.
- **"revert"** → Undo changes, change title to `## [SKIP] Title` → Go to Step 1

**DO NOTHING ELSE. JUST WAIT.**