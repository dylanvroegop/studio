# First-Time Default Bootstrap

This project now supports first-time default seeding for:

- Firestore `presets`
- Supabase `main_material_list`

The source of truth is one dedicated template account.

## Required Environment Variables

Set these in your runtime environment:

- `DEFAULT_TEMPLATE_UID`
- `DEFAULT_PRESET_PACK_VERSION`
- `DEFAULT_MATERIAL_PACK_VERSION`

Fallback for template UID is also supported via `TEMPLATE_UID`, but `DEFAULT_TEMPLATE_UID` is preferred.

## Flow

1. Build/edit default presets while logged in as the template account.
2. Keep template materials in Supabase under `main_material_list.gebruikerid = DEFAULT_TEMPLATE_UID`.
3. On first login, users hit `POST /api/onboarding/bootstrap-defaults`.
4. The bootstrap copies template materials and presets to the user account if needed.
5. A completion marker is stored in Firestore:
   `users/{uid}.systemBootstrap.defaultPackV1`.

## Operational Notes

- Dashboard triggers bootstrap automatically for authenticated users.
- `GET /api/materialen/get` also triggers bootstrap as a self-heal when user materials are empty.
- Material fallback clone paths now only clone from the template UID, never from arbitrary user rows.
