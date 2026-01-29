---
description: # Database Debugger Workflow
---

# Debug Workflow

Description: Proactively scan codebase for tech debt, risks, and potential issues

Content:

## Step 1: Scan codebase
Automatically search for:

- `TODO`, `FIXME`, `HACK`, `XXX` comments
- Functions > 100 lines
- Duplicated logic across files
- Hardcoded values that should be config
- Empty catch blocks / swallowed errors
- Unused imports or variables
- Complex nested conditionals (3+ levels)
- Missing error handling
- any types in TypeScript
- Console.logs left in production code
- Outdated dependencies
- Files that have grown too large (> 500 lines)

## Step 2: Present findings one by one
```
🐛 FOUND ISSUE [1/X]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Severity: [🔴 CRITICAL / 🟠 WARNING / 🟡 WATCH]
File: [filepath:line]
Type: [category]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[code snippet]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Problem: [why this is risky]
Suggestion: [how to fix]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Commands: fix | log | skip | stop
```

## Step 3: Handle response

**"fix"** → Implement the fix. Then:
```
🔨 Fixed. Test in app.
Reply: confirm | retry | revert
```
After confirm → next issue.

**"log"** → Append to `tech_debt.md`:
```
## [DATE] - [severity emoji]
**File:** [filepath:line]
**Type:** [category]
**Problem:** [description]
**Suggestion:** [fix]
```
Then → next issue.

**"skip"** → Next issue.

**"stop"** → Respond "🛑 Debug session ended. Found [X] issues, fixed [Y], logged [Z]." and STOP.

## Step 4: Complete
When all issues processed:
```
✅ SCAN COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Found: [X] issues
Fixed: [Y]
Logged: [Z]
Skipped: [W]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```