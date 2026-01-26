import json
import os

list_file = '/Users/dylanvroegop/Documents/studio/src/lib/material-list.md'
add_file = '/Users/dylanvroegop/Documents/studio/src/lib/materialadd.md'

# Read the list of new materials
try:
    with open(add_file, 'r') as f:
        # Skip empty lines and strip whitespace
        new_materials = [line.strip() for line in f if line.strip()]
except FileNotFoundError:
    print(f"Error: Source file {add_file} not found.")
    exit(1)

if not new_materials:
    print("No new materials found in source file.")
    exit(0)

# Read the existing JSON file
try:
    with open(list_file, 'r') as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError) as e:
    print(f"Error reading destination file: {e}")
    exit(1)

initial_count = len(data)
print(f"Initial count: {initial_count}")

# Append new materials
for material in new_materials:
    data.append({"materiaalnaam": material})

final_count = len(data)
print(f"Final count: {final_count}")
print(f"Adding {len(new_materials)} items...")

# Write back to the file
try:
    with open(list_file, 'w') as f:
        json.dump(data, f, indent=2)
    print("Successfully updated material-list.md")
except Exception as e:
    print(f"Error writing file: {e}")
    exit(1)
