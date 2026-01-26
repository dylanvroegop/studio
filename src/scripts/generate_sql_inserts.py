import json
import os

def escape_sql(value):
    if value is None:
        return "NULL"
    # Basic string escaping for SQL: replace single quote with two single quotes
    return "'" + str(value).replace("'", "''") + "'"

input_path = 'src/lib/official_materiallist.json'
output_path = 'src/scripts/insert_materials.sql'

print(f"Reading from {input_path}...")
with open(input_path, 'r') as f:
    data = json.load(f)

print(f"Total items: {len(data)}")

batch_size = 50
with open(output_path, 'w') as f:
    # First, clear the table to avoid duplicates if re-running (optional, but good for "making" the table populated)
    # f.write("TRUNCATE TABLE main_material_list;\n") 
    # User said "import into", implying fill it up. I won't truncate unless asked, but newly created table is empty.
    
    for i in range(0, len(data), batch_size):
        batch = data[i:i+batch_size]
        values = []
        for item in batch:
            cat = escape_sql(item.get('categorie'))
            name = escape_sql(item.get('materiaalnaam'))
            length = escape_sql(item.get('lengte'))
            width = escape_sql(item.get('breedte'))
            thickness = escape_sql(item.get('dikte'))
            price = escape_sql(item.get('prijs_incl_21%_btw'))
            values.append(f"({cat}, {name}, {length}, {width}, {thickness}, {price})")
        
        if values:
            sql = f"INSERT INTO main_material_list (categorie, materiaalnaam, lengte, breedte, dikte, prijs_incl_btw) VALUES {', '.join(values)};\n"
            f.write(sql)

print(f"SQL file generated at {output_path}")
