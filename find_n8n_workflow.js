const fs = require('fs');

try {
    const content = fs.readFileSync('n8n_workflows.json', 'utf8');
    const workflows = JSON.parse(content);
    const targetName = "Material calculator + Work description";

    const wf = workflows.data.find(w => w.name === targetName);

    if (wf) {
        console.log(`Found Workflow ID: ${wf.id}`);
        console.log("Nodes:");
        wf.nodes.forEach(n => console.log(`- ${n.name} (${n.type})`));

        // Search case-insensitive just in case
        const berekiningNode = wf.nodes.find(n => n.name === 'Berekining' || n.name.toLowerCase() === 'berekining');

        // Also look for "Webhook" and "Supabase" nodes as requested in the ORIGINAL Prompt (Step 0)
        // "Can you give me a quick summary of what the 'Webhook' and the 'Supabase' nodes in that flow are doing?"
        // The user in Step 58 asked for 'Berekining', but let's be thorough if we can find them.

        if (berekiningNode) {
            console.log("\n--- Berekining Node Details ---");
            console.log(JSON.stringify(berekiningNode, null, 2));
        } else {
            console.log("\nNode 'Berekining' not found.");
        }

        const webhookNode = wf.nodes.find(n => n.type.includes('webhook') || n.name.toLowerCase().includes('webhook'));
        if (webhookNode) {
            console.log("\n--- Webhook Node Details ---");
            console.log(JSON.stringify(webhookNode, null, 2));
        }

        const supabaseNodes = wf.nodes.filter(n => n.type.includes('supabase') || n.name.toLowerCase().includes('supabase'));
        if (supabaseNodes.length > 0) {
            console.log("\n--- Supabase Node(s) Details ---");
            supabaseNodes.forEach(n => console.log(JSON.stringify(n, null, 2)));
        }


    } else {
        console.log(`Workflow '${targetName}' not found.`);
        // List available names to help debug
        console.log("Available workflows:");
        workflows.data.forEach(w => console.log(`- ${w.name}`));
    }
} catch (e) {
    console.error("Error parsing JSON:", e);
}
