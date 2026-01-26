import json
import os

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
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            print("Error: Invalid JSON")
            return

    values = []
    
    target_cols = ['hoogte', 'diameter']
    
    count = 0
    for item in data:
        mat_name = item.get('materiaalnaam')
        if not mat_name:
            continue
            
        has_update = False
        row_vals = {}
        
        # Check if we have useful data to update
        for col in target_cols:
            val = item.get(col)
            if val:
                has_update = True
                row_vals[col] = val
            else:
                row_vals[col] = None
        
        if has_update:
            v_name = escape_val(mat_name)
            v_hoogte = escape_val(row_vals['hoogte'])
            v_diameter = escape_val(row_vals['diameter'])
            
            # Note: We cast explicitly to ensure type matching in the VALUES clause
            values.append(f"({v_name}::text, {v_hoogte}::text, {v_diameter}::text)")
            count += 1

    if not values:
        print("-- No updates found")
        return

    batch_size = 200
    for i in range(0, len(values), batch_size):
        batch = values[i : i + batch_size]
        vals_str = ", ".join(batch)
        
        # We assume materiaalnaam is unique enough or we want to update all matches
        sql = f"""
UPDATE main_material_list AS t
SET
    hoogte = COALESCE(v.hoogte, t.hoogte),
    diameter = COALESCE(v.diameter, t.diameter)
FROM (VALUES
    {vals_str}
) AS v(materiaalnaam, hoogte, diameter)
WHERE t.materiaalnaam = v.materiaalnaam;
"""
        print(sql)

if __name__ == '__main__':
    main()
