import json

# Paths to your local files
MD_FILE = 'src/lib/material_name_and_id.md'
JSON_FILE = 'src/lib/official_materiallist.json'

def force_professional_names():
    # 1. Parse the Markdown file
    # We expect: Name on line 1, ID on line 2
    name_map = {}
    with open(MD_FILE, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f if line.strip()]
        
        for i in range(0, len(lines) - 1, 2):
            professional_name = lines[i]
            material_id = lines[i+1]
            name_map[material_id] = professional_name

    print(f"📖 Loaded {len(name_map)} professional names from Markdown.")

    # 2. Load the JSON file
    with open(JSON_FILE, 'r', encoding='utf-8') as f:
        json_data = json.load(f)

    # 3. Overwrite names in JSON using the ID as the key
    updated_count = 0
    for item in json_data:
        m_id = item.get('id')
        if m_id in name_map:
            item['materiaalnaam'] = name_map[m_id]
            updated_count += 1

    # 4. Save back to JSON without messing up the € symbol
    with open(JSON_FILE, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=4, ensure_ascii=False)

    print(f"✨ Finished! {updated_count} names in your JSON are now professionally formatted.")

if __name__ == "__main__":
    force_professional_names()