# Business Information: "Studio" / Offertehulp

## 1. Executive Summary
This application is a specialized **Estimation & Planning Platform** tailored for Dutch carpenters ("timmermannen") and renovation contractors. It bridges the gap between rough estimates and professional, profitable quoting. By combining technical calculation wizards with business management tools, it transforms a craftsman's knowledge into accurate material lists, precise labor estimates, and visually stunning proposals.

Unlike generic quoting software, "Studio" understands construction semantics—it knows that a "wall" implies beams, insulation, and panels, and automatically calculates the necessary materials including waste and consumables.

## 2. Mission & Core Value
**The Problem:** Carpenters are skilled craftsmen but often struggle with administration. Previous methods involve scribbling on notepads, guessing material quantities (risking under/over-quoting), and sending unprofessional text-based quotes.

**The Solution:** An intelligent "Construction Engineer in your Pocket" that standardizes the workflow:
1.  **Eliminate Guesswork:** Exact calculation of materials based on dimensions.
2.  **Financial Armor:** Automatically safeguards profit margins by factoring in waste, transport, and hidden "small material" costs.
3.  **Professional Polish:** Generates high-end PDF quotes with technical drawings that build trust with high-value clients.
4.  **Operational Clarity:** Integrated planning to schedule jobs and manage employees.

## 3. Core Workflow

The application follows a linear, logical flow designed to match how a contractor thinks about a project.

### Phase 1: The "Klus" (Job) Registry
At the heart of the system is the **Job Registry**. Instead of adding line items manually, the user selects "Jobs" that act as smart templates.
*   **Categories:** Wanden (Walls), Plafonds (Ceilings), Kozijnen (Frames), Daken (Roofs), etc.
*   **Parametric Input:** The user enters dimensions (e.g., "Wall: 4000mm x 2600mm") and selections (e.g., "PIR Insulation").
*   **Visual Validation:** The app generates immediate visual previews (2D/3D drawings) to confirm the input matches reality.

### Phase 2: The Quote Builder ("Offerte")
This is the main workspace, divided into focused tabs:
*   **Overzicht (Overview):** High-level summary of costs, client info, and profit.
*   **Materialen (Materials):** The engine room.
    *   *Groot Materiaal:* Major structural items (beams, plates) calculated from the geometry.
    *   *Verbruiksartikelen:* Consumables (screws, glue) often calculated as a percentage or fixed operational cost.
*   **Arbeid (Labor):** Labor estimation based on complexity and dimensions.
*   **Tekeningen (Drawings):** Automated generation of technical drawings for the PDF.
*   **PDF Preview:** Real-time WYSIWYG preview of the final document.

### Phase 3: Output & Execution
*   **PDF Generation:** A branded document is created, ensuring the client receives a clear, professional proposal.
*   **Planning:** Once accepted, the job moves to the **Planning Board**. This module allows dragging and dropping jobs onto employee timelines (Day/Week/Month views), ensuring efficient resource allocation.

## 4. Key Features & Capabilities

### 🧠 Intelligent Calculator
*   **Waste Correction:** Automatically splits total linear meters into purchasable lengths (e.g., 2700mm, 3600mm) and adds a configurable waste percentage.
*   **Dynamic "Klein Materiaal":** Forces a decision on small materials (often forgotten costs) by allowing a fixed surcharge or percentage calculation.

### 🎨 Dynamic Visualizers
*   Generates visual representations of the work (e.g., a cross-section of a wall or a window frame layout) based on user input.
*   These visualizers are captured and embedded into the PDF, providing the client with visual context of what they are buying.

### 📅 Advanced Scheduling (Planning)
*   **Multi-View Timeline:** Day, Week, and Month views to manage short-term execution and long-term capacity.
*   **Employee Management:** Assign specific tasks to specific workers.
*   **Status Tracking:** Track whether a job is "Planned", "In Progress", or "Completed".

### 📊 Dashboard & Analytics
*   **Pipeline Management:** Track quotes from "Concept" -> "Sent" -> "Accepted" -> "Invoiced".
*   **Live Metrics:** Real-time feedback on total project value and margins.

## 5. The Brain: Backend Automation & AI Architecture
Behind the scenes, the application leverages **n8n** (an advanced workflow automation tool) to serve as the "Construction Intelligence" backend. This communicates with Supabase and Google Gemini to determine materials and labor with agentic precision.

