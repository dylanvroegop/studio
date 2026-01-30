'use client';

import { useState, useEffect } from 'react';
import { generateQuotePDF, PDFQuoteData } from '@/lib/generate-quote-pdf';
import { FileText, Download, RefreshCw } from 'lucide-react';

interface PDFPreviewProps {
    pdfData: PDFQuoteData | null;
    onDownload: () => void;
}

export function PDFPreview({ pdfData, onDownload }: PDFPreviewProps) {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generatePreview = async () => {
        if (!pdfData) return;

        setLoading(true);
        setError(null);

        try {
            const blob = await generateQuotePDF(pdfData);
            const url = URL.createObjectURL(blob);

            // Cleanup old URL
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }

            setPreviewUrl(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Fout bij genereren PDF');
        } finally {
            setLoading(false);
        }
    };

    // Generate preview when data changes
    useEffect(() => {
        if (pdfData) {
            generatePreview();
        }

        // Cleanup on unmount
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [pdfData]);

    if (!pdfData) {
        return (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-12 text-center">
                <FileText size={48} className="mx-auto text-zinc-600 mb-4" />
                <h3 className="text-lg font-medium text-zinc-300 mb-2">Geen PDF preview</h3>
                <p className="text-zinc-500">
                    Vul eerst de materiaalprizen in om een PDF te kunnen genereren.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                    <FileText size={18} className="text-zinc-400" />
                    <h3 className="font-semibold text-white">PDF PREVIEW</h3>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={generatePreview}
                        disabled={loading}
                        className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded text-sm transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        Vernieuwen
                    </button>
                    <button
                        onClick={onDownload}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded text-sm transition-colors"
                    >
                        <Download size={14} />
                        Download PDF
                    </button>
                </div>
            </div>

            {/* Preview Area */}
            <div className="p-4">
                {loading && (
                    <div className="h-[600px] flex items-center justify-center">
                        <div className="text-zinc-400">PDF genereren...</div>
                    </div>
                )}

                {error && (
                    <div className="h-[600px] flex items-center justify-center">
                        <div className="text-red-400">{error}</div>
                    </div>
                )}

                {!loading && !error && previewUrl && (
                    <iframe
                        src={previewUrl}
                        className="w-full h-[700px] rounded border border-zinc-700"
                        title="PDF Preview"
                    />
                )}
            </div>
        </div>
    );
}
