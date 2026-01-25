---
name: Database Debugger
description: Guide for safely debugging Firestore rules and Supabase schema issues.
---

# Database Debugger Skill

Use this skill when the user encounters "Missing or insufficient permissions" errors or data consistency issues.

## 1. Firestore Debugging Checklist
If the user encounters a Firestore error:
1.  **Read Rules:** IMMEDIATELY use `view_file` to read `firestore.rules`.
2.  **Analyze Paths:** Match the failing document path (e.g., `offertes/123/materialen/abc`) against the rule structure.
3.  **Check Auth:** Verify if the rule requires `request.auth != null`.
4.  **Check Data Fields:** Look for `.data` validation (e.g., `request.resource.data.keys().hasAll(['...'])`).

## 2. Common Pitfalls
- **Recursive Wildcards:** `{document=**}` is often needed for subcollections but can be dangerous.
- **Type Mismatches:** Firestore `numbers` vs JS `strings`.
- **Undefined Fields:** Sending `undefined` instead of `null` (Firestore rejects undefined).

## 3. Supabase Debugging
If the issue relates to Supabase:
1.  **Check Client:** Verify the `supabase` client initialization in `src/lib/supabase.ts` (or similar).
2.  **RLS Policies:** Remind the user to check Row Level Security (RLS) policies on the Supabase dashboard if queries return empty arrays unexpectedly.

## 4. Resolution Protocol
- **Do NOT** blindly disable rules (allow write: if true).
- **Propose** specific line edits to `firestore.rules`.
- Use the `firebase` emulator suite if available to test changes safely.
