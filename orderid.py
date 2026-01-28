import json

FILE_PATH = 'src/lib/material_category_name_test.json'

def reindex_and_cleanup():
    with open(FILE_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Original count: {len(data)}")

    # Overwrite order_id based on the NEW physical position in the array
    for index, item in enumerate(data):
        item['order_id'] = index

    with open(FILE_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

    print(f"✅ Re-indexed {len(data)} items. The JSON is now sequential.")

if __name__ == "__main__":
    reindex_and_cleanup()