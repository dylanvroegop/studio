// This file is intended for server-side use only.
// It contains sensitive information and should not be exposed to the client.

if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID is not set');
}
if (!process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('FIREBASE_CLIENT_EMAIL is not set');
}
if (!process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('FIREBASE_PRIVATE_KEY is not set');
}

export const adminConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
}
