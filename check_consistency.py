import json
import re

# 1. Parse material-list.json
try:
    with open('/Users/dylanvroegop/Documents/studio/src/lib/material-list.json', 'r') as f:
        materials = json.load(f)
    
    # Get all unique subsecties
    valid_subsections = set()
    for item in materials:
        if 'subsectie' in item:
            valid_subsections.add(item['subsectie'])
            
    print(f"Found {len(valid_subsections)} unique subsections in material-list.json")
    
except Exception as e:
    print(f"Error reading material-list.json: {e}")
    valid_subsections = set()

# 2. Parse job-registry.ts to find categoryFilters
registry_filters = set()
try:
    with open('/Users/dylanvroegop/Documents/studio/src/lib/job-registry.ts', 'r') as f:
        content = f.read()
    
    # Regex to find categoryFilter: 'Value'
    # Handles aligned spacing
    matches = re.findall(r"categoryFilter:\s*'([^']+)'", content)
    for m in matches:
        registry_filters.add(m)
        
    print(f"Found {len(registry_filters)} unique categoryFilters in job-registry.ts")

except Exception as e:
    print(f"Error reading job-registry.ts: {e}")

# 3. Compare
print("\n--- CONSISTENCY CHECK ---")
print("Unique CategoryFilters in job-registry:", sorted(list(registry_filters)))
print("\nUnique Subsecties in material-list:", sorted(list(valid_subsections)))

print("\n--- MISMATCHES ---")
mismatches = []
for code_filter in registry_filters:
    if code_filter not in valid_subsections:
        mismatches.append(code_filter)

if mismatches:
    print("The following categoryFilters are used in job-registry.ts but DO NOT EXIST in material-list.json (User will see empty lists):")
    for m in sorted(mismatches):
        print(f" - {m}")
else:
    print("✅ All categoryFilters in job-registry.ts exist in material-list.json!")

