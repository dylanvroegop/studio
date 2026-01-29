---
description: Import materials from materialadd.md to material-list.md
---

# Add Workflow

Description: Quickly add a note to personal_improvements.md

Content:

## How to use
# Add Workflow

Description: Quickly add a note to personal_improvements.md

Content:

## How to use

User types: `/add description`

Examples:
- `/add Fix vensterbank berekening`
- `/add Overstek veld toevoegen`
- `/add Check waarom notificaties dubbel zijn`

## Step 1: Add to file

Append to `personal_improvements.md`:

```
## description
---
```

## Step 2: Confirm

Respond:
```
✅ Added: description
```

Then STOP. Do not fetch notes, do not start processing.
User types: `/add [priority] description`

Examples:
- `/add [hoog] Fix vensterbank berekening`
- `/add [medium] Overstek veld toevoegen`
- `/add Check waarom notificaties dubbel zijn`

## Step 1: Parse the input

Extract from user message:
- **priority**: text between `[` and `]` (default to `medium` if not provided)
- **description**: everything after the priority

## Step 2: Add to file

Append to `personal_improvements.md`:

```
## [priority] description
---
```

If no priority was given:
```
## [medium] description
---
```

## Step 3: Confirm

Respond:
```
✅ Added: [priority] description
```

Then STOP. Do not fetch notes, do not start processing.