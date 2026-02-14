import argparse
import json
import os
import re
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

from dotenv import load_dotenv
from supabase import Client, create_client

# Load credentials
load_dotenv(".env.local")
URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

DEFAULT_JSON_FILE_PATH = "src/lib/material_list/material_category_name_test.json"
TABLE_NAME = "main_material_list"

# Local-only or legacy keys that should never be sent directly to Supabase.
NEVER_SEND_COLUMNS: Set[str] = {
    "prijs_incl_21%_btw",
}

def fetch_all_rows(supabase: Client, table: str) -> List[Dict[str, Any]]:
    """Fetch all rows from a table, handling pagination."""
    all_rows: List[Dict[str, Any]] = []
    chunk_size = 1000
    start = 0
    while True:
        response = supabase.table(table).select("*").range(start, start + chunk_size - 1).execute()
        rows = response.data or []
        all_rows.extend(rows)
        if len(rows) < chunk_size:
            break
        start += chunk_size
    return all_rows


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def natural_key(row: Dict[str, Any]) -> Tuple[str, str, str]:
    return (
        normalize_text(row.get("materiaalnaam")),
        normalize_text(row.get("categorie")),
        normalize_text(row.get("sub_categorie")),
    )


def is_valid_key(key: Tuple[str, str, str]) -> bool:
    return bool(key[0] and key[1])


