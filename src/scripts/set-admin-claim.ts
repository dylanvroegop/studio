import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

async function main(): Promise<void> {
  const uid = process.argv[2];
  const enableArg = process.argv[3];
  const enable = enableArg !== 'false';

  if (!uid) {
    throw new Error(
      'Gebruik: npx ts-node --transpile-only src/scripts/set-admin-claim.ts <UID> [true|false]'
    );
  }

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-6011690104-60fbf',
    });
  }

  const auth = getAuth();
  const firestore = getFirestore();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}) } as Record<string, unknown>;

  if (enable) {
    claims.admin = true;
  } else {
    delete claims.admin;
  }

  await auth.setCustomUserClaims(uid, claims);

  await firestore.collection('admin_roles').doc(uid).set(
    {
      uid,
      email: user.email || null,
      role: 'admin',
      active: enable,
      grantedByUid: null,
      grantedByEmail: null,
      grantedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(`admin=${enable} gezet voor uid=${uid}. Log opnieuw in om de nieuwe claim te laden.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
