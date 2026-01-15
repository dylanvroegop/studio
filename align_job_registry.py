import re

def align_file(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    # Regex to capture the fields
    # { key: 'foo', label: 'bar', categoryFilter: 'baz', category: 'qux', category_ultra_filter: '' },
    # We need to handle potential extra spaces/different orders, but usually they are consistent.
    # Let's rely on the specific format we see.
    
    # Pattern to parse a line
    # We want to extract value content primarily.
    # Group 1: key
    # Group 2: label
    # Group 3: categoryFilter
    # Group 4: category
    # Group 5: category_ultra_filter
    
    pattern = re.compile(r"^\s*\{\s*key:\s*'([^']*)',\s*label:\s*'([^']*)',\s*categoryFilter:\s*'([^']*)',\s*category:\s*'([^']*)',\s*category_ultra_filter:\s*'([^']*)'\s*\}\s*,?\s*(//.*)?$")
    
    parsed_lines = []
    max_lens = {
        'key': 0,
        'label': 0,
        'categoryFilter': 0,
        'category': 0,
        'category_ultra_filter': 0
    }
    
    # Pass 1: Find max lengths
    for i, line in enumerate(lines):
        match = pattern.match(line)
        if match:
            k, l, cf, c, cuf = match.groups()[:5]
            max_lens['key'] = max(max_lens['key'], len(k))
            max_lens['label'] = max(max_lens['label'], len(l))
            max_lens['categoryFilter'] = max(max_lens['categoryFilter'], len(cf))
            max_lens['category'] = max(max_lens['category'], len(c))
            max_lens['category_ultra_filter'] = max(max_lens['category_ultra_filter'], len(cuf))
            parsed_lines.append((i, k, l, cf, c, cuf, match.group(6) or ''))
    
    # Pass 2: Reconstruct lines
    new_lines = lines[:]
    for i, k, l, cf, c, cuf, comment in parsed_lines:
        # Construct the new line with padding
        # key field
        f_key = f"key: '{k}',".ljust(max_lens['key'] + 10) # 5 chars for "key: " + 2 quotes + 1 comma + space
        # Actually ljust on the VALUE is hard because the field name is there. 
        # Better to pad the whole "key: '...'," string?
        
        # Let's construct strictly:
        # { key: '...',_  label: '...',_  categoryFilter: '...',_  category: '...',_  category_ultra_filter: '...' },
        
        s_key = f"key: '{k}',"
        s_lbl = f"label: '{l}',"
        s_cf  = f"categoryFilter: '{cf}',"
        s_cat = f"category: '{c}',"
        s_cuf = f"category_ultra_filter: '{cuf}'" # No comma at end inside brace usually, but let's check. 
        # Wait, the closing brace } follows.
        
        # Calculate padding based on max content length
        # key: '...' -> length is 5 + len(k) + 2 + 1 = len(k) + 8
        pad_key = max_lens['key'] + 8
        pad_lbl = max_lens['label'] + 10 # label: ''_
        pad_cf  = max_lens['categoryFilter'] + 19 # categoryFilter: ''_
        pad_cat = max_lens['category'] + 13 # category: ''_
        # pad_cuf doesnt need padding as it's last (except for brace)
        
        # Preserve indentation
        original_indent = re.match(r"^\s*", lines[i]).group(0)
        
        new_line = (f"{original_indent}{{ "
                    f"{s_key:<{pad_key}} "
                    f"{s_lbl:<{pad_lbl}} "
                    f"{s_cf:<{pad_cf}} "
                    f"{s_cat:<{pad_cat}} "
                    f"{s_cuf} }},")
        
        if comment:
            new_line += f" {comment}"
        
        new_line += "\n"
        new_lines[i] = new_line

    with open(filepath, 'w') as f:
        f.writelines(new_lines)

align_file('/Users/dylanvroegop/Documents/studio/src/lib/job-registry.ts')
