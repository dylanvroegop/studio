import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function main(): Promise<void> {
  const uid = process.argv[2];
  const enableArg = process.argv[3];
  const enable = enableArg !== 'false';

  if (!uid) {
    throw new Error(
      'Gebruik: npx ts-node --transpile-only src/scripts/set-dev-claim.ts <UID> [true|false]'
    );
  }

  if (!getApps().length) {
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || 'studio-6011690104-60fbf',
    });
  }

  const auth = getAuth();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims || {}) } as Record<string, unknown>;

  if (enable) {
    claims.dev = true;
  } else {
    delete claims.dev;
  }

  await auth.setCustomUserClaims(uid, claims);
  // Nodig zodat de gebruiker weet dat opnieuw inloggen vereist is.
  console.log(`dev=${enable} gezet voor uid=${uid}. Log opnieuw in om de nieuwe claim te laden.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
