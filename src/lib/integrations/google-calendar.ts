import { google } from 'googleapis';

export interface GoogleCalendarTokens {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
}

export function isGoogleInvalidGrantError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const row = error as {
    message?: unknown;
    response?: { data?: { error?: unknown } };
  };
  return row.response?.data?.error === 'invalid_grant'
    || (typeof row.message === 'string' && row.message.includes('invalid_grant'));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} ontbreekt`);
  return value;
}

export function getGoogleOAuthClient() {
  const clientId = requireEnv('GOOGLE_CALENDAR_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CALENDAR_CLIENT_SECRET');
  const redirectUri = requireEnv('GOOGLE_CALENDAR_REDIRECT_URI');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getCalendarClient(tokens: GoogleCalendarTokens) {
  const oauth2Client = getGoogleOAuthClient();
  oauth2Client.setCredentials({
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken,
    expiry_date: tokens.expiryDate,
  });

  if (!tokens.accessToken || (tokens.expiryDate && tokens.expiryDate <= Date.now() + 60_000)) {
    const refreshed = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(refreshed.credentials);
  }

  return {
    calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
    credentials: oauth2Client.credentials,
  };
}
