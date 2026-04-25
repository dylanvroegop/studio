'use client';

import { useState } from 'react';

export default function WhatsAppDebugPage() {
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const handleSendTest = async () => {
    setIsSending(true);
    try {
      const response = await fetch('/api/whatsapp-debug', {
        method: 'POST',
      });
      const data = await response.json().catch(() => null);

      const output = {
        httpStatus: response.status,
        ...(data ?? { ok: false, status: response.status, data: { error: 'Invalid JSON response' } }),
      };

      if (!response.ok) {
        console.error('[whatsapp-debug-page] non-ok response:', output);
      }

      setResult(output);
    } catch (error) {
      const output = {
        ok: false,
        status: 500,
        data: {
          error: error instanceof Error ? error.message : 'Unknown client error',
        },
      };
      console.error('[whatsapp-debug-page] request failed:', output);
      setResult(output);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        padding: 24,
        maxWidth: 900,
        margin: '0 auto',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>WhatsApp Debug</h1>
      <p style={{ marginTop: 0, marginBottom: 24, color: '#666' }}>
        Click the button to send a direct WhatsApp Cloud API text message to <code>31657540176</code>.
      </p>

      <button
        type="button"
        onClick={handleSendTest}
        disabled={isSending}
        style={{
          border: 0,
          borderRadius: 8,
          padding: '12px 18px',
          background: isSending ? '#8ecdb1' : '#16a34a',
          color: '#fff',
          cursor: isSending ? 'not-allowed' : 'pointer',
          fontSize: 16,
          fontWeight: 600,
        }}
      >
        {isSending ? 'Sending...' : 'Send WhatsApp Test'}
      </button>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Response</h2>
        <pre
          style={{
            margin: 0,
            padding: 16,
            borderRadius: 10,
            background: '#111827',
            color: '#e5e7eb',
            overflowX: 'auto',
            minHeight: 220,
            border: '1px solid #1f2937',
          }}
        >
          {JSON.stringify(
            result ?? {
              info: 'No request yet. Click "Send WhatsApp Test".',
            },
            null,
            2
          )}
        </pre>
      </section>
    </main>
  );
}