def build_local_rows(raw_data: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    rows: List[Dict[str, Any]] = []
    skipped = 0

    for index, item in enumerate(raw_data):
        if not isinstance(item, dict):
            skipped += 1
            continue

        row = dict(item)
        row["order_id"] = index

        # Normalize legacy price key into canonical DB key.
        if not row.get("prijs_incl_btw") and row.get("prijs_incl_21%_btw"):
            row["prijs_incl_btw"] = row.get("prijs_incl_21%_btw")

        key = natural_key(row)
        if not is_valid_key(key):
            skipped += 1
            continue

        rows.append(row)

    return rows, skipped


def build_remote_index(
    remote_rows: List[Dict[str, Any]],
) -> Tuple[Dict[Tuple[str, str, str], Dict[str, Any]], List[str], int]:
    groups: Dict[Tuple[str, str, str], List[Dict[str, Any]]] = {}
    invalid_rows = 0

    for row in remote_rows:
        key = natural_key(row)
        if not is_valid_key(key):
            invalid_rows += 1
            continue
        groups.setdefault(key, []).append(row)

    unique: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    duplicate_delete_ids: List[str] = []

    for key, rows in groups.items():
        if len(rows) > 1:
            rows.sort(key=lambda x: str(x.get("created_at") or ""), reverse=True)
            keep = rows[0]
            unique[key] = keep
            for discard in rows[1:]:
                row_id = discard.get("row_id")
                if row_id:
                    duplicate_delete_ids.append(row_id)
        else:
            unique[key] = rows[0]

    return unique, duplicate_delete_ids, invalid_rows


def comparable_value(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip()
    return value


def rows_differ(local_row: Dict[str, Any], remote_row: Dict[str, Any], columns: Iterable[str]) -> bool:
    for col in columns:
        if col in {"row_id", "created_at"}:
            continue
        if comparable_value(local_row.get(col)) != comparable_value(remote_row.get(col)):
            return True
    return False


def extract_missing_column(error: Exception) -> Optional[str]:
    text = str(error)
    patterns = [
        r"Could not find the '([^']+)' column",
        r'column "([^"]+)" does not exist',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    return None


def sanitize_row_for_write(
    row: Dict[str, Any],
    active_columns: Set[str],
    include_row_id: bool = False,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {}
    for key, value in row.items():
        if key in NEVER_SEND_COLUMNS:
            continue
        if not include_row_id and key == "row_id":
            continue
        if key in active_columns:
            payload[key] = value
    if include_row_id and row.get("row_id"):
        payload["row_id"] = row.get("row_id")
    return payload


def run_insert_chunk(
    supabase: Client,
    chunk_rows: List[Dict[str, Any]],
    active_columns: Set[str],
) -> bool:
    while True:
        payload = [sanitize_row_for_write(row, active_columns, include_row_id=False) for row in chunk_rows]
        payload = [row for row in payload if row]
        if not payload:
            return True
        try:
            supabase.table(TABLE_NAME).insert(payload).execute()
            return True
        except Exception as error:
            missing = extract_missing_column(error)
            if missing and missing in active_columns:
                active_columns.remove(missing)
                print(f"   ⚠️ Dropping unknown insert column '{missing}' and retrying chunk...")
                continue
            print(f"   ❌ Error inserting chunk: {error}")
            return False


def run_update_rows(
    supabase: Client,
    rows: List[Dict[str, Any]],
    active_columns: Set[str],
) -> bool:
    for row in rows:
        row_id = row.get("row_id")
        if not row_id:
            continue

        while True:
            payload = sanitize_row_for_write(row, active_columns, include_row_id=False)
            payload.pop("row_id", None)
            if not payload:
                break
            try:
                supabase.table(TABLE_NAME).update(payload).eq("row_id", row_id).execute()
                break
            except Exception as error:
                missing = extract_missing_column(error)
                if missing and missing in active_columns:
                    active_columns.remove(missing)
                    print(f"   ⚠️ Dropping unknown update column '{missing}' and retrying row...")
                    continue
                print(f"   ❌ Error updating row {row_id}: {error}")
                return False
    return True


def delete_by_row_ids(supabase: Client, row_ids: List[str]) -> bool:
    if not row_ids:
        return True

    chunk_size = 200
    for i in range(0, len(row_ids), chunk_size):
        chunk = row_ids[i : i + chunk_size]
        try:
            supabase.table(TABLE_NAME).delete().in_("row_id", chunk).execute()
            print(f"   ✅ Deleted batch {i // chunk_size + 1}")
        except Exception as error:
            print(f"   ❌ Error deleting batch {i // chunk_size + 1}: {error}")
            return False
    return True


def sync(json_file_path: str = DEFAULT_JSON_FILE_PATH, allow_delete: bool = False, dry_run: bool = False) -> None:
    if not URL or not KEY:
        print("Error: Supabase credentials not found.")
        return

    supabase: Client = create_client(URL, KEY)

    try:
        with open(json_file_path, "r", encoding="utf-8") as file:
            raw_data = json.load(file)
    except FileNotFoundError:
        print(f"Error: File not found at {json_file_path}")
        return
    except json.JSONDecodeError as error:
        print(f"Error: Invalid JSON in {json_file_path}: {error}")
        return

    if not isinstance(raw_data, list):
        print("Error: JSON root must be a list of material rows.")
        return

    local_rows, skipped_local = build_local_rows(raw_data)
    local_index: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    local_duplicates = 0
    for row in local_rows:
        key = natural_key(row)
        if key in local_index:
            local_duplicates += 1
        local_index[key] = row

    print(f"🔍 Local rows: {len(local_rows)} (skipped invalid: {skipped_local}, duplicate keys overwritten: {local_duplicates})")

    print("🌍 Fetching current Supabase state...")
    try:
        remote_rows = fetch_all_rows(supabase, TABLE_NAME)
    except Exception as error:
        print(f"❌ Failed to fetch from Supabase: {error}")
        return

    print(f"   Fetched {len(remote_rows)} rows from Supabase.")

    remote_index, duplicate_remote_ids, invalid_remote_rows = build_remote_index(remote_rows)
    if duplicate_remote_ids:
        print(f"🧹 Found {len(duplicate_remote_ids)} duplicate remote rows by natural key.")
    if invalid_remote_rows:
        print(f"⚠️ Found {invalid_remote_rows} remote rows without usable key (left untouched).")

    # Determine write columns from local rows first; remove known non-db keys.
    active_columns: Set[str] = set()
    for row in local_index.values():
        active_columns.update(row.keys())
    active_columns.difference_update(NEVER_SEND_COLUMNS)
    active_columns.discard("row_id")

    # Compute insert/update/delete sets.
    to_insert: List[Dict[str, Any]] = []
    to_update: List[Dict[str, Any]] = []

    for key, local_row in local_index.items():
        remote_row = remote_index.get(key)
        if not remote_row:
            to_insert.append(local_row)
            continue

        compare_columns = active_columns.union(remote_row.keys())
        if rows_differ(local_row, remote_row, compare_columns):
            payload = dict(local_row)
            payload["row_id"] = remote_row.get("row_id")
            to_update.append(payload)

    to_delete: List[str] = []
    if allow_delete:
        to_delete.extend(duplicate_remote_ids)
        for key, remote_row in remote_index.items():
            if key not in local_index:
                row_id = remote_row.get("row_id")
                if row_id:
                    to_delete.append(row_id)

    print("📊 Delta Analysis:")
    print(f"   Inserts: {len(to_insert)}")
    print(f"   Updates: {len(to_update)}")
    print(f"   Deletes: {len(to_delete)} (allow_delete={allow_delete})")

    if dry_run:
        print("🧪 Dry-run enabled; no database changes applied.")
        return

    if len(to_insert) == 0 and len(to_update) == 0 and len(to_delete) == 0:
        print("✅ Everything is already up to date!")
        return

    # Safety: perform writes before deletes.
    insert_ok = True
    update_ok = True

    if to_insert:
        print(f"🚀 Inserting {len(to_insert)} rows...")
        chunk_size = 100
        for i in range(0, len(to_insert), chunk_size):
            chunk = to_insert[i : i + chunk_size]
            ok = run_insert_chunk(supabase, chunk, active_columns)
            if not ok:
                insert_ok = False
                break
            print(f"   ✅ Inserted chunk {i}-{i + len(chunk)}")

    if insert_ok and to_update:
        print(f"🔄 Updating {len(to_update)} rows...")
        update_ok = run_update_rows(supabase, to_update, active_columns)
        if update_ok:
            print("   ✅ Updates completed")

    if not insert_ok or not update_ok:
        print("🛑 Aborting deletes because inserts/updates were not fully successful.")
        print("🏁 Sync stopped with partial failure.")
        return

    if to_delete:
        print(f"🗑️ Deleting {len(to_delete)} rows...")
        delete_ok = delete_by_row_ids(supabase, to_delete)
        if not delete_ok:
            print("🏁 Sync completed with delete errors.")
            return

    print("🏁 Smart Sync complete.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sync local material JSON to Supabase main_material_list.")
    parser.add_argument(
        "--input",
        "-i",
        default=DEFAULT_JSON_FILE_PATH,
        help=f"Path to material JSON file (default: {DEFAULT_JSON_FILE_PATH})",
    )
    parser.add_argument(
        "--allow-delete",
        action="store_true",
        help="Allow deleting remote rows that do not exist in local JSON. Disabled by default for safety.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute delta only; do not modify database.",
    )
    args = parser.parse_args()

    print(f"📁 Using input: {args.input}")
    sync(json_file_path=args.input, allow_delete=args.allow_delete, dry_run=args.dry_run)
