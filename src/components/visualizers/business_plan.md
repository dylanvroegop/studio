Business Overview: Offertehulp


The AI-Powered Estimating Assistant for Dutch Carpenters
1. The Core Problem (The "Why")
Carpenters are skilled craftsmen, not administrative assistants. Currently, 80% of simple renovation jobs require hours of manual administrative work—calculating materials, checking prices, and typing out descriptions.
* The Pain Point: A typical quote takes 1–2 hours.
* The Goal: Reduce this to 5–10 minutes, allowing the carpenter to focus on billable hours.
2. The Solution (The "How")
A web-based application powered by n8n automation and AI agents. The system takes raw inputs (measurements, photos, simple lists) and instantly converts them into professional, accurately priced, and technically detailed PDF quotes.


3. Key Value Propositions
🏗️ Pillar 1: Intelligent Automation (Speed & Structural Logic)
It’s not just a calculator; it’s a construction engineer in your pocket.
* Structural Material Logic (New): Unlike basic calculators, the system understands construction physics. By entering technical specs like "Balkafstand h.o.h." (Center-to-Center spacing), the app automatically determines the exact number of beams, insulation batts, and plating required for walls or ceilings. No more manual counting.
* "Werkwijze" Templates (New): Save your preferred construction methods (e.g., "My Standard HSB Wall"). Next time, select the template, enter the dimensions, and the entire material list is populated instantly.
* AI-Generated Work Descriptions: The system automatically expands simple input keywords into professional scope-of-work texts (e.g., input "gipsplafond" $\rightarrow$ output "Bevestigen balken, plaatsen gipsplaten AK2 2600x1200, afwerken naden met kit").
* AI Hour Estimation: An AI agent analyzes the specific job scope (including complexity) and estimates the required labor hours based on industry standards, removing the guesswork.
* Automated Logistics: Automatically calculates the distance from the carpenter’s home to the specific job site address and applies your preset transport fee (e.g., €0.32/km or fixed fee).
💰 Pillar 2: Financial Armor (Profit Security)
Stops the "Profit Leakage" caused by forgetting small items or underestimating overheads.
* Consumables & Rental Capture (New): Builders often lose money on "invisible" costs. The app forces a decision on "Klein materiaal" (screws, glue, tape)—via algorithm, percentage, or fixed fee—and includes specific fields for Equipment Rentals (Scaffolding, Aerial platforms, Waste containers) to ensure these are passed to the client, not paid from your pocket.
* Dynamic Profit Control (New): A dedicated Profit Margin tool (Percentage or Fixed Amount) allows you to lock in your desired margin on top of raw costs before the quote is finalized.
* Real-Time Price Builder: Carpenters upload their supplier CSVs; the system instantly matches the calculated materials to current prices.
* Smart Brand Picking: The system prioritizes the carpenter’s preferred brands from their uploaded price lists, but allows for manual "Custom Product" creation (with dimension-based pricing) if a specific item isn't in the database.
* Post-Calculation (Nacalculatie) Dashboard: A "True Cost" feature where you forward supplier PDF invoices to the system $\rightarrow$ AI extracts data $\rightarrow$ Auto-matches to the job reference $\rightarrow$ Calculates your actual realized profit versus the quoted profit.
👔 Pillar 3: Professional Authority (Image & Trust)
Win higher-value contracts by looking like a larger, more organized company.
* Technical Breakdown Transparency: By selecting specific categories (e.g., "HSB Voorzetwand") and detailing dimensions, the final quote reflects a deep technical understanding of the job, instilling confidence in the client.
* Professional PDF Generation: Instantly creates a branded, legally sound PDF quote with itemized costs, clear work descriptions, and separated overheads.
* "Meerwerk" (Change Order) Management: A dedicated feature to quickly add extra work/materials during a job, generating a separate template that can be digitally signed by the client immediately.
* Smart Client Management: Distinguishes between Private and Business clients (adjusting VAT rules accordingly) and handles different Billing vs. Project addresses seamlessly.
* AI Client Communication: Sends the final quote via email with AI-personalized text, ensuring tone and clarity are perfect every time.

4. Additional Potential Value (New Ideas)
Based on your current setup, here are 4 extra features that could increase stickiness:
* ⚡ Direct Supplier Ordering (One-Click Shopping): Since you already have the calculated material list and the supplier CSV, create a feature that generates a "Shopping List" email sent directly to their account manager at the building supply store (Bouwmaat, Stiho, etc.).
* ⚡ "Lead-to-Cash" CRM Lite: A simple dashboard showing: New Requests > Quotes Sent > Quotes Won > Jobs Completed. This helps them see their conversion rate.
* ⚡ Automated Warranty Certificate: Upon job completion, the system could auto-generate a generic "Garantiebewijs" (Warranty Certificate) for the work done, adding massive perceived value for their end client.
* ⚡ Seasonal Material Price Alerts: If the system notices wood prices in their CSV have gone up by 10%, send them an alert: "Warning: Wood prices increased. We have adjusted your default quotes automatically."

