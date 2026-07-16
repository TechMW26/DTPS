'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Volume2, 
  VolumeX,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface CallUser {
  id: string;
  name: string;
  avatar?: string;
}

interface CallInterfaceProps {
  callId: string;
  localUser: CallUser;
  remoteUser: CallUser;
  callType: 'audio' | 'video';
  isIncoming?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  localStream?: MediaStream | null;
  remoteStream?: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  isMuted: boolean;
  isVideoOff: boolean;
  className?: string;
}

export function CallInterface({
  callId,
  localUser,
  remoteUser,
  callType,
  isIncoming = false,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleVideo,
  localStream,
  remoteStream,
  connectionState,
  isMuted,
  isVideoOff,
  className
}: CallInterfaceProps) {
  const [callDuration, setCallDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const callStartTime = useRef<number>(Date.now());

  // Update video streams
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (connectionState === 'connected') {
      callStartTime.current = Date.now();
      interval = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - callStartTime.current) / 1000));
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [connectionState]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getConnectionStatusText = () => {
    switch (connectionState) {
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatDuration(callDuration);
      case 'disconnected':
        return 'Disconnected';
      case 'failed':
        return 'Connection failed';
      default:
        return isIncoming ? 'Incoming call...' : 'Calling...';
    }
  };

  const toggleSpeaker = () => {
    setIsSpeakerOn(!isSpeakerOn);
    // In a real implementation, you'd control audio output here
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={cn(
      "fixed inset-0 bg-gray-900 z-50 flex flex-col",
      isFullscreen ? "p-0" : "p-4",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center space-x-3">
          <Avatar className="w-10 h-10">
            <AvatarImage src={remoteUser.avatar} />
            <AvatarFallback>{remoteUser.name[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-medium">{remoteUser.name}</h3>
            <p className="text-sm text-gray-300">{getConnectionStatusText()}</p>
          </div>
        </div>
        
        {callType === 'video' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="text-white hover:bg-white/10"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </Button>
        )}
      </div>

      {/* Video area */}
      {callType === 'video' && (
        <div className="flex-1 relative">
          {/* Remote video */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover bg-gray-800"
          />
          
          {/* Local video (picture-in-picture) */}
          <div className="absolute top-4 right-4 w-32 h-24 bg-gray-800 rounded-lg overflow-hidden border-2 border-white/20">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          
          {/* No video placeholder */}
          {(!remoteStream || isVideoOff) && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
              <div className="text-center text-white">
                <Avatar className="w-24 h-24 mx-auto mb-4">
                  <AvatarImage src={remoteUser.avatar} />
                  <AvatarFallback className="text-2xl">{remoteUser.name[0]}</AvatarFallback>
                </Avatar>
                <p className="text-lg">{remoteUser.name}</p>
                <p className="text-sm text-gray-300">Video is off</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audio-only interface */}
      {callType === 'audio' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-white">
            <Avatar className="w-32 h-32 mx-auto mb-6">
              <AvatarImage src={remoteUser.avatar} />
              <AvatarFallback className="text-4xl">{remoteUser.name[0]}</AvatarFallback>
            </Avatar>
            <h2 className="text-2xl font-medium mb-2">{remoteUser.name}</h2>
            <p className="text-gray-300">{getConnectionStatusText()}</p>
          </div>
        </div>
      )}

      {/* Call controls */}
      <div className="p-6">
        {isIncoming && connectionState !== 'connected' ? (
          // Incoming call controls
          <div className="flex justify-center space-x-8">
            <Button
              onClick={onReject}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
            <Button
              onClick={onAccept}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600"
            >
              <Phone className="w-6 h-6" />
            </Button>
          </div>
        ) : (
          // Active call controls
          <div className="flex justify-center items-center space-x-4">
            {/* Mute button */}
            <Button
              onClick={onToggleMute}
              variant="outline"
              className={cn(
                "w-12 h-12 rounded-full",
                isMuted ? "bg-red-500 text-white border-red-500" : "bg-white/10 text-white border-white/20"
              )}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </Button>

            {/* Speaker button (audio calls) */}
            {callType === 'audio' && (
              <Button
                onClick={toggleSpeaker}
                variant="outline"
                className={cn(
                  "w-12 h-12 rounded-full",
                  isSpeakerOn ? "bg-blue-500 text-white border-blue-500" : "bg-white/10 text-white border-white/20"
                )}
              >
                {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </Button>
            )}

            {/* Video toggle button */}
            {callType === 'video' && (
              <Button
                onClick={onToggleVideo}
                variant="outline"
                className={cn(
                  "w-12 h-12 rounded-full",
                  isVideoOff ? "bg-red-500 text-white border-red-500" : "bg-white/10 text-white border-white/20"
                )}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </Button>
            )}

            {/* End call button */}
            <Button
              onClick={onEnd}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600"
            >
              <PhoneOff className="w-6 h-6" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
