import re

def update_and_align(filepath):
    with open(filepath, 'r') as f:
        lines = f.readlines()

    # Pattern to parse a line
    pattern = re.compile(r"^\s*\{\s*key:\s*'([^']*)',\s*label:\s*'([^']*)',\s*categoryFilter:\s*'([^']*)',\s*category:\s*'([^']*)',\s*category_ultra_filter:\s*'([^']*)'\s*\}\s*,?\s*(//.*)?$")
    
    parsed_lines = []
    
    # Updates to apply
    # using a simple mapping of key -> new_category_filter
    updates = {
        'gevelplaat': 'Gevelplaten & Buitenpanelen',
        'gevelbekleding_hout': 'Houten Gevelbekleding',
        'hoek_hout': 'Houten Gevelbekleding'
    }

    max_lens = {
        'key': 0,
        'label': 0,
        'categoryFilter': 0,
        'category': 0,
        'category_ultra_filter': 0
    }
    
    # Pass 1: Parse and Update
    for i, line in enumerate(lines):
        match = pattern.match(line)
        if match:
            k, l, cf, c, cuf = match.groups()[:5]
            comment = match.group(6) or ''
            
            # Apply Update if needed
            if k in updates:
                cf = updates[k]
                
            max_lens['key'] = max(max_lens['key'], len(k))
            max_lens['label'] = max(max_lens['label'], len(l))
            max_lens['categoryFilter'] = max(max_lens['categoryFilter'], len(cf))
            max_lens['category'] = max(max_lens['category'], len(c))
            max_lens['category_ultra_filter'] = max(max_lens['category_ultra_filter'], len(cuf))
            
            parsed_lines.append((i, k, l, cf, c, cuf, comment))
        else:
            # Keep non-matching lines (headers, braces) as is
            # We store None to indicate "don't format this line"
            parsed_lines.append((i, None))
    
    # Pass 2: Reconstruct lines
    new_lines = []
    for item in parsed_lines:
        i = item[0]
        if item[1] is None:
            new_lines.append(lines[i])
        else:
            _, k, l, cf, c, cuf, comment = item
            
            # Calculate dynamic padding
            pad_key_val = max_lens['key'] + 2 # 'key' + Quotes
            pad_lbl_val = max_lens['label'] + 2
            pad_cf_val  = max_lens['categoryFilter'] + 2
            pad_cat_val = max_lens['category'] + 2
            
            # Construct fields directly with padding logic
            # Field structure: "key: 'VALUE',"
            # We want to align the STARTS of the NEXT field. 
            # So the WHOLE STRING "key: 'VALUE'," needs to be padded to specific width.
            
            # Key Field
            # "key: " is 5 chars. Quotes 2 chars. Comma 1 char. Total overhead 8.
            s_key = f"key: '{k}',"
            w_key = max_lens['key'] + 8
            
            # Label
            # "label: " is 7 chars. Overhead 10.
            s_lbl = f"label: '{l}',"
            w_lbl = max_lens['label'] + 10
            
            # Filter
            # "categoryFilter: " is 16 chars. Overhead 19.
            s_cf = f"categoryFilter: '{cf}',"
            w_cf = max_lens['categoryFilter'] + 19
            
            # Category
            # "category: " is 10 chars. Overhead 13.
            s_cat = f"category: '{c}',"
            w_cat = max_lens['category'] + 13
            
            # Ultra Filter
            # "category_ultra_filter: " is 23 chars. Overhead 25 (quotes) + brace.. wait brace is outside.
            s_cuf = f"category_ultra_filter: '{cuf}'"

            
            original_indent = re.match(r"^\s*", lines[i]).group(0)
            
            # Reconstruct
            new_line = (f"{original_indent}{{ "
                        f"{s_key:<{w_key}} "
                        f"{s_lbl:<{w_lbl}} "
                        f"{s_cf:<{w_cf}} "
                        f"{s_cat:<{w_cat}} "
                        f"{s_cuf} }},")
            
            if comment:
                new_line += f" {comment}"
            new_line += "\n"
            new_lines.append(new_line)

    with open(filepath, 'w') as f:
        f.writelines(new_lines)

update_and_align('/Users/dylanvroegop/Documents/studio/src/lib/job-registry.ts')
