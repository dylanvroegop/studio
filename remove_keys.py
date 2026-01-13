
import json

file_path = '/Users/dylanvroegop/Documents/studio/src/lib/ai-agent-mapping-n8n.json'

try:
    with open(file_path, 'r') as f:
        data = json.load(f)

    # Process each item in the list
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                # Remove 'slug' if present
                if 'slug' in item:
                    del item['slug']
                
                # Remove 'category_key' if present (user mentioned 'category-key' but file has 'category_key')
                if 'category_key' in item:
                    del item['category_key']
                
                # Just in case user really meant 'category-key' with hyphen
                if 'category-key' in item:
                    del item['category-key']

    with open(file_path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print("Successfully removed 'slug' and 'category_key' from the file.")

except Exception as e:
    print(f"Error processing file: {e}")
