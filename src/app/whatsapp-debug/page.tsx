'use client';

import { useState } from 'react';
import { useUser } from '@/firebase';

export default function WhatsAppDebugPage() {
  const { user } = useUser();
  const [isSending, setIsSending] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [deliveryResult, setDeliveryResult] = useState<unknown>(null);
  const [messageId, setMessageId] = useState('');

  const handleSendTest = async () => {
    setIsSending(true);
    try {
      const token = await user?.getIdToken();
      const response = await fetch('/api/whatsapp-debug', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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

      const id = (output as { data?: { messages?: Array<{ id?: string }> } })?.data?.messages?.[0]?.id;
      if (typeof id === 'string' && id.trim()) {
        setMessageId(id.trim());
      }
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

  const handleCheckDelivery = async () => {
    if (!messageId.trim()) return;
    setIsCheckingStatus(true);
    try {
      const token = await user?.getIdToken();
      const response = await fetch(`/api/whatsapp/delivery-status?messageId=${encodeURIComponent(messageId.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await response.json().catch(() => null);
      const output = {
        httpStatus: response.status,
        ...(data ?? { ok: false, message: 'Invalid JSON response' }),
      };
      if (!response.ok) {
        console.error('[whatsapp-debug-page] delivery status error:', output);
      }
      setDeliveryResult(output);
    } catch (error) {
      const output = {
        ok: false,
        status: 500,
        message: error instanceof Error ? error.message : 'Unknown client error',
      };
      console.error('[whatsapp-debug-page] delivery status failed:', output);
      setDeliveryResult(output);
    } finally {
      setIsCheckingStatus(false);
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
        disabled={isSending || !user}
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

      <section style={{ marginTop: 16, display: 'grid', gap: 8, maxWidth: 520 }}>
        <label htmlFor="messageId" style={{ fontSize: 14, color: '#666' }}>Message ID</label>
        <input
          id="messageId"
          value={messageId}
          onChange={(event) => setMessageId(event.target.value)}
          placeholder="wamid...."
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #374151',
            background: '#111827',
            color: '#e5e7eb',
          }}
        />
        <button
          type="button"
          onClick={handleCheckDelivery}
          disabled={isCheckingStatus || !messageId.trim() || !user}
          style={{
            border: 0,
            borderRadius: 8,
            padding: '10px 16px',
            background: isCheckingStatus ? '#7597d6' : '#2563eb',
            color: '#fff',
            cursor: isCheckingStatus ? 'not-allowed' : 'pointer',
            fontSize: 14,
            fontWeight: 600,
            width: 'fit-content',
          }}
        >
          {isCheckingStatus ? 'Checking...' : 'Check Delivery Status'}
        </button>
      </section>

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

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 10 }}>Delivery Status</h2>
        <pre
          style={{
            margin: 0,
            padding: 16,
            borderRadius: 10,
            background: '#0b1220',
            color: '#dbeafe',
            overflowX: 'auto',
            minHeight: 180,
            border: '1px solid #1e293b',
          }}
        >
          {JSON.stringify(
            deliveryResult ?? {
              info: 'No delivery lookup yet. Paste/capture a message ID and click "Check Delivery Status".',
            },
            null,
            2
          )}
        </pre>
      </section>
    </main>
  );
}
