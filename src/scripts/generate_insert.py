import json
import argparse
import os

KEYS = ['materiaalnaam', 'zijde', 'kleur', 'eenheid', 'wanddikte', 'categorie', 'maatcode', 'voeding', 'diameter_van', 'glas', 'diameter_inwendig', 'lengte', 'kenmerk', 'diameter_uitwendig', ' ponds', 'breedte', 'diameter_doorvoer', 'diameter_naar', 'aantal', 'verpakking', 'gewicht', 'aantal_strips', 'methode', 'laagdikte', 'prijs_incl_21%_btw', 'type', 'uitvoering', 'dikte', 'afwerking', 'hoek', 'kozijnmaat', 'diameter_schaal', 'manchet', 'inhoud', 'uitsparing_maat', 'hellingshoek', 'maximale_hoogte', 'merk', 'formaat', 'maat', 'vorm', 'materiaal', 'sponning', 'profiel', 'oppervlakte', 'artikelnummer', 'verbruik', 'netto_maat', 'verkoop_eenheid', 'rol_lengte', 'hoogte', 'toepassing', 'werkend', 'voorzijde', 'model', 'afmeting', 'rd_waarde', 'deurmaat', 'diameter', 'kokerlengte']

def sanitize_key(k):
    return k.strip().replace('%', '').replace(' ', '_')

def escape_val(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--limit', type=int, default=100)
    args = parser.parse_args()

    # Assuming script is run from project root or checks relative path correctly
    file_path = '/Users/dylanvroegop/Documents/studio/src/lib/official_materiallist.json'
    with open(file_path, 'r') as f:
        data = json.load(f)

    batch = data[args.offset : args.offset + args.limit]
    if not batch:
        return

    col_map = {k: sanitize_key(k) for k in KEYS}
    cols_str = ', '.join([f'"{col_map[k]}"' for k in KEYS])
    
    values_list = []
    for item in batch:
        vals = []
        for k in KEYS:
            val = item.get(k)
            vals.append(escape_val(val))
        values_list.append(f"({', '.join(vals)})")
    
    if values_list:
        sql = f'INSERT INTO main_material_list ({cols_str}) VALUES {", ".join(values_list)};'
        print(sql)

if __name__ == '__main__':
    main()