### The "CALCULATOR" Workflow
This specific backend workflow is triggered whenever a user requests an automated calculation. It is a multi-agent system designed to mimic a Senior Estimator.

**1. Data Retrieval Phase:**
*   **Context Gathering:** The workflow receives the raw job "slug" (e.g., `hsb_wand`) and user inputs.
*   **Knowledge Lookup:** It instantly queries the `KLUS_REGELS` database table in Supabase. This table holds the "Source of Truth"—technical formulas, required build layers, and construction standard—ensuring the AI doesn't hallucinate construction methods.

**2. The Multi-Agent Cognitive Chain:**
The data is passed through a series of specialized AI Agents, each with a strict persona and responsibility:

*   **Agent A: The Technical Writer (`Werkzaamheden`)**
    *   **Role:** Technical Copywriter.
    *   **Task:** Converts dry calculation data into a customer-facing "Work Description".
    *   **Output:** Generates a professional, step-by-step bullet list of actions (e.g., "Installeren van regelwerk h.o.h. 600mm") suitable for the final quote PDF. It explicitly avoids mentioning prices or quantities here, focusing purely on the *process* to build trust.

*   **Agent B: The Strict Calculator (`BEREKENING`)**
    *   **Role:** The Construction Mathematician.
    *   **Task:** Calculates the *exact* required big materials ("Grootmateriaal").
    *   **Rules:** It is bound by "Hard Rules"—it may ONLY calculate materials explicitly listed in the input or mandated by the `KLUS_REGELS`. It verifies dimensions, checks for openings (windows/doors) to deduct surface area, and applies standard waste margins.
    *   **Output:** A precise JSON list of materials with dimensions and counts.

*   **Agent C: The Logistics QA (`KLEIN MATERIAAL`)**
    *   **Role:** The Logistics Planner.
    *   **Task:** "The Forgotten Item Scanner". It analyzes the job to find missing consumables that weren't explicitly modeled.
    *   **Logic:** "If you are building a Gypsum ceiling, you *necessitate* drywall screws and joint filler." It calculates these based on project size, rounding up to whole purchasing units (boxes/rolls), ensuring the carpenter never has to drive back to the shop for a box of screws.

*   **Agent D: The Estimator (`UREN BEREKENING`)**
    *   **Role:** Senior Calculator / Planner.
    *   **Task:** Estimates labor hours.
    *   **Logic:** It analyzes the step-by-step plan generated by Agent A and the complexity of materials from Agent B. It applies market-conform labor norms (e.g., "how long does a professional take to frame 1m²?") to output a realistic total hour count, broken down by task phase.

**3. Execution & Storage Phase:**
*   **Result Aggregation:** The outputs from all agents (Materials, Consumables, Labor, Description) are merged into a single, cohesive quote object.
*   **Database Sync:** The final, enriched data is written directly back to the `quotes_collection` in Supabase, making it immediately available to the frontend user interface.

## 6. System Architecture
The application runs on a modern, robust stack:
*   **Frontend:** Next.js (React) for a responsive, fast user interface.
*   **Backend Logic:** **n8n** (hosted workflows) acting as the central intelligence controller.
*   **Data Layer:** Hybrid model using **Supabase** for relational data (products, calculation rules, user profiles) and **Firebase** for real-time document storage and authentication.
*   **AI Engine:** Google Gemini (via n8n) for natural language processing and semantic reasoning.
*   **Output Engine:** Client-side PDF generation (`jspdf`) coupled with HTML canvas capture for high-fidelity rendering of dynamic components.

## 7. Future Possibilities
Given the solid foundation, "Studio" is primed for expansion into a full ERP for small construction firms:

1.  **Client Portal:**
    *   Allow clients to view quotes online, approve digitally, and even select options (e.g., "Upgrade to Premium Insulation") themselves.
2.  **Inventory & Purchasing:**
    *   Directly export "Materialen" lists to supplier shopping carts.
    *   Deduct used materials from a virtual warehouse stock.
3.  **Financial Integration:**
    *   Convert an "Accepted Quote" directly into an invoice.
    *   Link with accounting software (e.g., Moneybird, e-boekhouden) for VAT returns.
4.  **Mobile Field App:**
    *   A simplified mobile view for on-site measurement taking.
    *   Employees can view their daily schedule and "check off" tasks from the planning board.
5.  **Post-Calculation:**
    *   Track *actual* hours vs. *estimated* hours to refine future quoting accuracy.

---
*Created by Antigravity Analysis - February 2026*
