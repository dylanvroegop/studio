import { createHash } from 'node:crypto';
import { initFirebaseAdmin } from '@/firebase/admin';
import { classifyProduct, productKey } from '@/lib/purchase-product-category';
import { normalizeProjectCostCategory, type ProjectCostLineItem, type ProjectCostCategory } from '@/lib/project-costs';
const keyId = (name: string): string => createHash('sha256').update(productKey(name)).digest('hex');
export async function classifyPurchaseLines(uid: string, lines: ProjectCostLineItem[], reviewedDescriptions: string[] = []): Promise<{ lines: ProjectCostLineItem[]; uncertain: string[] }> {
  const { firestore } = initFirebaseAdmin();
  const names = [...new Set(lines.map(line => line.description).filter(Boolean))];
  const memory = new Map<string, ProjectCostCategory>();
  // Exact product, geen leverancier- of merkbrede overschrijving.
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const docs = await firestore.getAll(...chunk.map(name => firestore.collection('users').doc(uid).collection('product_category_rules').doc(keyId(name))));
    docs.forEach((doc, index) => { if (doc.exists) memory.set(productKey(chunk[index]), normalizeProjectCostCategory(doc.data()?.category)); });
  }
  const uncertain: string[] = [];
  const reviewed = new Set(reviewedDescriptions.map(productKey));
  return { lines: lines.map(line => {
    const decision = classifyProduct(line.description, line.category, memory.get(productKey(line.description)), reviewed.has(productKey(line.description)));
    if (decision.source === 'needs_review') uncertain.push(line.description);
    return { ...line, category: decision.category };
  }), uncertain };
}
export async function rememberCategoryCorrections(uid: string, before: ProjectCostLineItem[], after: ProjectCostLineItem[]): Promise<void> {
  const { firestore } = initFirebaseAdmin();
  const changes = after.filter(line => line.category && before.some(old => productKey(old.description) === productKey(line.description) && old.category !== line.category));
  for (const line of changes) {
    if (new Set(after.filter(other => productKey(other.description) === productKey(line.description)).map(other => other.category)).size !== 1) continue;
    await firestore.collection('users').doc(uid).collection('product_category_rules').doc(keyId(line.description)).set({
      description: line.description, category: line.category, source: 'manual_cost_edit', updatedAt: new Date(),
    });
  }
}
