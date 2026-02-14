#!/usr/bin/env python3
import argparse
import csv
import hashlib
import json
import re
import string
from pathlib import Path
from typing import Any, Dict, List, Optional

TITLE_KEYS = [
    "title",
    "naam",
    "name",
    "materiaalnaam",
    "product",
    "omschrijving",
]

PRICE_KEYS = [
    "price",
    "prijs",
    "priceinclbtw",
    "prijsinclbtw",
]

UNIT_KEYS = [
    "price2",
    "price(2)",
    "unit",
    "eenheid",
    "prijsper",
]

CATEGORY_KEYS = [
    "categorie",
    "category",
    "cat",
]

SUB_CATEGORY_KEYS = [
    "subcategorie",
    "sub_categorie",
    "subcategory",
]

FASTENER_HINTS = (
    "schroef",
    "spijker",
    "nagel",
    "bout",
    "plug",
    "anker",
    "draadstang",
)

ID_ALPHABET = string.ascii_letters + string.digits


def normalize_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def stable_id(seed: str, length: int = 6) -> str:
    digest = hashlib.sha1(seed.encode("utf-8")).digest()
    number = int.from_bytes(digest, byteorder="big")
    chars: List[str] = []
    for _ in range(length):
        number, idx = divmod(number, len(ID_ALPHABET))
        chars.append(ID_ALPHABET[idx])
    return "".join(chars)


def parse_decimal(value: str) -> Optional[float]:
    raw = re.sub(r"[^0-9,.\-]", "", value or "")
    if not raw:
        return None

    if "," in raw and "." in raw:
        if raw.rfind(",") > raw.rfind("."):
            raw = raw.replace(".", "").replace(",", ".")
        else:
            raw = raw.replace(",", "")
    elif "," in raw and "." not in raw:
        raw = raw.replace(",", ".")

    try:
        return float(raw)
    except ValueError:
        return None


def format_measure(raw_value: str, unit: str) -> str:
    value = raw_value.strip().replace(",", ".")
    try:
        num = float(value)
        if float(num).is_integer():
            pretty = str(int(num))
        else:
            pretty = f"{num:.3f}".rstrip("0").rstrip(".").replace(".", ",")
        return f"{pretty}{unit}"
    except ValueError:
        return f"{raw_value.strip()}{unit}"


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def row_value(row: Dict[str, Any], preferred_keys: List[str]) -> Optional[str]:
    if not row:
        return None
    normalized_map = {normalize_header(k): v for k, v in row.items() if isinstance(k, str)}
    for preferred_key in preferred_keys:
        normalized_key = normalize_header(preferred_key)
        if normalized_key in normalized_map:
            value = normalized_map[normalized_key]
            if value is None:
                continue
            text = str(value).strip()
            if text:
                return text
    return None


def extract_unit(price_text: Optional[str], unit_text: Optional[str]) -> Optional[str]:
    candidates = [unit_text or "", price_text or ""]
    combined = " ".join(candidates).lower()
    combined = combined.replace("m²", "m2").replace("m³", "m3")

    per_match = re.search(r"per\s*([a-z0-9/]+)", combined)
    base = per_match.group(1) if per_match else combined.strip()
    if not base:
        return None

    aliases = {
        "st": "stuk",
        "stuk": "stuk",
        "stuks": "stuk",
        "m": "m1",
        "meter": "m1",
        "m1": "m1",
        "m2": "m2",
        "m3": "m3",
        "pak": "pak",
        "rollen": "rol",
        "rol": "rol",
        "dozen": "doos",
        "doos": "doos",
        "zak": "zak",
        "zakken": "zak",
        "set": "set",
        "sets": "set",
        "kg": "kg",
        "ltr": "ltr",
        "liter": "ltr",
        "bus": "bus",
        "koker": "koker",
    }

    token = re.split(r"[^a-z0-9/]+", base)[0]
    return aliases.get(token, token or None)


def looks_like_fastener(name: str, first_value: float, second_value: float) -> bool:
    lowered = name.lower()
    if any(hint in lowered for hint in FASTENER_HINTS):
        return True
    return first_value <= 10 and second_value >= 12


