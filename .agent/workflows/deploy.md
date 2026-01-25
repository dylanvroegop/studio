---
description: Build and deploy the application with quality checks.
---

# Deployment Workflow

Follow this procedure before pushing code or deploying to production to ensure a stable build.

## Steps

1. **Linting**
   Check for code quality and style issues.
   ```bash
   npm run lint
   ```

2. **Type Checking**
   Ensure strict TypeScript compliance.
   ```bash
   npm run typecheck
   ```

3. **Build Application**
   Create the production build.
   ```bash
   npm run build
   ```

4. **Status Report**
   - If any step fails, PAUSE and report the specific error to the user.
   - If all steps pass, confirm that the application is ready for deployment/commit.
