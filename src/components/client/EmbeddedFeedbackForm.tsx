'use client';

import {useState} from 'react';
import {ExternalLink, Loader2, X} from 'lucide-react';

/** Google's own embed mode for Forms; it hides the Google header and fits inside a frame. */
export function embeddedFormUrl(formUrl: string): string {
  try {
    const url = new URL(formUrl);
    url.searchParams.set('embedded', 'true');
    return url.toString();
  } catch {
    return formUrl;
  }
}

/**
 * Shows the Google Form inside the DTPS page itself. Loading it in a frame never leaves
 * the page, so it works in every installed Android and iOS app version, even builds that
 * block or drop links to other websites.
 */
export default function EmbeddedFeedbackForm({src, title, onClose}: {src: string; title: string; onClose: () => void}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="-mx-6 -my-7 sm:-mx-8">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Fill the form below and press Submit</p>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
          Close
        </button>
      </div>
      <div className="relative">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading form...
          </div>
        )}
        <iframe
          src={src}
          title={title}
          onLoad={() => setLoaded(true)}
          className="block h-[75vh] min-h-[480px] w-full border-0 bg-white"
        />
      </div>
      <a
        href={src.replace('embedded=true', 'embedded=false')}
        className="flex items-center justify-center gap-1 border-t border-gray-100 px-4 py-3 text-xs text-gray-500 hover:text-gray-800 dark:border-gray-800 dark:text-gray-400"
      >
        Form not loading? Open it directly
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
