# Business Plan: Offertehulp

## Business Overview
**Offertehulp** is an AI-powered estimating assistant designed specifically for Dutch carpenters ("timmermannen"). It solves the critical pain point of time-consuming, inaccurate, and unprofessional quoting.

## The Problem
Carpenters are craftsmen, not administrators. They struggle with:
- **Time Loss**: Spending evenings/weekends on quotes instead of resting or working.
- **Accuracy**: Guessing material quantities leads to underquoting (loss) or overquoting (losing jobs).
- **Professionalism**: Sending simple WhatsApp messages or messy emails instead of proper PDF quotes.

## The Solution
An intelligent web app that guides the carpenter through a "Wizard" specific to their trade (e.g., placing specific walls, roofs, frames).
- **Inputs**: Measurements (Height, Length, Shape), Choices (Material X, Finish Y).
- **Processing**: The app calculates EXACT material lists (beams, plates, screws, paint) based on construction formulas.
- **Output**: A professional, itemized PDF quote + material list for ordering.

## Key Value Propositions

### 1. Intelligent Automation ("Construction Engineer in your Pocket")
It’s not just a calculator. By entering technical specs (e.g., "Wall: 4m x 3m, 60cm beam spacing"), the app automatically determines the exact number of beams, insulation plates, and screws required.

### 2. Financial Armor
- **Waste Correction**: Automatically splits quantities into purchasable units (e.g., standard beam lengths) and adds waste percentage.
- **Klein Materiaal**: Forces a decision on "Small Materials" (screws, glue) – either a fixed % or calculated amount – ensuring this hidden cost is covered.

### 3. Professional Authority
Generates sleek, branded PDF quotes that win trust and justify higher prices.

## Data Structure Requirements (Firestore)
To support this, the data model must capture:
- **Client Info**: Name, Address, Project Address.
- **Job Details** ("Klussen"):
  - **Meta**: Title, Category (Wams, Roof, etc.), Description.
  - **Measurements** ("Maatwerk"): The raw input measurements (L, W, H, Shape, etc.).
  - **Materials** ("Materialen"):
    - **Selections**: Specific products selected from the database (IDs).
    - **Custom**: Manually added line items.
  - **Costs**:
    - **Klein Materiaal**: Config (Percentage/Fixed).
    - **Calculated**: (Ideally, we store the frozen calculated list or let n8n derive it).
- **Business Logic**:
  - **Profit Margin**: Global or per-job margin settings.
  - **Labour**: Hourly rate and estimated hours.
  - **Overhead**: Call-out fees, parking, equipment rentals.

## Workflow
1. **Client Intake**: Fill in client details.
2. **Job Config**: Select "Wand" -> "Voorzetwand". Enter dimensions. Visualizer confirms.
3. **Materials**: Select "Wood Type", "Insulation". App suggests defaults.
4. **Extras**: Add "Container Hire" or "Scaffolding".
5. **Review**: Adjust hours, margins.
6. **Generate**: Send to n8n -> PDF.
