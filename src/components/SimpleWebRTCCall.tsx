'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useSimpleWebRTC } from '@/hooks/useSimpleWebRTC';
import { useRealtime } from '@/hooks/useRealtime';

interface SimpleWebRTCCallProps {
  remoteUserId?: string;
  onCallEnd?: () => void;
}

export default function SimpleWebRTCCall({ remoteUserId, onCallEnd }: SimpleWebRTCCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [incomingCall, setIncomingCall] = useState<any>(null);

  const {
    callState,
    localStream,
    remoteStream,
    error,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    handleSignal
  } = useSimpleWebRTC({
    onIncomingCall: (callData) => {
      setIncomingCall(callData);
    },
    onCallAccepted: () => {
      setIncomingCall(null);
    },
    onCallRejected: () => {
      setIncomingCall(null);
    },
    onCallEnded: () => {
      setIncomingCall(null);
      onCallEnd?.();
    },
    onRemoteStream: (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    }
  });

  // Handle real-time signals
  useRealtime({
    onMessage: (evt) => {
      if (evt.type === 'webrtc-signal') {
        handleSignal(evt.data);
      }
    }
  });

  // Update local video when stream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Update remote video when stream changes
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleStartAudioCall = () => {
    if (remoteUserId) {
      startCall(remoteUserId, 'audio');
    }
  };

  const handleStartVideoCall = () => {
    if (remoteUserId) {
      startCall(remoteUserId, 'video');
    }
  };

  const handleAcceptCall = () => {
    acceptCall();
    setIncomingCall(null);
  };

  const handleRejectCall = () => {
    rejectCall();
    setIncomingCall(null);
  };

  const handleEndCall = () => {
    endCall();
    setIncomingCall(null);
  };

  return (
    <div className="simple-webrtc-call">
      {/* Error Display */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              📞 Incoming {incomingCall.callType} call
            </h3>
            <p className="text-gray-600 mb-6">
              From: {incomingCall.fromUserId}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleAcceptCall}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg"
              >
                ✅ Accept
              </button>
              <button
                onClick={handleRejectCall}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg"
              >
                ❌ Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Controls */}
      {!callState.isInCall && remoteUserId && (
        <div className="flex space-x-3 mb-4">
          <button
            onClick={handleStartAudioCall}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <span>🎤</span>
            <span>Audio Call</span>
          </button>
          <button
            onClick={handleStartVideoCall}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2"
          >
            <span>📹</span>
            <span>Video Call</span>
          </button>
        </div>
      )}

      {/* Call Status */}
      {callState.isInCall && (
        <div className="mb-4">
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
            <div className="flex items-center justify-between">
              <div>
                <strong>Status:</strong> {callState.status}
                <br />
                <strong>Type:</strong> {callState.callType}
                <br />
                <strong>Role:</strong> {callState.isInitiator ? 'Caller' : 'Receiver'}
              </div>
              <button
                onClick={handleEndCall}
                className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg"
              >
                📞 End Call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Elements */}
      {callState.isInCall && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Local Video */}
          <div className="relative">
            <h4 className="text-sm font-medium mb-2">Local {callState.callType === 'video' ? 'Video' : 'Audio'}</h4>
            {callState.callType === 'video' ? (
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-48 bg-gray-200 rounded-lg object-cover"
              />
            ) : (
              <div className="w-full h-48 bg-blue-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-2">🎤</div>
                  <div className="text-sm text-gray-600">Audio Only</div>
                </div>
              </div>
            )}
          </div>

          {/* Remote Video */}
          <div className="relative">
            <h4 className="text-sm font-medium mb-2">Remote {callState.callType === 'video' ? 'Video' : 'Audio'}</h4>
            {callState.callType === 'video' ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-48 bg-gray-200 rounded-lg object-cover"
              />
            ) : (
              <div className="w-full h-48 bg-green-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-2">🔊</div>
                  <div className="text-sm text-gray-600">
                    {callState.status === 'connected' ? 'Connected' : 'Connecting...'}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-4 p-3 bg-gray-100 rounded text-xs">
          <strong>Debug Info:</strong>
          <pre>{JSON.stringify(callState, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
