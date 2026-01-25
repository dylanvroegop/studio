---
description: Run maintenance scripts to align job registry and check consistency.
---

# Run Maintenance Workflow

This workflow executes the Python maintenance scripts located in the root directory to ensure data integrity.

## Steps

1. **Clean Comments and Formatting**
   Run the comment cleaning script to tidy up the codebase.
   ```bash
   python3 clean_comments.py
   ```

2. **Align Job Registry**
   Synchronize the job registry definitions.
   ```bash
   python3 align_job_registry.py
   ```

3. **Check Consistency**
   Verify the consistency of the data and configurations.
   ```bash
   python3 check_consistency.py
   ```

4. **Update and Align**
   Run the broader update and alignment script if necessary.
   ```bash
   python3 update_and_align.py
   ```
