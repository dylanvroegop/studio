import { createClient } from '@supabase/supabase-js';

let cachedClient: ReturnType<typeof createClient> | null = null;
const CLOCK_SKEW_RETRY_DELAYS_MS = [750, 1_500, 3_000] as const;

function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchWithSupabaseClockSkewRetry(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    let response = await fetch(input, { ...init, cache: 'no-store' });

    for (const delay of CLOCK_SKEW_RETRY_DELAYS_MS) {
        if (response.ok) return response;
        const responseText = await response.clone().text().catch(() => '');
        if (!/jwt issued at future/i.test(responseText)) return response;
        await wait(delay);
        response = await fetch(input, { ...init, cache: 'no-store' });
    }

    return response;
}

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
        global: {
            fetch: fetchWithSupabaseClockSkewRetry,
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
