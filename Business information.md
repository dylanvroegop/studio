# Business Information: "Studio" / Offertehulp

## 1. Algemeen (General Information)

### Executive Summary
This application is a specialized **Estimation & Planning Platform** tailored for Dutch carpenters ("timmermannen") and renovation contractors. It bridges the gap between rough estimates and professional, profitable quoting. By combining technical calculation wizards with business management tools, it transforms a craftsman's knowledge into accurate material lists, precise labor estimates, and visually stunning proposals.

### Mission & Core Value
**"Stop guessing, start calculating."**
Our mission is to professionalize the independent contractor's workflow. We replace "back-of-the-napkin" math with a structured, data-driven approach that ensures:
1.  **Accuracy:** No forgotten materials or under-estimated hours.
2.  **Speed:** Generating a detailed quote in minutes, not hours.
3.  **Profitability:** Visualizing margins before sending the quote.
4.  **Professionalism:** sending high-end, branded PDFs that win trust.

### Target Audience
*   **Primary:** independent carpenters (ZZP'ers) and small contracting firms (1-5 employees) in the Netherlands.
*   **Focus:** Renovation, roofing, extensions (aanbouw), and general carpentry.
*   **Pain Points:** Time spent on administration at night, fear of under-quoting, difficulty managing materials, and lack of overview.

### Unique Selling Points (USPs)
*   **Visual Calculation Wizards:** Specialized input modules for Roofs, Fascias (Boeidelen), Frames, etc., that visually guide the user.
*   **Live Price Linking:** Material lists are linked to a central database, allowing for one-click price updates.
*   **"Winst-First" Approach:** The dashboard and quote builder prioritize margin and profit visibility.
*   **All-in-One Flow:** From calculation -> quote -> customer acceptance -> planning -> invoice -> profit analysis.

---

## 2. Dashboard
The **Dashboard** serves as the command center for the contractor. It provides an immediate overview of the business's health and daily priorities.

### Key Features
*   **Financial Health Indicators:** Real-time summary of revenue (Omzet) and total invoice value.
*   **Actionable Insights:**
    *   **Open Offertes:** Number of quotes awaiting client action.
    *   **Te Laat Facturen:** Flags overdue invoices that need chasing.
    *   **Actieve Projecten:** Snapshot of currently running jobs.
*   **Status Trends:** Visual bar charts showing the distribution of quotes (Draft vs. Sent vs. Accepted) and invoices.
*   **Quick Actions:** Shortcut buttons to immediately start a new calculation, create a client, or log hours.
*   **Recent Activity:** A timeline feed of recent actions (e.g., "Offerte #2024-05 updated", "Nieuwe klant aangemaakt").

---

## 3. Offertes (Quotes)
The **Offertes** module is the heart of the application, combining technical calculation with document generation.

### The Calculation Engine (Phase 1)
Instead of typing text freely, users select specific **Work Modules** to build a quote.
*   **Available Modules:**
    *   **General/Manual:** For custom work.
    *   **Schuine Daken (Pitched Roofs):** Calculates tiles, battens, insulation, and foil based on m² and pitch.
    *   **Platte Daken (Flat Roofs):** Bitumen/EPDM, edge finishing, rainwater drainage.
    *   **Boeidelen (Fascia):** Linear meter calculation for finishings.
    *   **Lood & Zink:** Lead flashing and zinc work.
    *   **Isolatie:** Wall and roof insulation calculations.
*   **Functionality:** Each module asks specific questions (dims, material choice) and auto-generates a **Material List** and **Labor Estimate**.

### The Quote Builder (Phase 2)
*   **Editor:** A rich interface to adjust the auto-generated lines.
    *   Add/remove materials from the database.
    *   Adjust labor hours and rates per line item.
    *   Apply markup (Winstmarge) per section or globally.
*   **Interactive Preview:** See exactly what the client will see.
*   **PDF Generation:** One-click generation of a professional, branded PDF including:
    *   Cover letter (customizable).
    *   Itemized or aggregated pricing (user choice).
    *   Terms and conditions.
    *   Digital signature.

### Status Management
Tracks the lifecycle of a quote:
*   `Concept`: Draft mode.
*   `Verzonden`: Sent to client (locks the quote to prevent accidental edits).
*   `Geaccepteerd`: Client agreed (triggers export to Planning/Facturen).
*   `Geweigerd`: Client declined.
*   `Gefactureerd`: Fully processed.

---

### 3.1 Deep Dive: The Calculation Workflow
The calculation engine is the "brain" of the application. It follows a strict, data-driven workflow to ensure consistency and accuracy.

#### Step 1: Job Selection (Registry)
The process starts by selecting a "Work Package" from the **Job Registry**.
*   **The Registry:** A hardcoded configuration (`job-registry.ts`) that defines every possible job type (e.g., `Hellend Dak`, `Wanden`, `Vloeren`).
*   **Categories:** Jobs are grouped logically. For example, selecting "Wanden" reveals sub-types like `HSB Voorzetwand`, `Metal Stud`, or `Cinewall`.
*   **Benefit:** This ensures the user starts with the correct template, rather than a blank sheet.

#### Step 2: Dimensional Input (Measurement Fields)
Once a job is selected, the system loads the specific **Measurement Configuration** for that job.
*   **Dynamic Fields:** The app renders specific inputs defined in the code (e.g., `WALL_FIELDS` asks for Length/Height, while `BOEIBOORD_FIELDS` asks for Front/Bottom dimensions).
*   **Visual Aid:** A generated schematic or grid (e.g., for roofing tiles) often accompanies these inputs to help visualize the scale.
*   **Defaults:** Smart defaults (like standard beam spacing of 600mm) are pre-filled to speed up entry.

#### Step 3: Material Configuration (Material Sections)
The system then presents the **Material Sections** relevant to that specific job.
*   **Smart Filtering:** Each section (e.g., "Isolatie") is pre-configured to only show relevant products. For example, a "Metal Stud" wall will search the database for *Metalstud profielen*, ignoring wood beams.
*   **Selection:** The user selects a specific product for each required component (e.g., picking "120mm Rockwool" for the insulation section).
*   **Flexibility:** Users can add multiple layers or alternative options if distinct from the standard recommendation.

#### Step 4: The Calculation Engine ("The Black Box")
Behind the scenes, the `quote-calculations.ts` library processes all inputs into a final financial structure:
1.  **Normalization:** Converting disparate inputs (n8n webhooks, manual entry) into a standardized `DataJson` format.
2.  **Material Cost:** Summing all selected Major Materials + Consumables (Quantity × Price).
3.  **Labor Calculation:** `Total Hours × Hourly Rate`.
4.  **Transport Logic:** Determining travel costs based on:
    *   Distance (`Km × Rate`).
    *   Duration (Paying for travel time).
    *   Fixed fees (if configured).
5.  **Profit Margin (Winst):** Applying the configured margin (Percentage or Fixed) to the base cost.
6.  **VAT (BTW):** Calculating tax on the final subtotal.

#### Step 5: Output & Review
The result is a `QuoteTotals` object that feeds directly into the UI, showing a live breakdown of:
*   Subtotals for Materials vs. Labor.
*   Detailed Transport costs.
*   Profit analysis.
*   Final Client Price (Incl. VAT).

---

## 4. Facturen (Invoices)
The **Facturen** page handles the financial settlement of projects.

### Key Features
*   **Quote-to-Invoice:** One-click conversion from an accepted Quote. Allows generating:
    *   **Deposit Invoice (Aanbetaling):** e.g., 30% upfront.
    *   **Final Invoice (Eindfactuur):** Remainder.
    *   **Custom Invoice:** Free text invoicing.
*   **Status Tracking:**
    *   `Concept`: Draft.
    *   `Verzonden`: Awaiting payment.
    *   `Betaald`: Money received.
    *   `Te Laat`: Overdue (highlighted in Red).
*   **Smart Numbering:** Auto-increments invoice numbers based on settings (e.g., 2024-001).
*   **PDF Export:** Generates tax-compliant invoices with automatic BTW (VAT) calculations.

---

## 5. Winst (Profit & Analytics)
The **Winst** page offers deep financial insights, allowing the contractor to work *on* the business, not just *in* it.

### Functionality
*   **Period Analysis:** Toggle view between 1 month, 3 months, 6 months, or Year-to-Date.
*   **Real vs. Forecast:**
    *   **Forecast:** Projected profit based on accepted quotes.
    *   **Realized:** Actual profit based on paid invoices and logged expenses.
*   **Charts & Graphs:**
    *   **Revenue Flow:** Line chart comparing incoming payments vs. projected earnings.
    *   **Status Distribution:** Pie/Bar charts of invoice statuses.
*   **Top Lists:**
    *   **Most Profitable Projects:** Identifying which jobs yielded the highest margin.
    *   **Highest Outstanding:** Which clients owe the most money.
*   **Export:** Download full financial reports as CSV or PDF for accounting purposes.

---

## 6. Planning
The **Planning** module manages the execution phase of projects.

### Key Features
*   **Calendar View:** A visual Scheduler (Day/Week/Month).
*   **Project Allocation:** Drag-and-Drop projects onto the timeline.
*   **Resource Management:** Assign specific employees or teams to days.
*   **Project Phases:** Break down a project into "Ruwe bouw", "Afwerking", "Oplevering" and schedule them separately.
*   **Conflict Detection:** Visual indicators if double-booking resources.

---

## 7. Materialen / Producten
The **Materialen** page is the central database for all items used in calculations.

### Key Features
*   **Categorization:** Items organized by trade (Wood, Insulation, Fasteners, Roofing, etc.).
*   **Price Management:** detailed pricing (Unit price, Box price, Supplier).
*   **Units:** Defines how items are calculated (m¹, m², stuks, dozen).
*   **Presets:** Group materials into "smart groups" for quick insertion (e.g., a "Roof Tile Package" containing tiles, hooks, and battens).
*   **Updates:** changing a price here asks if you want to update active draft quotes.

---

## 8. Klanten (Clients)
The **Klanten** page serves as a lightweight CRM (Customer Relationship Management).

### Key Features
*   **Client Database:** Store Name, Address, Phone, Email, and Company details.
*   **History View:** Opening a client profile shows:
    *   Total revenue from this client.
    *   All associated Quotes and Invoices.
    *   Contact history.
*   **One-Click Action:** Call or Email directly from the interface.
*   **Address Integration:** Auto-fills address data into quotes to prevent typing errors.

---

## 9. Urenregistratie (Time Tracking)
The **Urenregistratie** module tracks actual labor vs. estimated labor.

### Key Features
*   **Live Timer:** "Punch-in/Punch-out" button for active jobs.
*   **Manual Entry:** Log hours at the end of the day.
*   **Project Association:** Every hour logged is linked to a specific Quote/Project.
*   **Analysis:** Compare "Sold Hours" (from Quote) vs. "Worked Hours" (from Registration) to determine true project profitability.
*   **Daily View:** Calendar strip to review the work week.

---

## 10. Archief
The **Archief** acts as the cold storage for finished business.

### Key Features
*   **Clean Workspace:**Keeps the main lists (Offertes/Facturen) focused on active work.
*   **Restore Capability:** Accidental archives can be restored to active status.
*   **Bulk Delete:** Permanent removal of old data for GDPR compliance or cleanup.
*   **Filter & Search:** Find old projects by client name or date.

---

## 11. Instellingen (Settings)
The **Instellingen** page configures the global behavior of the app.

### Key Features
*   **Bedrijfsgegevens:** Company Name, Address, KVK, BTW, IBAN. Used in PDF headers/footers.
*   **Branding:**
    *   **Logo Upload:** Upload company logo for documents.
    *   **Signature:** Upload digital signature for automatic signing.
*   **Financial defaults:**
    *   Default Hourly Rate (€/uur).
    *   Default VAT (BTW) rules.
    *   Default Profit Margin % (Winstmarge).
    *   Payment Terms (e.g., 14 days or 30 days).
*   **Document Config:**
    *   Quote Prefix (e.g., "OFF-2024-").
    *   Invoice Prefix (e.g., "FAC-2024-").
    *   Default Email Bodies & Terms text.
