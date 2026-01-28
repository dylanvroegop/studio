import json
import os
from dotenv import load_dotenv
from supabase import create_client, Client

# 1. Load your credentials from .env.local
load_dotenv(".env.local")

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# 2. Setup paths
JSON_FILE_PATH = 'src/lib/material_category_name_test.json'
TABLE_NAME = 'main_material_list'

def sync_large_list():
    if not URL or not KEY:
        print("Error: Supabase credentials not found.")
        return

    supabase: Client = create_client(URL, KEY)

    with open(JSON_FILE_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"🔄 Syncing {len(data)} items to Supabase...")

    for item in data:
        m_id = item.get('id')
        m_name = item.get('materiaalnaam')
        m_order = item.get('order_id')

        if m_id:
            try:
                # Update the specific row based on the ID anchor
                supabase.table(TABLE_NAME) \
                    .update({
                        "materiaalnaam": m_name,
                        "order_id": m_order
                    }) \
                    .eq("id", m_id) \
                    .execute()
                print(f"✅ Updated: {m_name}")
            except Exception as e:
                print(f"❌ Error on ID {m_id}: {e}")

    print("\n✨ All 1,683 items processed!")

if __name__ == "__main__":
    sync_large_list()