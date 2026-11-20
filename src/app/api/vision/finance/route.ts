import { json, visionRequest } from '@/lib/vision/http';
import { readFinances } from '@/lib/vision/finance-server';
import { loadWorkspace } from '@/lib/vision/storage';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;
export function GET(req: Request) {
  return visionRequest(req, async (uid) => {
    const { document } = await loadWorkspace(uid);
    return json(await readFinances(req, uid, document, req.headers.get('X-Knab-Kosten-Iban') ?? ''));
  });
}
