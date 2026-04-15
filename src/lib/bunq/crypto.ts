import { createSign, generateKeyPairSync, randomUUID } from 'crypto';

export function generateRsaKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'pkcs1',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs1',
      format: 'pem',
    },
  });

  return {
    privateKeyPem: privateKey,
    publicKeyPem: publicKey,
  };
}

export function signBodyWithPrivateKey(body: string, privateKeyPem: string): string {
  const signer = createSign('RSA-SHA256');
  signer.update(body, 'utf8');
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

export function buildRequestId(): string {
  return randomUUID();
}
