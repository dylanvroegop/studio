'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type DebugResult = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  durationMs?: number;
  message?: string;
  sent?: {
    url: string;
    method: string;
    headerName: string;
    secretLength: number;
    secretSha256Prefix: string;
    payload: Record<string, unknown>;
  };
  received?: {
    headers: Record<string, string>;
    body: unknown;
  };
};

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export default function N8nWebhookDebugPage() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [result, setResult] = useState<DebugResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const responseBody = useMemo(() => {
    if (!result?.received) return '';
    return typeof result.received.body === 'string'
      ? result.received.body
      : formatJson(result.received.body);
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/debug/n8n-webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ webhookUrl }),
      });
      const json = await response.json() as DebugResult;
      setResult(json);
      if (!response.ok) {
        setError(json.message || 'De debug request is mislukt.');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'De debug request is mislukt.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">Debug</p>
          <h1 className="text-3xl font-semibold">n8n webhook trigger</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Verstuur een server-side POST request vanuit Calvora naar je n8n webhook met de huidige
            <span className="font-mono"> x-offertehulp-secret</span> header.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="space-y-2">
            <Label htmlFor="webhook-url">n8n webhook URL</Label>
            <Input
              id="webhook-url"
              value={webhookUrl}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder="https://n8n.srv1553475.hstgr.cloud/webhook/..."
              autoComplete="off"
              required
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting || webhookUrl.trim().length === 0}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Verstuur request
            </Button>
            {result?.durationMs !== undefined ? (
              <span className="text-sm text-muted-foreground">{result.durationMs} ms</span>
            ) : null}
          </div>
        </form>

        {error ? (
          <section className="rounded-lg border border-red-500/40 bg-red-950/20 p-4 text-sm text-red-100">
            {error}
          </section>
        ) : null}

        {result?.sent ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-lg font-semibold">Verzonden door app</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Header</dt>
                  <dd className="font-mono">{result.sent.headerName}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Key lengte</dt>
                  <dd className="font-mono">{result.sent.secretLength}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">SHA-256 prefix</dt>
                  <dd className="font-mono">{result.sent.secretSha256Prefix}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-mono">
                    {result.status ?? '-'} {result.statusText ?? ''}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-lg font-semibold">Response van n8n</h2>
              <Textarea
                readOnly
                value={responseBody}
                className="mt-4 min-h-56 resize-y font-mono text-xs"
              />
            </div>
          </section>
        ) : null}

        {result ? (
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">Volledige debug output</h2>
            <Textarea
              readOnly
              value={formatJson(result)}
              className="mt-4 min-h-80 resize-y font-mono text-xs"
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}
