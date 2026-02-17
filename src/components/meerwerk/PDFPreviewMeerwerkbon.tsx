'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';

import type { PDFMeerwerkbonData } from '@/lib/generate-meerwerkbon-pdf';
import { generateMeerwerkbonPDF } from '@/lib/generate-meerwerkbon-pdf';

interface PDFPreviewMeerwerkbonProps {
  pdfData: PDFMeerwerkbonData | null;
}

export function PDFPreviewMeerwerkbon({ pdfData }: PDFPreviewMeerwerkbonProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestObjectUrlRef = useRef<string | null>(null);
  const inFlightSignatureRef = useRef<string | null>(null);
  const lastCompletedSignatureRef = useRef<string | null>(null);
  const generationIdRef = useRef(0);
  const dataSignature = useMemo(() => (pdfData ? JSON.stringify(pdfData) : null), [pdfData]);

  const generatePreview = useCallback(async (signature: string, data: PDFMeerwerkbonData) => {
    const generationId = ++generationIdRef.current;

    setLoading(true);
    setError(null);
    inFlightSignatureRef.current = signature;

    try {
      const blob = await generateMeerwerkbonPDF(data);
      const url = URL.createObjectURL(blob);

      if (generationId !== generationIdRef.current) {
        URL.revokeObjectURL(url);
        return;
      }

      if (latestObjectUrlRef.current) {
        URL.revokeObjectURL(latestObjectUrlRef.current);
      }

      latestObjectUrlRef.current = url;
      setPreviewUrl(url);
      lastCompletedSignatureRef.current = signature;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij genereren PDF');
    } finally {
      if (inFlightSignatureRef.current === signature) {
        inFlightSignatureRef.current = null;
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pdfData && dataSignature) {
      if (inFlightSignatureRef.current === dataSignature) return;
      if (lastCompletedSignatureRef.current === dataSignature) return;
      void generatePreview(dataSignature, pdfData);
    }
  }, [dataSignature, generatePreview, pdfData]);

  useEffect(() => {
    return () => {
      if (latestObjectUrlRef.current) {
        URL.revokeObjectURL(latestObjectUrlRef.current);
        latestObjectUrlRef.current = null;
      }
    };
  }, []);

  if (!pdfData) {
    return (
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-12 text-center">
        <FileText size={48} className="mx-auto text-zinc-600 mb-4" />
        <h3 className="text-lg font-medium text-zinc-300 mb-2">Geen PDF preview</h3>
        <p className="text-zinc-500">
          Vul eerst de gegevens in om de meerwerkbon-PDF te tonen.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
      <div className="p-4 relative">
        {loading && !previewUrl && (
          <div className="h-[600px] flex items-center justify-center">
            <div className="text-zinc-400">PDF genereren...</div>
          </div>
        )}

        {error && (
          <div className="h-[600px] flex items-center justify-center">
            <div className="text-red-400">{error}</div>
          </div>
        )}

        {!error && previewUrl && (
          <iframe
            src={previewUrl}
            className="w-full h-[850px] rounded border border-zinc-700"
            title="Meerwerkbon PDF Preview"
          />
        )}

        {loading && previewUrl && (
          <div className="absolute right-8 top-8 bg-zinc-900/85 text-zinc-200 text-xs px-3 py-1.5 rounded border border-zinc-700">
            PDF vernieuwen...
          </div>
        )}
      </div>
    </div>
  );
}
