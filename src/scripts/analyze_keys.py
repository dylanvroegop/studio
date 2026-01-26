import json

DB_COLUMNS = {
    'created_at', 'id', 'materiaalnaam', 'lengte', 'breedte', 
    'dikte', 'prijs_incl_btw', 'hoogte', 'diameter', 'categorie'
}

def sanitize_key(k):
    # Supabase/Postgres columns should be snake_case, no % or spaces
    return k.strip().replace('%', '').replace(' ', '_').lower()

def main():
    try:
        with open('/Users/dylanvroegop/Documents/studio/src/lib/official_materiallist.json', 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    all_keys = set()
    for item in data:
        all_keys.update(item.keys())

    missing_cols = []
    
    for k in all_keys:
        sanitized = sanitize_key(k)
        
        # Mapping logic manually handled for known discrepancies
        if sanitized == 'prijs_incl_21_btw' and 'prijs_incl_btw' in DB_COLUMNS:
            continue
        
        if sanitized not in DB_COLUMNS:
            missing_cols.append(sanitized)

    # Print unique missing columns
    for col in sorted(list(set(missing_cols))):
        print(col)

if __name__ == '__main__':
    main()