def extract_dimensions(name: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    lowered = name.lower().replace("×", "x")

    explicit_length = re.search(r"(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\.?\s*lang\b", lowered)
    if explicit_length:
        result["lengte"] = format_measure(explicit_length.group(1), explicit_length.group(2))

    # Also catch ranges like 220-300mm for telescopic products when no length was captured yet.
    if "lengte" not in result:
        range_match = re.search(r"(\d+(?:[.,]\d+)?\s*-\s*\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b", lowered)
        if range_match and any(token in lowered for token in ("telescop", "uitzetter", "lang")):
            compact = re.sub(r"\s+", "", range_match.group(1))
            result["lengte"] = f"{compact}{range_match.group(2)}"

    x_pattern = re.compile(
        r"(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m)\b"
    )
    x_match = x_pattern.search(lowered)
    if x_match:
        first = x_match.group(1)
        second = x_match.group(2)
        third = x_match.group(3)
        unit = x_match.group(4)

        first_f = float(first.replace(",", "."))
        second_f = float(second.replace(",", "."))
        has_explicit_length = "lengte" in result

        if third is not None:
            if has_explicit_length:
                result.setdefault("breedte", format_measure(first, unit))
                result.setdefault("hoogte", format_measure(second, unit))
                result.setdefault("dikte", format_measure(third, unit))
            else:
                result.setdefault("lengte", format_measure(first, unit))
                result.setdefault("breedte", format_measure(second, unit))
                result.setdefault("dikte", format_measure(third, unit))
        else:
            if has_explicit_length:
                result.setdefault("breedte", format_measure(first, unit))
                result.setdefault("dikte", format_measure(second, unit))
            elif looks_like_fastener(name, first_f, second_f):
                result.setdefault("dikte", format_measure(first, unit))
                result.setdefault("lengte", format_measure(second, unit))
            else:
                result.setdefault("lengte", format_measure(first, unit))
                result.setdefault("breedte", format_measure(second, unit))

    count_match = re.search(r"(\d+)\s*(stuks|stuk|st)\b", lowered)
    if count_match:
        result["aantal"] = count_match.group(1)

    # Fasteners often only expose one explicit mm value (e.g. "nagel 30mm").
    if "lengte" not in result and any(hint in lowered for hint in FASTENER_HINTS):
        single_mm = re.search(r"(\d+(?:[.,]\d+)?)\s*mm\b", lowered)
        if single_mm:
            result["lengte"] = format_measure(single_mm.group(1), "mm")

    return result


def parse_json_like_text(text: str) -> List[Dict[str, Any]]:
    try:
        loaded = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start < 0 or end < 0 or end <= start:
            raise
        loaded = json.loads(text[start : end + 1])

    if isinstance(loaded, list):
        return [row for row in loaded if isinstance(row, dict)]
    if isinstance(loaded, dict):
        for key in ("items", "data", "results"):
            if isinstance(loaded.get(key), list):
                return [row for row in loaded[key] if isinstance(row, dict)]
    raise ValueError("JSON input moet een lijst met objecten bevatten.")


def read_rows(input_path: Path) -> List[Dict[str, Any]]:
    suffix = input_path.suffix.lower()
    if suffix in {".json", ".md", ".txt"}:
        text = input_path.read_text(encoding="utf-8")
        return parse_json_like_text(text)

    if suffix in {".csv", ".tsv"}:
        with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
            sample = handle.read(4096)
            handle.seek(0)
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            except csv.Error:
                dialect = csv.excel
            reader = csv.DictReader(handle, dialect=dialect)
            return [dict(row) for row in reader]

    raise ValueError(f"Onbekend input type: {input_path.suffix}. Gebruik CSV, JSON of MD.")


def material_key(material_name: str, category: str) -> str:
    return f"{normalize_space(category).lower()}|{normalize_space(material_name).lower()}"


def build_material_row(
    row: Dict[str, Any],
    forced_category: Optional[str],
    forced_sub_category: Optional[str],
) -> Optional[Dict[str, Any]]:
    material_name = row_value(row, TITLE_KEYS)
    if not material_name:
        return None
    material_name = normalize_space(material_name)

    category = forced_category or row_value(row, CATEGORY_KEYS) or "Overig"
    category = normalize_space(category)

    sub_category = forced_sub_category or row_value(row, SUB_CATEGORY_KEYS) or "Overig"
    sub_category = normalize_space(sub_category)

    price_text = row_value(row, PRICE_KEYS)
    unit_text = row_value(row, UNIT_KEYS)
    unit = extract_unit(price_text, unit_text)
    price_value = parse_decimal(price_text or "")

    material: Dict[str, Any] = {
        "id": stable_id(material_key(material_name, category)),
        "materiaalnaam": material_name,
        "categorie": category,
        "sub_categorie": sub_category,
    }

    if unit:
        material["eenheid"] = unit

    if price_value is not None:
        material["prijs_incl_btw"] = f"{price_value:.2f}"
        if unit:
            material["prijs_incl_21%_btw"] = f"€ {price_value:.2f} per {unit}"
        else:
            material["prijs_incl_21%_btw"] = f"€ {price_value:.2f}"

    material.update(extract_dimensions(material_name))
    return material


def merge_materials(
    existing: List[Dict[str, Any]],
    incoming: List[Dict[str, Any]],
    replace_categories: bool,
) -> List[Dict[str, Any]]:
    incoming_categories = {normalize_space(item.get("categorie", "")) for item in incoming}

    if replace_categories:
        kept = [
            item
            for item in existing
            if normalize_space(str(item.get("categorie", ""))) not in incoming_categories
        ]
        combined = kept + incoming
    else:
        merged_map: Dict[str, Dict[str, Any]] = {}
        for item in existing:
            name = str(item.get("materiaalnaam", "")).strip()
            category = str(item.get("categorie", "")).strip()
            if not name or not category:
                continue
            merged_map[material_key(name, category)] = item
        for item in incoming:
            merged_map[material_key(item["materiaalnaam"], item["categorie"])] = item
        combined = list(merged_map.values())

    combined.sort(key=lambda item: (str(item.get("categorie", "")).lower(), str(item.get("materiaalnaam", "")).lower()))
    for idx, item in enumerate(combined, start=1):
        item["order_id"] = idx
        if not item.get("id"):
            item["id"] = stable_id(material_key(str(item.get("materiaalnaam", "")), str(item.get("categorie", ""))))
    return combined


def summarize_rows(rows: List[Dict[str, Any]]) -> str:
    with_length = sum(1 for row in rows if row.get("lengte"))
    with_width = sum(1 for row in rows if row.get("breedte"))
    with_thickness = sum(1 for row in rows if row.get("dikte"))
    with_height = sum(1 for row in rows if row.get("hoogte"))
    with_price = sum(1 for row in rows if row.get("prijs_incl_btw"))
    return (
        f"Rows: {len(rows)} | lengte: {with_length} | breedte: {with_width} | "
        f"dikte: {with_thickness} | hoogte: {with_height} | prijs: {with_price}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Converteer Easy Scraper export naar materiaal JSON met parsing van lengte/breedte/dikte."
    )
    parser.add_argument("--input", "-i", required=True, help="Pad naar CSV/JSON/MD export.")
    parser.add_argument(
        "--output",
        "-o",
        default="src/lib/material_list/material_category_name_test.json",
        help="Output JSON pad.",
    )
    parser.add_argument(
        "--category",
        help="Forceer categorie voor alle rijen (aanrader bij een scrape per categorie).",
    )
    parser.add_argument(
        "--sub-category",
        default="Overig",
        help="Forceer sub_categorie voor alle rijen. Default: Overig.",
    )
    parser.add_argument(
        "--merge-with",
        help="Bestaand JSON bestand om mee te mergen (bijv. je huidige masterlijst).",
    )
    parser.add_argument(
        "--replace-category",
        action="store_true",
        help="Vervang categorieën uit import in de merge-file i.p.v. alleen updaten op naam.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        raise FileNotFoundError(f"Input bestand niet gevonden: {input_path}")

    source_rows = read_rows(input_path)
    if not source_rows:
        raise ValueError("Geen rijen gevonden in input.")

    converted: List[Dict[str, Any]] = []
    seen_keys = set()
    for row in source_rows:
        item = build_material_row(row, args.category, args.sub_category)
        if not item:
            continue
        key = material_key(item["materiaalnaam"], item["categorie"])
        if key in seen_keys:
            continue
        seen_keys.add(key)
        converted.append(item)

    converted.sort(key=lambda item: (item["categorie"].lower(), item["materiaalnaam"].lower()))
    for idx, item in enumerate(converted, start=1):
        item["order_id"] = idx

    final_rows = converted
    if args.merge_with:
        merge_path = Path(args.merge_with)
        if merge_path.exists():
            existing_text = merge_path.read_text(encoding="utf-8")
            existing_rows = parse_json_like_text(existing_text)
        else:
            existing_rows = []
        final_rows = merge_materials(existing_rows, converted, args.replace_category)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(final_rows, indent=2, ensure_ascii=False), encoding="utf-8")

    print("✅ Conversie klaar.")
    print(f"Bron: {input_path}")
    print(f"Output: {output_path}")
    print(summarize_rows(converted))
    if args.merge_with:
        print(f"Merged totaal: {len(final_rows)}")
    print("Voorbeeld (eerste 3):")
    for row in final_rows[:3]:
        sample = {
            "materiaalnaam": row.get("materiaalnaam"),
            "categorie": row.get("categorie"),
            "lengte": row.get("lengte"),
            "breedte": row.get("breedte"),
            "dikte": row.get("dikte"),
            "hoogte": row.get("hoogte"),
            "prijs_incl_btw": row.get("prijs_incl_btw"),
            "eenheid": row.get("eenheid"),
        }
        print(json.dumps(sample, ensure_ascii=False))


if __name__ == "__main__":
    main()
