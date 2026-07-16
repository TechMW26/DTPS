'use client';

import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import SimpleWebRTCCall from '@/components/SimpleWebRTCCall';

export default function TestWebRTCPage() {
  const { data: session } = useSession();
  const [targetUserId, setTargetUserId] = useState('');
  const [showCall, setShowCall] = useState(false);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Please sign in to test WebRTC</h1>
          <p className="text-gray-600">You need to be authenticated to use the calling feature.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold mb-6 text-center">
            🚀 Simple WebRTC Test
          </h1>

          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h2 className="text-lg font-semibold mb-2">Current User</h2>
            <p><strong>ID:</strong> {session.user.id}</p>
            <p><strong>Email:</strong> {session.user.email}</p>
            <p><strong>Name:</strong> {session.user.name}</p>
          </div>

          {!showCall ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="targetUserId" className="block text-sm font-medium text-gray-700 mb-2">
                  Target User ID (to call):
                </label>
                <input
                  type="text"
                  id="targetUserId"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  placeholder="Enter the user ID you want to call"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowCall(true)}
                  disabled={!targetUserId.trim()}
                  className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg"
                >
                  📞 Start Call Interface
                </button>
              </div>

              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">📋 How to Test:</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Open this page in <strong>two different browser windows/tabs</strong></li>
                  <li>Sign in with <strong>different user accounts</strong> in each window</li>
                  <li>Copy the <strong>User ID</strong> from one window</li>
                  <li>Paste it in the <strong>"Target User ID"</strong> field in the other window</li>
                  <li>Click <strong>"Start Call Interface"</strong></li>
                  <li>Click <strong>"Audio Call"</strong> or <strong>"Video Call"</strong></li>
                  <li>Accept the call in the other window</li>
                  <li>Test the connection!</li>
                </ol>
              </div>

              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <h3 className="text-lg font-semibold mb-2">✨ Features:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li><strong>Simple-Peer:</strong> Reliable WebRTC wrapper</li>
                  <li><strong>Audio & Video:</strong> Both call types supported</li>
                  <li><strong>Real-time Signaling:</strong> Via SSE (Server-Sent Events)</li>
                  <li><strong>Auto-cleanup:</strong> Resources cleaned up properly</li>
                  <li><strong>Error Handling:</strong> Comprehensive error management</li>
                  <li><strong>Mobile Friendly:</strong> Works on mobile devices</li>
                </ul>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">
                  📞 Calling: {targetUserId}
                </h2>
                <button
                  onClick={() => setShowCall(false)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
                >
                  ← Back
                </button>
              </div>

              <SimpleWebRTCCall
                remoteUserId={targetUserId}
                onCallEnd={() => {
                  // Optionally return to main interface
                  // setShowCall(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Debug Panel */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-6 bg-gray-100 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-2">🔧 Debug Panel</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Environment:</strong> {process.env.NODE_ENV}
                <br />
                <strong>Next.js:</strong> Development Mode
                <br />
                <strong>WebRTC:</strong> Simple-Peer Library
              </div>
              <div>
                <strong>Signaling:</strong> SSE + API Routes
                <br />
                <strong>STUN Servers:</strong> Google STUN
                <br />
                <strong>Trickle ICE:</strong> Disabled (simpler)
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
