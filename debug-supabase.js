
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("Checking 'quotes_collection' schema...");
    const { data, error } = await supabase
        .from('quotes_collection')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error querying 'quotes_collection':", error);
    } else {
        console.log("Success! Found rows:", data.length);
        if (data.length > 0) {
            console.log("Sample Data Keys:", Object.keys(data[0]));
            console.log("Sample status:", data[0].status);
            console.log("Sample quoteid:", data[0].quoteid);
            console.log("Sample gebruikerid:", data[0].gebruikerid);
        } else {
            console.log("Table is empty or no rows accessible.");
        }
    }
}

checkSchema();
