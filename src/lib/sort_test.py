import json
import re
import os

# Paths
json_path = 'src/lib/official_materiallist.json'
md_path = 'src/lib/material_name_and_id.md'
test_output_path = 'src/lib/material_name.md'

def extract_num(text):
    """Handles decimals like 3.2mm and integers like 18mm."""
    match = re.search(r'(\d+(\.\d+)?)', str(text))
    return float(match.group(1)) if match else 0.0

def sync_and_organize():
    if not os.path.exists(json_path) or not os.path.exists(md_path):
        print("Error: Files missing in src/lib/")
        return

    # 1. Map Polished Names from MD
    name_map = {}
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = [l.strip() for l in f.readlines() if l.strip()]
    for i in range(1, len(lines)):
        if re.match(r'^[a-zA-Z0-9]{5,10}$', lines[i]): # ID detection
            name_map[lines[i]] = lines[i-1]

    # 2. Load the full 60-column JSON
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 3. Update Names & Sort
    # We use .get() to avoid errors if a column is missing in one row
    for item in data:
        item_id = item.get('id')
        if item_id in name_map:
            item['materiaalnaam'] = name_map[item_id]

    data.sort(key=lambda x: (
        str(x.get('categorie', '')).lower(),
        # Split name by first number to group "Okoume" together regardless of size
        re.split(r'\d', str(x.get('materiaalnaam', '')))[0].strip().lower(),
        extract_num(x.get('dikte', '0')),
        extract_num(x.get('lengte', '0'))
    ))

    # 4. Save the full JSON (all columns preserved)
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # 5. Export formatted 'Test' MD
    with open(test_output_path, 'w', encoding='utf-8') as f:
        current_cat = ""
        for item in data:
            if item.get('categorie') != current_cat:
                current_cat = item['categorie']
                f.write(f"\n# {current_cat}\n\n")
            f.write(f"{item.get('materiaalnaam')}\n{item.get('id')}\n\n")

    print(f"Done! {len(data)} items organized across all categories.")

if __name__ == "__main__":
    sync_and_organize()