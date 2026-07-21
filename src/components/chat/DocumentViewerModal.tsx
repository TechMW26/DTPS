'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, AlertCircle, Loader2, FileText, ExternalLink } from 'lucide-react';
import {
  getMediaProxyUrl,
  resolveDocumentViewerSource,
} from '@/lib/media';

interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  filename: string;
  mimeType: string;
}

export function DocumentViewerModal({
  isOpen,
  onClose,
  url,
  filename,
  mimeType,
}: DocumentViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');

  useEffect(() => {
    if (!isOpen || !url) return;
    setLoading(true);
    setError(false);

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
        setLoading(false);
        setError(true);
      });

    return () => controller.abort();
  }, [isOpen, url, filename, mimeType]);

  const handleOpenInNewTab = () => {
    window.open(getMediaProxyUrl(url), '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !w-[100vw] !h-[100vh] !max-w-[100vw] !max-h-[100vh] p-0 gap-0 overflow-hidden !rounded-none border-0" showCloseButton={false}>
        {/* Floating controls — top-right */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenInNewTab}
            className="h-10 w-10 p-0 rounded-full bg-white/90 hover:bg-white shadow-md"
            title="Open in new tab"
          >
            <ExternalLink className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-10 w-10 p-0 rounded-full bg-white/90 hover:bg-white shadow-md"
            title="Close"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content — full screen */}
        <div className="absolute inset-0 bg-gray-200">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center">
                <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-blue-500" />
                <p className="text-gray-500 text-sm">Loading document...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center max-w-sm p-6">
                <AlertCircle className="w-12 h-12 mx-auto mb-3 text-red-400" />
                <h3 className="font-semibold mb-1">Unable to preview</h3>
                <p className="text-sm text-gray-500 mb-4">
                  This document could not be loaded in the viewer.
                </p>
                <Button onClick={handleOpenInNewTab} size="sm">
                  <ExternalLink className="w-4 h-4 mr-1.5" /> Open document
                </Button>
              </div>
            </div>
          )}

          {!error && viewerUrl && (
            <iframe
              src={viewerUrl}
              className="absolute inset-0 w-full h-full border-0"
              title={filename}
              onError={() => setError(true)}
              onLoad={() => setLoading(false)}
              referrerPolicy="no-referrer"
            />
          )}

          {!loading && !error && !viewerUrl && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="text-center max-w-sm p-6">
                <FileText className="w-12 h-12 mx-auto mb-3 text-blue-200" />
                <h3 className="font-semibold mb-1">{filename}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Preview is not available for this file type.
                </p>
                <Button onClick={handleOpenInNewTab} size="sm">
                  <ExternalLink className="w-4 h-4 mr-1.5" /> Open document
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
