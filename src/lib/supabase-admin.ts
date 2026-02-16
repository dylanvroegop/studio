import { createClient } from '@supabase/supabase-js';

let cachedClient: ReturnType<typeof createClient> | null = null;

function getSupabaseAdminClient() {
    if (cachedClient) return cachedClient;

    // Server-only admin client with Service Role Key
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable');
    }

    cachedClient = createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    return cachedClient;
}

export const supabaseAdmin = new Proxy({} as ReturnType<typeof createClient>, {
    get(_target, prop, receiver) {
        const client = getSupabaseAdminClient();
        const value = Reflect.get(client as object, prop, receiver);

        if (typeof value === 'function') {
            return value.bind(client);
        }
        return value;
    },
});
