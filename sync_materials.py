import json
import re
import os

# File paths
json_path = 'src/lib/official_materiallist.json'
md_path = 'src/lib/material_name_and_id.md'

def extract_thickness(text):
    """Extracts numerical thickness for accurate sorting (e.g., '3.2mm' -> 3.2)."""
    match = re.search(r'(\d+(\.\d+)?)', str(text))
    return float(match.group(1)) if match else 0

def update_and_sort_materials():
    if not os.path.exists(json_path) or not os.path.exists(md_path):
        print("Error: Files not found in src/lib/")
        return

    # 1. Parse Markdown to create mapping {ID: Polished Name}
    name_mapping = {}
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = [line.strip() for line in f.readlines() if line.strip()]
    
    # Iterate through lines to find ID and its preceding Name
    for i in range(1, len(lines)):
        current_line = lines[i]
        # IDs are typically short alphanumeric strings without spaces
        if re.match(r'^[a-zA-Z0-9]{5,8}$', current_line):
            polished_name = lines[i-1]
            name_mapping[current_line] = polished_name

    # 2. Load JSON data
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 3. Update names from mapping
    for item in data:
        item_id = item.get('id')
        if item_id in name_mapping:
            item['materiaalnaam'] = name_mapping[item_id]

    # 4. Sort the updated data
    # Priority: Categorie -> Name (Base) -> Dikte (Numeric)
    data.sort(key=lambda x: (
        x.get('categorie', '').lower(),
        # Sort by name but ignore the numbers at the end for grouping
        re.split(r'\d', x.get('materiaalnaam', ''))[0].strip().lower(),
        extract_thickness(x.get('dikte', '0'))
    ))

    # 5. Save the final polished JSON
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Successfully updated {len(name_mapping)} names and sorted the material list.")

if __name__ == "__main__":
    update_and_sort_materials()