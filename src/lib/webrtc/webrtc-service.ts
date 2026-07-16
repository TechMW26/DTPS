'use client';

export interface CallData {
  callId: string;
  callerId: string;
  receiverId: string;
  type: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  iceCandidate?: RTCIceCandidateInit;
}

export interface CallEventHandlers {
  onIncomingCall: (callData: CallData) => void;
  onCallAccepted: (callData: CallData) => void;
  onCallRejected: (callData: CallData) => void;
  onCallEnded: (callData: CallData) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onLocalStream: (stream: MediaStream) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onError: (error: string) => void;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private eventHandlers: Partial<CallEventHandlers> = {};
  private currentCallId: string | null = null;
  private isInitiator = false;
  private connectionState?: RTCPeerConnectionState;

  private readonly iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  ];

  constructor() {
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Listen for WebRTC signaling events via SSE or WebSocket
    // This would integrate with your existing real-time system
  }

  public setEventHandlers(handlers: Partial<CallEventHandlers>) {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  public async initializeCall(
    receiverId: string, 
    type: 'audio' | 'video' = 'audio'
  ): Promise<string> {
    try {
      this.currentCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      this.isInitiator = true;

      // Get user media
      await this.getUserMedia(type);

      // Create peer connection
      this.createPeerConnection();

      // Add local stream to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection?.addTrack(track, this.localStream!);
        });
      }

      // Create offer
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);

      // Send call initiation signal
      await this.sendSignal({
        callId: this.currentCallId,
        callerId: 'current-user-id', // Replace with actual user ID
        receiverId,
        type,
        offer
      });

      return this.currentCallId;
    } catch (error) {
      this.eventHandlers.onError?.(`Failed to initialize call: ${error}`);
      throw error;
    }
  }

  public async acceptCall(callData: CallData): Promise<void> {
    try {
      this.currentCallId = callData.callId;
      this.isInitiator = false;

      // Get user media
      await this.getUserMedia(callData.type === 'video' ? 'video' : 'audio');

      // Create peer connection
      this.createPeerConnection();

      // Add local stream to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection?.addTrack(track, this.localStream!);
        });
      }

      // Set remote description (offer)
      if (callData.offer) {
        await this.peerConnection!.setRemoteDescription(callData.offer);
      }

      // Create answer
      const answer = await this.peerConnection!.createAnswer();
      await this.peerConnection!.setLocalDescription(answer);

      // Send answer
      await this.sendSignal({
        callId: callData.callId,
        callerId: this.currentCallId ? callData.callerId : callData.callerId,
        receiverId: callData.receiverId,
        type: 'call_accepted',
        answer
      });

      this.eventHandlers.onCallAccepted?.(callData);
    } catch (error) {
      this.eventHandlers.onError?.(`Failed to accept call: ${error}`);
      throw error;
    }
  }

  public async rejectCall(callData: CallData): Promise<void> {
    try {
      await this.sendSignal({
        ...callData,
        type: 'call_rejected' as any
      });
      
      this.eventHandlers.onCallRejected?.(callData);
      this.cleanup();
    } catch (error) {
      this.eventHandlers.onError?.(`Failed to reject call: ${error}`);
    }
  }

  public async endCall(): Promise<void> {
    try {
      if (this.currentCallId) {
        await this.sendSignal({
          callId: this.currentCallId,
          callerId: 'current-user-id',
          receiverId: 'other-user-id',
          type: 'call_ended' as any
        });
      }
      
      this.cleanup();
    } catch (error) {
      this.eventHandlers.onError?.(`Failed to end call: ${error}`);
    }
  }

  public async toggleMute(): Promise<boolean> {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return !audioTrack.enabled; // Return true if muted
      }
    }
    return false;
  }

  public async toggleVideo(): Promise<boolean> {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return !videoTrack.enabled; // Return true if video off
      }
    }
    return false;
  }

  private async getUserMedia(type: 'audio' | 'video'): Promise<void> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === 'video'
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.eventHandlers.onLocalStream?.(this.localStream);
    } catch (error) {
      throw new Error(`Failed to get user media: ${error}`);
    }
  }

  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.currentCallId) {
        this.sendSignal({
          callId: this.currentCallId,
          callerId: 'current-user-id',
          receiverId: 'other-user-id',
          type: 'ice_candidate' as any,
          iceCandidate: event.candidate.toJSON()
        });
      }
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.eventHandlers.onRemoteStream?.(this.remoteStream);
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state) {
        this.connectionState = state;
        this.eventHandlers.onConnectionStateChange?.(state);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          this.cleanup();
        }
      }
    };

    // Propagate ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      if (state) {
        this.eventHandlers.onIceConnectionStateChange?.(state);
      }
    };
  }

  private async sendSignal(data: any): Promise<void> {
    // This would integrate with your existing real-time system (SSE/WebSocket)
    // For now, we'll use a simple fetch to a signaling endpoint
    try {
      await fetch('/api/webrtc/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (error) {
      console.error('Failed to send signal:', error);
    }
  }

  public async handleSignal(data: CallData): Promise<void> {
    try {
      if (data.offer && !this.isInitiator) {
        // Handle incoming call offer
        this.eventHandlers.onIncomingCall?.(data);
      } else if (data.answer && this.isInitiator) {
        // Handle call answer
        await this.peerConnection?.setRemoteDescription(data.answer);
        this.eventHandlers.onCallAccepted?.(data);
      } else if (data.iceCandidate) {
        // Handle ICE candidate
        if (this.peerConnection && data.iceCandidate) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.iceCandidate));
        }
      }
    } catch (error) {
      this.eventHandlers.onError?.(`Failed to handle signal: ${error}`);
    }
  }

  private cleanup(): void {
    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.currentCallId = null;
    this.isInitiator = false;
  }

  public getCurrentCallId(): string | null {
    return this.currentCallId;
  }

  public isInCall(): boolean {
    return this.currentCallId !== null;
  }
}
