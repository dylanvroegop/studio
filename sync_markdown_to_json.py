# 4. Save the updated JSON back to the file
    try:
        with open(JSON_PATH, 'w', encoding='utf-8') as f:
            # ensure_ascii=False is the magic key here!
            json.dump(json_data, f, indent=4, ensure_ascii=False)
        print(f"✨ Success! Updated {update_count} material names in {JSON_PATH} with correct symbols.")