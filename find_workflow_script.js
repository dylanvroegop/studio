const fs = require('fs');
const workflows = JSON.parse(fs.readFileSync('n8n_workflows.json', 'utf8'));

// The structure seems to be { data: [ ...workflows... ] } based on the file preview
const workflowList = workflows.data || workflows;

console.log("Found " + workflowList.length + " workflows.");
workflowList.forEach(w => {
    if (w.name.toLowerCase().includes('calculator')) {
        console.log(`Found workflow: ID=${w.id}, Name="${w.name}"`);
    }
});
