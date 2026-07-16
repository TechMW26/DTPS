'use client';

import { useState } from 'react';

export default function TestWordPressPage() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testGetMedia = async () => {
    setLoading(true);
    setResult('Testing GET /media...\n');
    
    try {
      const WP_BASE = 'https://dtps.app';
      const WP_KEY = 'dtps_live_7JpQ6QfE2w3r9T1L';
      const WP_SECRET = 'dtps_secret_bS8mN2kL5xP0vY4R';

      const response = await fetch(`${WP_BASE}/wp-json/dtps/v1/media?per_page=5`, {
        method: 'GET',
        headers: {
          'X-Api-Key': WP_KEY,
          'X-Api-Secret': WP_SECRET,
        },
      });

      const text = await response.text();
      setResult(prev => prev + `\nStatus: ${response.status}\n\nResponse:\n${text}`);
    } catch (error: any) {
      setResult(prev => prev + `\nError: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testPostMedia = async () => {
    setLoading(true);
    setResult('Testing POST /media...\n');
    
    try {
      const WP_BASE = 'https://dtps.app';
      const WP_KEY = 'dtps_live_7JpQ6QfE2w3r9T1L';
      const WP_SECRET = 'dtps_secret_bS8mN2kL5xP0vY4R';

      // Create a simple test image (1x1 red pixel PNG)
      const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      const blob = await fetch(`data:image/png;base64,${testImageBase64}`).then(r => r.blob());
      
      const formData = new FormData();
      formData.append('file', blob, 'test.png');
      formData.append('title', 'Test Image');
      formData.append('alt', 'Test');

      const response = await fetch(`${WP_BASE}/wp-json/dtps/v1/media`, {
        method: 'POST',
        headers: {
          'X-Api-Key': WP_KEY,
          'X-Api-Secret': WP_SECRET,
        },
        body: formData,
      });

      const text = await response.text();
      setResult(prev => prev + `\nStatus: ${response.status}\n\nResponse:\n${text}`);
    } catch (error: any) {
      setResult(prev => prev + `\nError: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testViaNextAPI = async () => {
    setLoading(true);
    setResult('Testing via Next.js API route...\n');
    
    try {
      const response = await fetch('/api/wordpress/media?per_page=5', {
        method: 'GET',
      });

      const text = await response.text();
      setResult(prev => prev + `\nStatus: ${response.status}\n\nResponse:\n${text}`);
    } catch (error: any) {
      setResult(prev => prev + `\nError: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        WordPress API Test
      </h1>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <button
          onClick={testGetMedia}
          disabled={loading}
          style={{
            padding: '10px 16px',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Test GET Media (Direct)
        </button>

        <button
          onClick={testPostMedia}
          disabled={loading}
          style={{
            padding: '10px 16px',
            background: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Test POST Media (Direct)
        </button>

        <button
          onClick={testViaNextAPI}
          disabled={loading}
          style={{
            padding: '10px 16px',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          Test via Next.js API
        </button>
      </div>

      {result && (
        <pre
          style={{
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {result}
        </pre>
      )}

      <div style={{ marginTop: 24, padding: 16, background: '#fffbeb', borderRadius: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Expected WordPress Endpoint:
        </h2>
        <code style={{ fontSize: 13 }}>
          https://dtps.app/wp-json/dtps/v1/media
        </code>
        
        <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>
          Required Headers:
        </h3>
        <ul style={{ fontSize: 13, marginLeft: 20 }}>
          <li>X-Api-Key: dtps_live_7JpQ6QfE2w3r9T1L</li>
          <li>X-Api-Secret: dtps_secret_bS8mN2kL5xP0vY4R</li>
        </ul>

        <h3 style={{ fontSize: 14, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>
          Common Issues:
        </h3>
        <ul style={{ fontSize: 13, marginLeft: 20 }}>
          <li><strong>405 Method Not Allowed:</strong> WordPress plugin not installed or endpoint not configured</li>
          <li><strong>401 Unauthorized:</strong> Invalid API keys</li>
          <li><strong>404 Not Found:</strong> WordPress REST API not enabled or wrong URL</li>
          <li><strong>CORS Error:</strong> WordPress needs to allow cross-origin requests</li>
        </ul>
      </div>
    </div>
  );
}

