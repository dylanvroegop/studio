import { z } from 'zod';
import { loadWorkspace, saveWorkspace } from '@/lib/vision/storage';
import { workspaceSchema, validWorkspace, retainsHistory } from '@/lib/vision/model';
import { json, visionRequest } from '@/lib/vision/http';
export const dynamic = 'force-dynamic';
export function GET(req: Request) {
  return visionRequest(req, async (uid) => json(await loadWorkspace(uid)));
}
export function PUT(req: Request) {
  return visionRequest(req, async (uid) => {
    const input = z
      .object({ revision: z.number().int().nonnegative(), document: workspaceSchema })
      .safeParse(await req.json().catch(() => null));
    if (!input.success || !validWorkspace(input.data.document))
      return json({ error: 'Controleer datums, koppelingen en veldlengtes.' }, 400);
    const { revision, document } = input.data,
      before = await loadWorkspace(uid);
    if (before.revision !== revision)
      return json({ error: 'Een andere sessie heeft wijzigingen opgeslagen.' }, 409);
    if (!retainsHistory(before.document, document))
      return json({ error: 'Een bestaande notitieversie mag niet verdwijnen of veranderen.' }, 400);
    return (await saveWorkspace(uid, revision, document))
      ? json({ revision: revision + 1 })
      : json({ error: 'Er zijn gelijktijdige wijzigingen.' }, 409);
  });
}
