'use client';

import React from 'react';
import { useState, useTransition } from 'react';

interface UploadFormClientProps {
  action: (fd: FormData) => Promise<any>;
}

export default function UploadFormClient({ action }: UploadFormClientProps) {
  const [msg, setMsg] = useState<string>('');
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={async (fd: FormData) => {
        setMsg('');
        startTransition(async () => {
          const res = await action(fd);
          if (res?.ok) {
            setMsg(`✅ ${res.message}`);
            // Refresh to show new media
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          } else {
            setMsg(`❌ ${res?.message || 'Upload failed'}`);
          }
        });
      }}
      style={{ display: 'grid', gap: 8, alignItems: 'start', maxWidth: 520 }}
    >
      <input name="file" type="file" accept="image/*" capture="environment" required />
      <input name="title" placeholder="Title (optional)" style={inp} />
      <input name="alt" placeholder="Alt text (SEO)" style={inp} />
      <input name="caption" placeholder="Caption (optional)" style={inp} />
      <button
        type="submit"
        disabled={pending}
        style={{
          padding: '10px 14px',
          background: '#111',
          color: '#fff',
          borderRadius: 8,
          border: '1px solid #111',
          opacity: pending ? 0.7 : 1,
          cursor: pending ? 'not-allowed' : 'pointer',
        }}
      >
        {pending ? 'Uploading…' : 'Upload'}
      </button>
      {msg ? <div style={{ fontSize: 13, opacity: 0.9 }}>{msg}</div> : null}
    </form>
  );
}

const inp: React.CSSProperties = {
  padding: '10px 12px',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  outline: 'none',
};
