export const dynamic = 'force-dynamic';

import React from 'react';
import { revalidatePath } from 'next/cache';
import UploadFormClient from './UploadFormClient';

// ---- Server helpers (Server Actions use server-only env) ----
const WP_BASE = process.env.WP_BASE || 'https://your-wordpress-site.com';
const WP_KEY = process.env.WP_API_KEY || 'dtps_live_7JpQ6QfE2w3r9T1L';
const WP_SECRET = process.env.WP_API_SECRET || 'dtps_secret_bS8mN2kL5xP0vY4R';
const API_BASE = `${WP_BASE}/wp-json/dtps/v1`;

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

// Fetch latest media (server-side)
async function fetchMedia(): Promise<{ items: WPMedia[]; total: number }> {
  try {
    const res = await fetch(`${API_BASE}/media?per_page=24&page=1`, {
      headers: {
        'X-Api-Key': WP_KEY,
        'X-Api-Secret': WP_SECRET,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Failed to fetch media:', text);
      throw new Error(text || `Failed to fetch media (${res.status})`);
    }

    return res.json();
  } catch (error) {
    console.error('Error fetching media:', error);
    return { items: [], total: 0 };
  }
}

// ---- Server Action: handles the form submit ----
async function uploadAction(formData: FormData) {
  'use server';

  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string) || undefined;
  const alt = (formData.get('alt') as string) || undefined;
  const caption = (formData.get('caption') as string) || undefined;

  if (!file) {
    return { ok: false, message: 'No file selected.' };
  }

  try {
    // Convert File to Buffer for server-side upload
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create FormData for WordPress API
    const fd = new FormData();
    const blob = new Blob([buffer], { type: file.type });
    fd.append('file', blob, file.name);
    if (title) fd.append('title', title);
    if (alt) fd.append('alt', alt);
    if (caption) fd.append('caption', caption);

    const res = await fetch(`${API_BASE}/media`, {
      method: 'POST',
      headers: {
        'X-Api-Key': WP_KEY,
        'X-Api-Secret': WP_SECRET,
      },
      body: fd,
    });

    const text = await res.text();
    if (!res.ok) {
      console.error('Upload failed:', text);
      throw new Error(text || `Upload failed (${res.status})`);
    }

    const uploaded = JSON.parse(text) as WPMedia;

    // Revalidate the page to show new media
    revalidatePath('/wordpress-media');

    return { ok: true, message: `Uploaded #${uploaded.id}`, uploaded };
  } catch (e: any) {
    console.error('Upload error:', e);
    return { ok: false, message: e?.message || 'Upload failed.' };
  }
}

// ---- Page (server component) ----
export default async function Page() {
  const media = await fetchMedia();

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        DTPS Media — Upload & Gallery
      </h1>

      {/* Upload form using a Server Action */}
      <UploadFormClient action={uploadAction} />

      <hr style={{ margin: '24px 0' }} />

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
          Latest Media {media.total ? `(${media.total})` : ''}
        </h2>

        {!media.items.length ? (
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
                />
                <figcaption style={{ marginTop: 8, fontSize: 13, lineHeight: 1.3 }}>
                  <div><b>{m.title || 'Untitled'}</b></div>
                  {m.alt_text ? <div>Alt: {m.alt_text}</div> : null}
                  {m.caption ? <div>Caption: {m.caption}</div> : null}
                  <div style={{ opacity: 0.7, fontSize: 12 }}>
                    {new Date(m.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    ID: {m.id} &middot; MIME: {m.mime_type}
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



