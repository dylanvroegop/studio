import json

source_file = 'src/lib/official_materiallist.json'
output_file = 'update_ids.sql'

try:
    with open(source_file, 'r') as f:
        data = json.load(f)
    
    with open(output_file, 'w') as f:
        count = 0
        for item in data:
            if 'id' in item and 'materiaalnaam' in item:
                # Escape single quotes in materiaalnaam for SQL
                name = item['materiaalnaam'].replace("'", "''")
                id_val = item['id']
                # Create the update statement
                sql = f"UPDATE main_material_list SET id = '{id_val}' WHERE materiaalnaam = '{name}';\n"
                f.write(sql)
                count += 1
    
    print(f"Generated {count} update statements in {output_file}")
    
except Exception as e:
    print(f"Error: {e}")
