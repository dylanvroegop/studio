import re

filepath = '/Users/dylanvroegop/Documents/studio/src/lib/job-registry.ts'

with open(filepath, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    stripped = line.strip()
    
    # 1. Keep REGION markers
    if stripped.startswith('//#region') or stripped.startswith('//#endregion'):
        new_lines.append(line)
        continue
        
    # 2. Keep Numbered Component Headers (e.g. "// 1. HOUT", "// --- EXISTING STRUCTURE ---")
    # Matches "// 1. TEXT", "// --- TEXT", "// X. TEXT"
    if stripped.startswith('//'):
        # Check against patterns we want to KEEP
        # Numbered sections: // 1. ...
        if re.match(r'^//\s*\d+\.', stripped):
            new_lines.append(line)
            continue
        # Dashed sections: // --- ...
        if re.match(r'^//\s*---', stripped):
            new_lines.append(line)
            continue
        # Specific headers like // BASIS, // DETAILS (usually uppercase)
        if re.match(r'^//\s*[A-Z &]+$', stripped) and len(stripped) < 40:
             # e.g. // BASIS, // EXTRA, // HARDWARE (BESLAG)
             # But be careful not to keep "conversational" yelling
             new_lines.append(line)
             continue
             
        # If it doesn't match these "Structure" patterns, we SKIP it (Remove it)
        # e.g. "// Don't forget the UA", "// The blue boxes..."
        continue
        
    # 3. Handle inline comments (at end of code lines)
    # e.g. ... }, // Often needed for drain pipes
    # We want to remove the comment part if it's conversational
    if '//' in line:
        # Check if it's a code line
        if not stripped.startswith('//'):
            # Split and keep only code part
            # Be careful not to split inside strings (unlikely for this file structure but safe to be careful)
            # Simple split by " //" suffices for this specific file based on previous content
            parts = line.split(' //', 1)
            if len(parts) > 1:
                # We found a comment at the end. Keep just the code part + newline
                # Ensure we keep the trailing comma/brace if it was before the space
                new_lines.append(parts[0].rstrip() + '\n')
                continue

    # Default: Keep the line (code or empty line)
    new_lines.append(line)

with open(filepath, 'w') as f:
    f.writelines(new_lines)
