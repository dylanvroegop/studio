
UPDATE main_material_list 
SET id = staging_ids_recovery.id
FROM staging_ids_recovery
WHERE main_material_list.materiaalnaam = staging_ids_recovery.materiaalnaam
AND main_material_list.id IS NULL;

-- Also try trimmed match
UPDATE main_material_list
SET id = staging_ids_recovery.id
FROM staging_ids_recovery
WHERE TRIM(main_material_list.materiaalnaam) = TRIM(staging_ids_recovery.materiaalnaam)
AND main_material_list.id IS NULL;
