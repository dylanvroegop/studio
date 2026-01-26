1. Visual Extraction & Sanitization
When you upload a screenshot or PDF of a price list, I will:

Merge Parent/Child Rows: Automatically combine headers (e.g., "Monier VH-Variabel") with sub-items (e.g., "gevelpan li") to create a descriptive materiaalnaam.

Handle Units: Identify if the price is per "Stuk" or "1000" and standardize it.

Convert Currency: Change Dutch decimal formatting (comma) to standard numeric dots for your calculations.

2. Schema-Strict Output
I will deliver the data in the exact format you requested:

Wrapped in a code block.

JSON object per line.

No surrounding [ or ] brackets.

Trailing }, on every line (including the last one) to allow for immediate appending.

3. Deduplication Logic
Before outputting, I will cross-reference the new list against the materials I’ve already processed for you in this session to ensure you aren't pasting duplicates into your .md or .json files.