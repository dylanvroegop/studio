import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { emptyWorkspace, workspaceSchema, type Workspace } from './model';

export async function loadWorkspace(uid: string) {
  const { data, error } = await supabaseAdmin
    .from('vision_workspaces')
    .select('revision,document')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) throw error;
  return {
    revision: Number(data?.revision ?? 0),
    document: data ? workspaceSchema.parse(data.document) : emptyWorkspace(),
  };
}
export async function saveWorkspace(uid: string, revision: number, document: Workspace): Promise<boolean> {
  const values = { revision: revision + 1, document, updated_at: new Date().toISOString() };
  if (revision === 0) {
    const { error } = await supabaseAdmin.from('vision_workspaces').insert({ ...values, user_id: uid });
    if (error?.code === '23505') return false;
    if (error) throw error;
    return true;
  }
  const { data, error } = await supabaseAdmin
    .from('vision_workspaces')
    .update(values)
    .eq('user_id', uid)
    .eq('revision', revision)
    .select('revision')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
