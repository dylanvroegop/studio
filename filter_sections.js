const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/lib/material_category_name_test.json');

try {
    const data = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(data);

    const initialLength = json.length;
    const filteredJson = json.filter(item => !item["---SECTION---"]);
    const finalLength = filteredJson.length;

    console.log(`Original length: ${initialLength}`);
    console.log(`Filtered length: ${finalLength}`);
    console.log(`Removed ${initialLength - finalLength} items.`);

    fs.writeFileSync(filePath, JSON.stringify(filteredJson, null, 4), 'utf8');
    console.log('Successfully wrote filtered JSON to file.');
} catch (err) {
    console.error('Error processing file:', err);
}
