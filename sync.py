import json
import os
import random
import string
from dotenv import load_dotenv
from supabase import create_client, Client

# Load credentials
load_dotenv(".env.local")
URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

JSON_FILE_PATH = 'src/lib/material_category_name_test.json'
TABLE_NAME = 'main_material_list'

def generate_short_id(length=6):
    """Generate a short random ID similar to 'ukuxPe'."""
    chars = string.ascii_letters + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

def fetch_all_rows(supabase: Client, table: str):
    """Fetch all rows from a table, handling pagination."""
    all_rows = []
    chunk_size = 1000
    start = 0
    while True:
        response = supabase.table(table).select("*").range(start, start + chunk_size - 1).execute()
        rows = response.data
        all_rows.extend(rows)
        if len(rows) < chunk_size:
            break
        start += chunk_size
    return all_rows

def get_row_hash(row):
    """Create a comparable hash/tuple for a row to check for changes."""
    # Define exact columns we sync
    return (
        row.get("materiaalnaam"),
        row.get("categorie"),
        row.get("order_id"),
        row.get("lengte"),
        row.get("breedte"),
        row.get("dikte"),
        row.get("sub_categorie")
        # Add other columns here if you start syncing them
    )

def sync():
    if not URL or not KEY:
        print("Error: Supabase credentials not found.")
        return

    supabase: Client = create_client(URL, KEY)

    # 1. Read Local JSON
    try:
        with open(JSON_FILE_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found at {JSON_FILE_PATH}")
        return

    # 2. Fix Local Data (IDs and Order)
    print(f"🔍 Analyzing local data ({len(data)} items)...")
    clean_data = []
    seen_ids = set()
    duplicates_fixed = 0
    
    local_items_map = {}

    for index, item in enumerate(data):
        item['order_id'] = index
        current_id = item.get("id")
        
        if not current_id or current_id in seen_ids:
            new_id = generate_short_id()
            while new_id in seen_ids:
                new_id = generate_short_id()
            item['id'] = new_id
            duplicates_fixed += 1
            current_id = new_id
        seen_ids.add(current_id)

        clean_item = {
            "id": current_id,
            "materiaalnaam": item.get("materiaalnaam"),
            "categorie": item.get("categorie"),
            "order_id": index,
            "lengte": item.get("lengte"),
            "breedte": item.get("breedte"),
            "dikte": item.get("dikte"),
            "sub_categorie": item.get("sub_categorie")
        }
        clean_data.append(clean_item)
        local_items_map[current_id] = clean_item

    if duplicates_fixed > 0:
        print(f"✨ Fixed {duplicates_fixed} local duplicate/missing IDs.")
        with open(JSON_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print("💾 Saved fixed local JSON.")

    # 3. Fetch Remote Data
    print("🌍 Fetching current Supabase state...")
    try:
        remote_rows = fetch_all_rows(supabase, TABLE_NAME)
    except Exception as e:
        print(f"❌ Failed to fetch from Supabase: {e}")
        return
    
    print(f"   Fetched {len(remote_rows)} rows from Supabase.")

    # 4. Process Remote Data (Deduplicate)
    remote_map_by_id = {} # id -> list of rows
    ids_with_duplicates = 0
    
    for row in remote_rows:
        rid = row.get('id')
        if rid not in remote_map_by_id:
            remote_map_by_id[rid] = []
        remote_map_by_id[rid].append(row)

    unique_remote_map = {} # id -> single row (best one)
    cleanup_delete_ids = [] # row_ids to delete (duplicates)

    for rid, rows in remote_map_by_id.items():
        if len(rows) > 1:
            ids_with_duplicates += 1
            # Sort by created_at desc (keep newest), assuming created_at exists.
            # If not, just arbitrary.
            rows.sort(key=lambda x: x.get('created_at', ''), reverse=True)
            keep = rows[0]
            unique_remote_map[rid] = keep
            for discard in rows[1:]:
                cleanup_delete_ids.append(discard.get('row_id'))
        else:
            unique_remote_map[rid] = rows[0]

    if cleanup_delete_ids:
        print(f"🧹 Found {len(cleanup_delete_ids)} duplicate rows for {ids_with_duplicates} IDs. Marking for deletion.")

    # 5. Calculate Delta (Upsert vs Delete)
    to_insert = []
    to_update = []
    to_delete = list(cleanup_delete_ids) # Start with duplicates

    # Check Local items against Unique Remote
    for clean_item in clean_data:
        item_id = clean_item['id']
        
        if item_id in unique_remote_map:
            # Exists remotely. Check for changes.
            remote_row = unique_remote_map[item_id]
            
            # Compare hash
            if get_row_hash(clean_item) != get_row_hash(remote_row):
                # CHANGED: Attach row_id (PK) so upsert updates THIS specific row
                row_pk = remote_row.get('row_id')
                if row_pk:
                    clean_item['row_id'] = row_pk
                    to_update.append(clean_item)
                else:
                    # Should not happen given schema inspection, but fallback to insert
                    to_insert.append(clean_item)
        else:
            # New item (no row_id, so it will insert)
            to_insert.append(clean_item)

    # Check for Removed items
    for rid, row in unique_remote_map.items():
        if rid not in local_items_map:
            to_delete.append(row.get('row_id'))

    print(f"📊 Delta Analysis:")
    print(f"   Inserts: {len(to_insert)}")
    print(f"   Updates: {len(to_update)}")
    print(f"   Deletes: {len(to_delete)}")

    if len(to_insert) == 0 and len(to_update) == 0 and len(to_delete) == 0:
        print("✅ Everything is already up to date!")
        return

    # 6. Execute Deletes
    if to_delete:
         print(f"🗑️ Deleting {len(to_delete)} items...")
         chunk_size = 200
         for i in range(0, len(to_delete), chunk_size):
             chunk_ids = to_delete[i:i + chunk_size]
             try:
                 # Delete by row_id (PK)
                 supabase.table(TABLE_NAME).delete().in_("row_id", chunk_ids).execute()
                 print(f"   ✅ Deleted batch {i // chunk_size + 1}")
             except Exception as e:
                 print(f"   ❌ Error deleting chunk: {e}")

    # 7. Execute Inserts
    if to_insert:
        print(f"🚀 Inserting {len(to_insert)} items...")
        chunk_size = 100
        for i in range(0, len(to_insert), chunk_size):
            chunk = to_insert[i:i + chunk_size]
            try:
                supabase.table(TABLE_NAME).insert(chunk).execute()
                print(f"   ✅ Inserted chunk {i}-{i+len(chunk)}")
            except Exception as e:
                print(f"   ❌ Error inserting chunk {i}: {e}")

    # 8. Execute Updates
    if to_update:
        print(f"🔄 Updating {len(to_update)} items...")
        chunk_size = 100
        for i in range(0, len(to_update), chunk_size):
            chunk = to_update[i:i + chunk_size]
            try:
                supabase.table(TABLE_NAME).upsert(chunk).execute()
                print(f"   ✅ Updated chunk {i}-{i+len(chunk)}")
            except Exception as e:
                print(f"   ❌ Error updating chunk {i}: {e}")

    print("🏁 Smart Sync complete.")

if __name__ == "__main__":
    sync()