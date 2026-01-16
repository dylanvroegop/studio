import re

filepath = 'src/lib/job-registry.ts'

with open(filepath, 'r') as f:
    content = f.read()

# Find JOB_REGISTRY block
start_marker = "export const JOB_REGISTRY"
start_idx = content.find(start_marker)

if start_idx == -1:
    print("JOB_REGISTRY not found")
    exit()

# Extract the content of JOB_REGISTRY (naive brace counting or just regex on the rest)
registry_content = content[start_idx:]

# Regex to find items arrays
# pattern: items: \[ ... \]
# but that's hard with nesting. 

# Alternative: find lines that look like job titles.
# Job titles are usually inside an object in an array 'items'.
# They look like:   title: 'HSB Voorzetwand',
# Category titles look like:   title: 'Wanden',

# Let's iterate line by line to be safer with context.
lines = content.split('\n')
in_registry = False
in_items = False
jobs = []

for line in lines:
    if "export const JOB_REGISTRY" in line:
        in_registry = True
        continue
    
    if not in_registry:
        continue
        
    if "items: [" in line:
        in_items = True
        continue
    
    if in_items:
        if "];" in line or (line.strip() == "]," and "MaterialSection" not in line): 
            # End of items array. Note: MaterialSection arrays also end with ],
            # But usually items array closes with indentation check or context.
            # Simple heuristic: if indentation matches the items opening?
            # Let's just look for "title:" lines while in_items is effectively true.
            # Complexity: "items" might contain objects which contain "materialSections" which contain objects with "label" (not title).
            # So looking for "title:" is pretty safe if we are sure we are in items.
            # But wait, nested objects?
            pass
        
        # Check for title
        match = re.search(r"^\s+title:\s*'([^']*)',", line)
        if match:
            # Check if this looks like a job title vs category title.
            # Inside items, it's a job title.
            # To be sure we are not inside a nested object (like categoryConfig), we check indentation?
            # Job titles in items usually have 8 spaces indentation (2 tabs/4 spaces x 2).
            # Category config titles have deeper indentation?
            
            # Let's just grab them and I will curate the list for the user.
            jobs.append(match.group(1))

        if "export const" in line and "JOB_REGISTRY" not in line:
            # Reached next export?
            break

# Filter out duplicates and likely category headers if any slipped in
unique_jobs = []
for j in jobs:
    if j not in unique_jobs:
        unique_jobs.append(j)

for j in unique_jobs:
    print(j)

