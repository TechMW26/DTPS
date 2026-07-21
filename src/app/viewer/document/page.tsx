'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, AlertCircle, Loader2, FileText } from 'lucide-react';
import {
  getMediaKind,
  getMediaProxyUrl,
  resolveDocumentViewerSource,
} from '@/lib/media';

function DocumentViewerContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const url = searchParams.get('url') || '';
  const filename = searchParams.get('filename') || 'Document';
  const mimeType = searchParams.get('mimeType') || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');

  useEffect(() => {
    if (!url) {
      setError(true);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    void resolveDocumentViewerSource(
      url,
      filename,
      mimeType,
      controller.signal,
    )
      .then((resolvedUrl) => {
        setViewerUrl(resolvedUrl);
        setLoading(false);
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setViewerUrl('');
        setError(true);
        setLoading(false);
      });

    return () => controller.abort();
  }, [url, filename, mimeType]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = getMediaProxyUrl(url, { download: true, filename });
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Opening document...</p>
        </div>
      </div>
    );
  }

  if (error || !url) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <h2 className="text-lg font-semibold mb-2">Document Unavailable</h2>
          <p className="text-gray-500 mb-6">The document could not be loaded. It may have been removed or the link is invalid.</p>
          <Button onClick={() => router.back()} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
          </Button>
        </div>
      </div>
    );
  }

  const kind = getMediaKind(filename, mimeType, url);
  const isPdf = kind === 'pdf';
  const isOfficeDoc = kind === 'office';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="h-8 w-8 p-0 shrink-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              <h1 className="text-sm font-medium truncate">{filename}</h1>
            </div>
            <p className="text-xs text-gray-400">{isPdf ? 'PDF Document' : isOfficeDoc ? 'Office Document' : 'Document'}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload} className="shrink-0">
          <Download className="w-4 h-4 mr-1.5" /> Download
        </Button>
      </header>

      {/* Document viewer */}
      <div className="flex-1 relative">
        {viewerUrl && kind === 'image' ? (
          <div className="absolute inset-0 overflow-auto p-4 flex items-start justify-center bg-neutral-900">
            <img src={viewerUrl} alt={filename} className="max-w-full h-auto object-contain" onError={() => setError(true)} />
          </div>
        ) : viewerUrl && kind === 'video' ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black p-4">
            <video src={viewerUrl} controls autoPlay playsInline className="max-w-full max-h-full" onError={() => setError(true)} />
          </div>
        ) : viewerUrl && kind === 'audio' ? (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <audio src={viewerUrl} controls autoPlay className="w-full max-w-2xl" onError={() => setError(true)} />
          </div>
        ) : viewerUrl && ['pdf', 'office', 'text'].includes(kind) ? (
          <iframe
            src={viewerUrl}
            className="absolute inset-0 w-full h-full border-0"
            title={filename}
            onError={() => setError(true)}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md p-8">
              <FileText className="w-16 h-16 mx-auto mb-4 text-blue-200" />
              <h2 className="text-lg font-semibold mb-2">{filename}</h2>
              <p className="text-gray-500 mb-6">
                {isOfficeDoc
                  ? 'Office documents are opened using Google Docs Viewer. You can also download the file.'
                  : 'This file type cannot be previewed. Please download to view.'}
              </p>
              <Button onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" /> Download File
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DocumentViewerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-500">Loading viewer...</p>
        </div>
      </div>
    }>
      <DocumentViewerContent />
    </Suspense>
  );
}
