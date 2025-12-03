# **App Name**: HoutOfferte

## Core Features:

- Dashboard: Display a list of quotes for the logged-in user.
- Client Management: Create, update, and manage client information.
- Quote Creation Wizard: Guide users through the process of creating a quote, including client selection, category selection, subcategory and dimension input, and material selection.
- Job Management: Create, update, and manage jobs (klussen) within a quote.
- Material Selection: Select materials for each job, including preset selection and custom material input.
- Extra Services: Add extra services like scaffolding or container rental to a quote.
- Quote Submission: Submit the quote to the external n8n service, changing its status to 'in_behandeling'.
- Data Storage: Store the user, client, quotes, jobs and materials data in Firestore collections

## Style Guidelines:

- Primary color: Deep red (#C70039) to evoke energy.
- Background color: Dark gray (#212121) for a modern dashboard feel.
- Accent color: Orange-red (#FF5733) to highlight calls to action.
- Body and headline font: 'Inter', a grotesque-style sans-serif, will create a machined, objective and neutral user interface.
- Use clear, consistent icons to represent different categories and actions.
- Employ a clean, spacious layout similar to Linear/Vercel dashboards, with clear hierarchy and minimal clutter.  Ensure responsiveness for laptop and tablet views.
- Use subtle transitions and animations to enhance user experience, particularly during quote creation and submission.