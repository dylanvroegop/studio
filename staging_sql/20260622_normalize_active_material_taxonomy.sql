-- Normalize active catalog labels so case-only variants collapse into one
-- category/subcategory in the UI. Archived history remains untouched.
UPDATE public.main_material_list
SET categorie = upper(left(btrim(categorie), 1)) || substr(btrim(categorie), 2)
WHERE is_active = true
  AND nullif(btrim(categorie), '') IS NOT NULL;

UPDATE public.main_material_list
SET sub_categorie = upper(left(btrim(sub_categorie), 1)) || substr(btrim(sub_categorie), 2)
WHERE is_active = true
  AND nullif(btrim(sub_categorie), '') IS NOT NULL;
