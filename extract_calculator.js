const fs = require('fs');
const workflows = JSON.parse(fs.readFileSync('n8n_workflows.json', 'utf8')).data;

const workflow = workflows.find(w => w.id === 'jNsZ7b8Vwc5FsLcg');
if (workflow) {
    fs.writeFileSync('calculator_workflow.json', JSON.stringify(workflow, null, 2));
    console.log("Extracted workflow to calculator_workflow.json");
} else {
    console.log("Workflow not found with ID jNsZ7b8Vwc5FsLcg");
}
