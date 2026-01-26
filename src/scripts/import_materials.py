import json
import urllib.request
import urllib.error
import os
import time

URL = "https://eihmvwieqwxvieqcpodh.supabase.co/rest/v1/main_material_list"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpaG12d2llcXd4dmllcWNwb2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MzE2ODcsImV4cCI6MjA4MDEwNzY4N30.OmO-OXfc2UzFO8FieiL47OMEISUTRPGW9SD9aaFXxY4"

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal" 
}

# The Keys list from before to ensure we only include known columns and map them correctly
KEYS = ['materiaalnaam', 'zijde', 'kleur', 'eenheid', 'wanddikte', 'categorie', 'maatcode', 'voeding', 'diameter_van', 'glas', 'diameter_inwendig', 'lengte', 'kenmerk', 'diameter_uitwendig', ' ponds', 'breedte', 'diameter_doorvoer', 'diameter_naar', 'aantal', 'verpakking', 'gewicht', 'aantal_strips', 'methode', 'laagdikte', 'prijs_incl_21%_btw', 'type', 'uitvoering', 'dikte', 'afwerking', 'hoek', 'kozijnmaat', 'diameter_schaal', 'manchet', 'inhoud', 'uitsparing_maat', 'hellingshoek', 'maximale_hoogte', 'merk', 'formaat', 'maat', 'vorm', 'materiaal', 'sponning', 'profiel', 'oppervlakte', 'artikelnummer', 'verbruik', 'netto_maat', 'verkoop_eenheid', 'rol_lengte', 'hoogte', 'toepassing', 'werkend', 'voorzijde', 'model', 'afmeting', 'rd_waarde', 'deurmaat', 'diameter', 'kokerlengte']

def sanitize_key(k):
    return k.strip().replace('%', '').replace(' ', '_')

def main():
    # Assuming the script runs from src/scripts or project root
    # Try looking for file in standard location
    possible_paths = [
        'src/lib/official_materiallist.json',
        '../lib/official_materiallist.json',
        '/Users/dylanvroegop/Documents/studio/src/lib/official_materiallist.json'
    ]
    
    file_path = None
    for p in possible_paths:
        if os.path.exists(p):
            file_path = p
            break
            
    if not file_path:
        print("Error: official_materiallist.json not found")
        return

    with open(file_path, 'r') as f:
        data = json.load(f)
    
    print(f"Total items: {len(data)}")
    
    # Pre-calculate key mapping
    key_map = {k: sanitize_key(k) for k in KEYS}
    all_sanitized_keys = [sanitize_key(k) for k in KEYS]
    
    transformed_data = []
    for item in data:
        new_item = {}
        # Ensure EVERY key from our schema is present in the object
        for original_key in KEYS:
            sanitized = key_map[original_key]
            # Use get() to return None if key is missing
            new_item[sanitized] = item.get(original_key)
        transformed_data.append(new_item)
        
    batch_size = 100
    for i in range(0, len(transformed_data), batch_size):
        batch = transformed_data[i : i + batch_size]
        
        req = urllib.request.Request(URL, data=json.dumps(batch).encode('utf-8'), headers=HEADERS, method='POST')
        
        try:
            with urllib.request.urlopen(req) as res:
                print(f"Batch {i} - {i+len(batch)}: {res.status} {res.reason}")
        except urllib.error.HTTPError as e:
            print(f"Batch {i} failed: {e.code} {e.reason}")
            try:
                print(e.read().decode('utf-8'))
            except:
                pass
        except Exception as e:
            print(f"Batch {i} error: {e}")
        
        time.sleep(0.1)

if __name__ == '__main__':
    main()
