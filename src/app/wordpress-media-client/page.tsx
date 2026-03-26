'use client';

import React, { useState, useEffect } from 'react';

type WPMedia = {
  id: number;
  title: string;
  alt_text: string | null;
  caption: string | null;
  mime_type: string;
  source_url: string;
  date: string;
  sizes?: Record<string, { url: string; width: number; height: number; mime: string }>;
};

export default function WordPressMediaPage() {
  const [media, setMedia] = useState<{ items: WPMedia[]; total: number }>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Fetch media on mount
  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/wordpress/media?per_page=24&page=1');

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch media');
      }

      const data = await res.json();
      setMedia(data);
    } catch (err: any) {
      console.error('Error fetching media:', err);
      setError(err.message || 'Failed to fetch media');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const file = formData.get('file') as File | null;

    if (!file) {
      setError('Please select a file');
      return;
    }

    try {
      setUploading(true);
      setMessage('');
      setError('');

      const res = await fetch('/api/wordpress/media', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setMessage(`✅ Successfully uploaded: ${data.title || data.id}`);

      // Reset form
      e.currentTarget.reset();

      // Refresh media list
      setTimeout(() => {
        fetchMedia();
      }, 500);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(`❌ ${err.message || 'Upload failed'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        WordPress Media — Upload & Gallery
      </h1>

      {/* Upload Form */}
      <form onSubmit={handleUpload} style={{ display: 'grid', gap: 8, alignItems: 'start', maxWidth: 520 }}>
        <input name="file" type="file" accept="image/*" capture="environment" required />
        <input name="title" placeholder="Title (optional)" style={inp} />
        <input name="alt" placeholder="Alt text (SEO)" style={inp} />
        <input name="caption" placeholder="Caption (optional)" style={inp} />
        <button
          type="submit"
          disabled={uploading}
          style={{
            padding: '10px 14px',
            background: '#111',
            color: '#fff',
            borderRadius: 8,
            border: '1px solid #111',
            opacity: uploading ? 0.7 : 1,
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'Uploading…' : 'Upload to WordPress'}
        </button>
        {message && <div style={{ fontSize: 13, color: '#16a34a' }}>{message}</div>}
        {error && <div style={{ fontSize: 13, color: '#dc2626' }}>{error}</div>}
      </form>

      <hr style={{ margin: '24px 0' }} />

      {/* Media Gallery */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            Latest Media {media.total ? `(${media.total})` : ''}
          </h2>
          <button
            onClick={fetchMedia}
            disabled={loading}
            style={{
              padding: '8px 12px',
              background: '#f3f4f6',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {loading && !media.items.length ? (
          <p style={{ opacity: 0.7 }}>Loading media...</p>
        ) : !media.items.length ? (
          <p style={{ opacity: 0.7 }}>No media found yet. Try uploading above.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}
          >
            {media.items.map((m) => (
              <figure key={m.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
                <img
                  src={m.source_url}
                  alt={m.alt_text || m.title || 'image'}
                  style={{ width: '100%', height: 'auto', borderRadius: 8, display: 'block' }}
                  loading="lazy"
                />
                <figcaption style={{ marginTop: 8, fontSize: 13, lineHeight: 1.3 }}>
                  <div><b>{m.title || 'Untitled'}</b></div>
                  {m.alt_text ? <div style={{ fontSize: 12, opacity: 0.8 }}>Alt: {m.alt_text}</div> : null}
                  {m.caption ? <div style={{ fontSize: 12, opacity: 0.8 }}>Caption: {m.caption}</div> : null}
                  <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>
                    {new Date(m.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.6 }}>
                    ID: {m.id} &middot; {m.mime_type}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

const inp: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  outline: 'none',
};

