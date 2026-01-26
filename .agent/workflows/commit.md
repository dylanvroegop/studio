---
description: # Commit Workflow
---

- **Trigger:** `/commit`
- **Description:** Stages all changes, generates an AI commit message, and pushes to main.

## Steps
1. **Analyze:** Look at all staged and unstaged changes to understand the technical context.
2. **Stage:** Run `git add .` to ensure everything is included.
3. **Draft Message:** Construct a professional, unique commit message that highlights specific file changes (e.g., updates to `startup-check.ts` or `n8n` logic).
4. **Execute:** Run `git commit -m "[Generated Message]"` followed by `git push origin main`.
5. **Report:** Confirm the commit hash and the message used to the user.