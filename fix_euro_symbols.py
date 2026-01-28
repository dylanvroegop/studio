import json

# The path to your local source of truth
file_path = 'src/lib/official_materiallist.json'

try:
    # 1. Load the "messy" data
    # We use encoding='utf-8' to make sure we handle symbols correctly
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 2. Write it back out with the magic fix
    with open(file_path, 'w', encoding='utf-8') as f:
        # ensure_ascii=False tells Python "Don't turn € into \u20ac"
        json.dump(data, f, indent=4, ensure_ascii=False)

    print("✅ Success! Your JSON now shows the actual € symbol instead of \\u20ac.")

except Exception as e:
    print(f"❌ Error fixing file: {e}")