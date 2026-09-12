import { google } from 'googleapis';
import { getGoogleOAuthClient, type GoogleCalendarTokens } from './google-calendar';

export async function getGmailClient(tokens: GoogleCalendarTokens) {
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
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    credentials: oauth2Client.credentials,
  };
}

export function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
