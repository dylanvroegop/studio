---
description: Import materials from materialadd.md to material-list.md
---

1.  **Read Source File**: Read the contents of `src/lib/materialadd.md`. This file contains a newline-separated list of new material names.
2.  **Read Destination File**: Read the contents of `src/lib/material-list.md`. This file contains a JSON array of existing materials.
3.  **Process and Append**:
    *   Parse the list from `materialadd.md`.
    *   Parse the JSON from `material-list.md`.
    *   For each new material in the list, create a JSON object `{"materiaalnaam": "Material Name"}` and append it to the array.
    *   Ensure the JSON structure is valid.
4.  **Write Changes**: Write the updated JSON array back to `src/lib/material-list.md`.
    *   **CRITICAL**: You MUST preserve the existing formatting and character encoding.
    *   Do NOT escape non-ASCII characters (e.g., `é` should stay `é`, not `\u00e9`; `µ` should stay `µ`, not `\u03bc`).
    *   If using Python, use `json.dump(..., ensure_ascii=False, indent=2)`.
5.  **Verify**: Check that the number of items in `material-list.md` has increased by the number of lines in `materialadd.md`.
6.  **Cleanup**: Clear the content of `src/lib/materialadd.md` (make it empty) to prevent duplicate imports in the future.
7.  **Check for Duplicates**: Scan the final list in `src/lib/material-list.md` for duplicate `materiaalnaam` entries. If found, remove the duplicates (keeping one instance) and save the file again (respecting the encoding rules from step 4). Report the number of duplicates removed.
