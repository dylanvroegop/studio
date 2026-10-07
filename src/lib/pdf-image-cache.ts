const MAX_IMAGES = 8;
const CACHE_TTL_MS = 5 * 60 * 1000;
const imageRequests = new Map<string, { expiresAt: number; request: Promise<string> }>();

/** Hergebruik logo's, handtekeningen en foto's binnen opeenvolgende PDF-renders. */
export function loadPdfImage(url: string): Promise<string> {
  const cached = imageRequests.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.request;

  const request = (async () => {
    const response = await fetch(`/api/logo-to-base64?url=${encodeURIComponent(url)}`);
    if (!response.ok) throw new Error('Kon afbeelding niet ophalen via API');
    const json = await response.json();
    if (typeof json?.dataUrl !== 'string' || !json.dataUrl) throw new Error('Geen afbeelding ontvangen');
    return json.dataUrl as string;
  })();

  imageRequests.delete(url);
  imageRequests.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, request });
  if (imageRequests.size > MAX_IMAGES) imageRequests.delete(imageRequests.keys().next().value as string);
  void request.catch(() => {
    if (imageRequests.get(url)?.request === request) imageRequests.delete(url);
  });
  return request;
}
