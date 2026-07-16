'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { WebRTCService, CallData } from '@/lib/webrtc/webrtc-service';
import { useRealtime } from './useRealtime';

interface CallUser {
  id: string;
  name: string;
  avatar?: string;
}

interface CallState {
  isInCall: boolean;
  callId: string | null;
  callType: 'audio' | 'video' | null;
  isIncoming: boolean;
  caller: CallUser | null;
  receiver: CallUser | null;
  connectionState: RTCPeerConnectionState;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isVideoOff: boolean;
}

export function useCallManager() {
  const [callState, setCallState] = useState<CallState>({
    isInCall: false,
    callId: null,
    callType: null,
    isIncoming: false,
    caller: null,
    receiver: null,
    connectionState: 'new',
    localStream: null,
    remoteStream: null,
    isMuted: false,
    isVideoOff: false,
  });

  const webrtcService = useRef<WebRTCService | null>(null);
  const [incomingCallData, setIncomingCallData] = useState<CallData | null>(null);

  // Initialize WebRTC service
  useEffect(() => {
    webrtcService.current = new WebRTCService();
    
    webrtcService.current.setEventHandlers({
      onIncomingCall: (callData) => {
        setIncomingCallData(callData);
        setCallState(prev => ({
          ...prev,
          isInCall: true,
          callId: callData.callId,
          callType: (callData.type === 'video' || callData.type === 'audio') ? callData.type : prev.callType,
          isIncoming: true,
          caller: {
            id: callData.callerId,
            name: 'Incoming Caller', // This would come from user data
            avatar: undefined
          }
        }));
      },
      onCallAccepted: (callData) => {
        setCallState(prev => ({
          ...prev,
          connectionState: 'connecting'
        }));
      },
      onCallRejected: (callData) => {
        resetCallState();
      },
      onCallEnded: (callData) => {
        resetCallState();
      },
      onRemoteStream: (stream) => {
        setCallState(prev => ({
          ...prev,
          remoteStream: stream
        }));
      },
      onLocalStream: (stream) => {
        setCallState(prev => ({
          ...prev,
          localStream: stream
        }));
      },
      onConnectionStateChange: (state) => {
        setCallState(prev => ({
          ...prev,
          connectionState: state
        }));
      },
      onError: (error) => {
        console.error('WebRTC Error:', error);
        // You could show a toast notification here
      }
    });

    return () => {
      if (webrtcService.current) {
        webrtcService.current.endCall();
      }
    };
  }, []);

  // Real-time event handling
  const { isConnected } = useRealtime({
    onMessage: (event) => {
      if (!webrtcService.current) return;

      switch (event.type) {
        case 'incoming_call':
          webrtcService.current.handleSignal({
            callId: event.data.callId,
            callerId: event.data.callerId,
            receiverId: 'current-user-id', // Replace with actual user ID
            type: event.data.type,
            offer: event.data.offer
          });
          break;

        case 'call_accepted':
          webrtcService.current.handleSignal({
            callId: event.data.callId,
            callerId: 'current-user-id',
            receiverId: event.data.acceptedBy,
            type: 'call_accepted' as any,
            answer: event.data.answer
          });
          break;

        case 'call_rejected':
          resetCallState();
          break;

        case 'call_ended':
          resetCallState();
          break;

        case 'ice_candidate':
          webrtcService.current.handleSignal({
            callId: event.data.callId,
            callerId: event.data.from,
            receiverId: 'current-user-id',
            type: 'ice_candidate' as any,
            iceCandidate: event.data.iceCandidate
          });
          break;
      }
    }
  });

  const resetCallState = useCallback(() => {
    setCallState({
      isInCall: false,
      callId: null,
      callType: null,
      isIncoming: false,
      caller: null,
      receiver: null,
      connectionState: 'new',
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isVideoOff: false,
    });
    setIncomingCallData(null);
  }, []);

  const initiateCall = useCallback(async (
    receiverId: string, 
    receiverName: string,
    receiverAvatar: string | undefined,
    type: 'audio' | 'video' = 'audio'
  ) => {
    if (!webrtcService.current) return;

    try {
      const callId = await webrtcService.current.initializeCall(receiverId, type);
      
      setCallState(prev => ({
        ...prev,
        isInCall: true,
        callId,
        callType: type,
        isIncoming: false,
        receiver: {
          id: receiverId,
          name: receiverName,
          avatar: receiverAvatar
        },
        connectionState: 'connecting'
      }));
    } catch (error) {
      console.error('Failed to initiate call:', error);
    }
  }, []);

  const acceptCall = useCallback(async () => {
    if (!webrtcService.current || !incomingCallData) return;

    try {
      await webrtcService.current.acceptCall(incomingCallData);
      setCallState(prev => ({
        ...prev,
        isIncoming: false,
        connectionState: 'connecting'
      }));
    } catch (error) {
      console.error('Failed to accept call:', error);
    }
  }, [incomingCallData]);

  const rejectCall = useCallback(async () => {
    if (!webrtcService.current || !incomingCallData) return;

    try {
      await webrtcService.current.rejectCall(incomingCallData);
      resetCallState();
    } catch (error) {
      console.error('Failed to reject call:', error);
    }
  }, [incomingCallData, resetCallState]);

  const endCall = useCallback(async () => {
    if (!webrtcService.current) return;

    try {
      await webrtcService.current.endCall();
      resetCallState();
    } catch (error) {
      console.error('Failed to end call:', error);
    }
  }, [resetCallState]);

  const toggleMute = useCallback(async () => {
    if (!webrtcService.current) return;

    try {
      const isMuted = await webrtcService.current.toggleMute();
      setCallState(prev => ({
        ...prev,
        isMuted
      }));
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    }
  }, []);

  const toggleVideo = useCallback(async () => {
    if (!webrtcService.current) return;

    try {
      const isVideoOff = await webrtcService.current.toggleVideo();
      setCallState(prev => ({
        ...prev,
        isVideoOff
      }));
    } catch (error) {
      console.error('Failed to toggle video:', error);
    }
  }, []);

  return {
    callState,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo,
    isConnected
  };
}
