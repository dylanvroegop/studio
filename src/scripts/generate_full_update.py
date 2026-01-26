import json
import os

KEYS_TO_UPDATE = [
    'aantal', 'aantal_strips', 'afmeting', 'afwerking', 'artikelnummer', 'deurmaat',
    'diameter_doorvoer', 'diameter_inwendig', 'diameter_naar', 'diameter_schaal',
    'diameter_uitwendig', 'diameter_van', 'eenheid', 'formaat', 'gewicht', 'glas',
    'hellingshoek', 'hoek', 'inhoud', 'kenmerk', 'kleur', 'kokerlengte', 'kozijnmaat',
    'laagdikte', 'maat', 'maatcode', 'manchet', 'materiaal', 'maximale_hoogte', 'merk',
    'methode', 'model', 'netto_maat', 'oppervlakte', 'ponds', 'profiel', 'rd_waarde',
    'rol_lengte', 'sponning', 'toepassing', 'type', 'uitsparing_maat', 'uitvoering',
    'verbruik', 'verkoop_eenheid', 'verpakking', 'voeding', 'voorzijde', 'vorm',
    'wanddikte', 'werkend', 'zijde'
]

# Map specific keys if the JSON key is slightly different (e.g. ' ponds' space issue mentioned in previous turn)
# The analyze script output clean names, so I'll check the raw JSON handling
KEY_MAPPING = {
    'ponds': ' ponds', 
    'prijs_incl_btw': 'prijs_incl_21%_btw' # Already there but good to keep in mind
}

def sanitize_key(k):
    # This matches the mapping used in analyze_keys aka creation script
    return k.strip().replace('%', '').replace(' ', '_').lower()

def escape_val(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def main():
    file_path = '/Users/dylanvroegop/Documents/studio/src/lib/official_materiallist.json'
    if not os.path.exists(file_path):
        print("Error: File not found")
        return

    with open(file_path, 'r') as f:
        data = json.load(f)

    # We need to construct a massive UPDATE FROM VALUES query
    # columns: materiaalnaam, [all keys]
    
    # Header for the script
    
    # We will loop through chunks
    batch_size = 200
    current_batch = []
    
    for item in data:
        mat_name = item.get('materiaalnaam')
        if not mat_name:
            continue
            
        # Check if this item has ANY relevant data to update
        # (Though we might just update all matching rows regardless to be safe/consistent)
        
        row_values = [escape_val(mat_name)]
        has_data = False
        
        for k in KEYS_TO_UPDATE:
            # Try exact match first
            val = item.get(k)
            # Try mapped key
            if val is None and k in KEY_MAPPING:
                val = item.get(KEY_MAPPING[k])
                
            # If still None, check if the sanitized version of a key in the item matches
            # (e.g. JSON has "Type " with space)
            if val is None:
                # Naive search - inefficient but okay for 1400 items once
                # Actually, let's just stick to straight keys for now and assumes sanitization meant keys are close
                # But ' ponds' has a leading space.
                pass
            
            # Special case for ' ponds' which became 'ponds'
            if k == 'ponds' and val is None:
                val = item.get(' ponds')

            if val is not None:
                has_data = True
            
            row_values.append(escape_val(val))
            
        if has_data:
            current_batch.append("(" + ", ".join(row_values) + ")")
            
        if len(current_batch) >= batch_size:
            print_update_query(current_batch)
            current_batch = []
            
    if current_batch:
        print_update_query(current_batch)

def print_update_query(batch_values):
    # Construct the SET clause
    # set col = COALESCE(v.col, t.col)
    set_clauses = []
    
    for k in KEYS_TO_UPDATE:
        # Quote the column name to be safe
        col = f'"{k}"'
        set_clauses.append(f"{col} = v.{col}::text")
        
    set_str = ",\n    ".join(set_clauses)
    
    # Construct the column definitions for the VALUES clause
    # v(materiaalnaam, col1, col2...)
    # All are text
    col_defs = ["materiaalnaam"] + [f'"{k}"' for k in KEYS_TO_UPDATE]
    col_defs_str = ", ".join(col_defs)
    
    values_str = ",\n    ".join(batch_values)
    
    sql = f"""
UPDATE main_material_list AS t
SET
    {set_str}
FROM (VALUES
    {values_str}
) AS v({col_defs_str})
WHERE t.materiaalnaam = v.materiaalnaam;
"""
    print(sql)

if __name__ == '__main__':
    main()
