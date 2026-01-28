
import json
import re

file_path = "/Users/dylanvroegop/Documents/studio/src/lib/material_category_name_test.json"

def process_file():
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to capture AxBmm where it is followed by whitespace and then digit(s)mm lang
    # match.group(1) is A, match.group(2) is B
    pattern = r'(\d+)x(\d+)mm(?=\s+\d+mm lang)'
    
    matches_found = 0
    matches_swapped = 0
    
    def replacer(match):
        nonlocal matches_found, matches_swapped
        matches_found += 1
        val1 = int(match.group(1))
        val2 = int(match.group(2))
        
        # Check if swap needed: we want Dikte (smaller) x Breedte (larger)
        # So format should be Small x Large.
        # If val1 > val2, we swap.
        if val1 > val2:
            matches_swapped += 1
            return f"{val2}x{val1}mm"
        else:
            return match.group(0)

    # We can't use simple re.sub on the whole file blindly if there are overlapping matches, 
    # but here matches are distinct. 
    # Also I want to see what is being changed.
    
    # Let's find matches first to print them
    for match in re.finditer(pattern, content):
        val1 = int(match.group(1))
        val2 = int(match.group(2))
        if val1 > val2:
            start = max(0, match.start() - 20)
            end = min(len(content), match.end() + 30)
            context = content[start:end].replace('\n', ' ')
            print(f"Match: {match.group(0)} -> {val2}x{val1}mm | Context: ...{context}...")

    print(f"\nTotal matches matching pattern: {len(list(re.finditer(pattern, content)))}")

if __name__ == "__main__":
    process_file()
