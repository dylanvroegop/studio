import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load .env first
dotenv.config();

// Load .env.local if it exists (overriding .env)
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

const n8nUrl = process.env.N8N_BASE_URL || 'https://n8n.dylan8n.org/api/v1';
const n8nKey = process.env.N8N_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function checkConnections() {
    console.log('🚀 Starting Offertehulp Environment Check...');

    // 1. Check Supabase
    try {
        const supabase = createClient(supabaseUrl!, supabaseKey!);
        const { data, error } = await supabase.from('materialen').select('count', { count: 'exact', head: true });
        if (error) throw error;
        console.log('✅ Supabase: Connected (Materials table accessible)');
    } catch (e) {
        console.error('❌ Supabase: Connection Failed - Check your Service Role Key');
    }

    // 2. Check n8n API
    try {
        const response = await axios.get(`${n8nUrl}/workflows`, {
            headers: { 'X-N8N-API-KEY': n8nKey }
        });
        console.log(`✅ n8n: Connected (${response.data.data.length} workflows found)`);
    } catch (e) {
        console.error('❌ n8n: Connection Failed - Check API Key or /api/v1 path', e);
    }

    // 3. Check Webhook URLs (from your .env)
    const webhooks = [
        process.env.N8N_MATERIALEN_UPSERT_URL,
        process.env.N8N_WEBHOOK_URL
    ];

    for (const url of webhooks) {
        if (url) {
            console.log(`📡 Webhook Active: ${url.split('/').pop()}`);
        }
    }
}

checkConnections();