5. Finalized Pricing Model: "Dynamic Freedom Pricing" (Pass-Through)
* Tier 1: Small Jobs (Project Value €0 – €2,500)
    * Cost to Carpenter: €15
    * Suggested Client Charge: €35
    * Carpenter Profit: +€20
    * Use Case: Small repairs, single door hanging, maintenance.
* Tier 2: Standard Jobs (Project Value €2,500 – €15,000)
    * Cost to Carpenter: €35
    * Suggested Client Charge: €75
    * Carpenter Profit: +€40
    * Use Case: Attic renovations, walls, ceilings, single room refits.
* Tier 3: Large Projects (Project Value €15,000+)
    * Cost to Carpenter: €65
    * Suggested Client Charge: €125
    * Carpenter Profit: +€60
    * Use Case: Full extensions, complete home renovations, complex structural work.
2. The Credit System (Cash Flow Strategy)
To secure revenue upfront and solve the "Winter Season" fear, credits are purchased in packs and never expire.
* Starter Pack: €100 credits for €100 (Pay as you go).
* Pro Pack: €300 credits for €250 (15% Discount - Encourages bulk buying).
* Agency Pack: €600 credits for €450 (25% Discount - For 1-5 man firms).
3. The "Pass-Through" Implementation
* In-App Feature: On the final "Overview & Extras" screen, add a pre-checked toggle: ✅ Add "Technical Calculation & Prep" to Quote?
* PDF Output: The client sees a professional line item: "Technische Werkvoorbereiding & Calculatie" (Includes: Detailed material measurement, waste calculation, and technical specification).
4. Revenue Projection (Per Single Active C

Workflow: Step-by-Step
1. Project Initialization & Client Data
The workflow begins by defining the relationship and contact details for the specific job.
* Client Classification: Selection between Private (Particulier) or Business (Zakelijk).
* Contact Information: Standard input for name, email, and phone number.
* Location:
    * Billing Address: The primary address for the invoice.
    * Project Address: A toggle allows for a different location if the work site differs from the billing address.
2. Category Selection
The user selects the broad scope of work from a visual dashboard.
* Available Categories:
    * Walls (Wanden): Indoor and outdoor wall construction.
    * Ceilings (Plafonds): Wood or metal stud framing.
    * Floors (Vloeren): Subfloors and wooden flooring.
    * Roofing (Dakrenovatie): Complete renovations.
    * Insulation (Isolatiewerken): Thermal upgrades for various surfaces.
    * Joinery (Kozijnen & Deuren): Frames and door hanging.
3. Job Configuration (Specifics)
After selecting a category (e.g., Walls), the specific construction method is defined to determine the calculation logic.
* Construction Types:
    * HSB (Timber Frame): Options for pre-walls (single cladding), partition walls (double cladding), or exterior walls.
    * Metal Stud: Steel profile alternatives to timber framing.
    * Custom: Option for "Other" wall types with non-standard buildups.
4. Dimensional Input & Technical Specs
This step drives the automated material calculations.
* Measurements: Input fields for Length and Height (in mm).
* Structural Layout: Input for Beam Spacing (Balkafstand h.o.h.).
    * Note: The app uses this spacing metric to automatically calculate the required number of beams and insulation batts.
* Remarks: A text field for specific project details or anomalies.
5. Material & Method Selection
The user defines exactly what materials will be used for the calculated dimensions.
* Templates (Werkwijze): Users can select saved templates (e.g., "Standard Method") to auto-populate the material list.
* Component Layers: The app breaks the wall down into layers:
    * Framework (e.g., Rough Spruce 22x50mm).
    * Insulation layer.
    * Plating/Cladding (e.g., Gypsum or Fermacell).
* Editing: Individual components can be swapped out or modified directly from this view.
6. Material Database Management
When adding or changing materials, the system offers two paths:
* Database Search: A searchable catalog of supplier products (e.g., Jongeneel) showing live pricing per meter/unit.
* Custom Product Creation: Manual entry for items not in the database.
    * Required Data: Name, Unit (e.g., per m²), Price, and Dimensions (LxWxH).
    * Auto-Calc: The system calculates the "Price per piece" based on the input dimensions and unit price.
7. Consumables & "Small Material"
Handling of miscellaneous items (screws, glue, tape) usually difficult to quantify.
* Calculation Options:
    * Algorithm: An automatic estimation based on the job size.
    * Percentage: A set % of the total material cost.
    * Fixed Fee: A flat rate added to the quote.
    * None: Exclude consumables.
8. Project Overheads (Non-Material Costs)
Before finalizing, operational costs are added to the quote.
* Equipment Rental: Dedicated fields for logging costs for:
    * Scaffolding (Steiger)
    * Aerial Work Platforms (Hoogwerker)
    * Waste Containers (Afvalcontainer)
    * Frequency: Costs can be set per day, week, or per job.
* Transport: Options to charge a specific rate per km (auto-calculated distance) or a fixed travel fee.
9. Profit Margin & Finalization
The final financial adjustment before submission.
* Margin Settings:
    * Percentage: Markup applied to the total cost.
    * Fixed Amount: A flat profit fee added on top.
* Review & Submit: The dashboard displays a summary of all job components and costs. Clicking "Submit Quote" (Offerte indienen) processes the data, finalizing the document for the client (approx. processing time 30-60 mins).

