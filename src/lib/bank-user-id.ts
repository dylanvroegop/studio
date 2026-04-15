import { createHash } from 'crypto';

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function md5ToUuid(input: string): string {
  const hash = createHash('md5').update(input).digest('hex');
  const part1 = hash.slice(0, 8);
  const part2 = hash.slice(8, 12);
  const part3 = `4${hash.slice(13, 16)}`;
  const variantNibble = (parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8;
  const part4 = `${variantNibble.toString(16)}${hash.slice(17, 20)}`;
  const part5 = hash.slice(20, 32);
  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

export function deriveBankUserId(firebaseUid: string): string {
  const normalized = firebaseUid.trim();
  if (!normalized) throw new Error('Missing Firebase uid.');
  if (isUuidLike(normalized)) return normalized.toLowerCase();
  return md5ToUuid(`calvora-bank:${normalized}`);
}

