'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CallNotificationProps {
  isVisible: boolean;
  callerName: string;
  callerAvatar?: string;
  callType: 'audio' | 'video';
  onAccept: () => void;
  onDecline: () => void;
  className?: string;
}

export function CallNotification({
  isVisible,
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onDecline,
  className
}: CallNotificationProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      // Play ringtone sound (you can add audio here)
      const audio = new Audio('/sounds/ringtone.mp3');
      audio.loop = true;
      audio.play().catch(console.error);

      return () => {
        audio.pause();
        audio.currentTime = 0;
      };
    } else {
      setIsAnimating(false);
    }
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className={cn(
      "fixed top-4 right-4 z-50 bg-white rounded-lg shadow-2xl border p-4 min-w-75",
      "animate-in slide-in-from-top-2 duration-300",
      isAnimating && "animate-pulse",
      className
    )}>
      <div className="flex items-center space-x-3 mb-4">
        <Avatar className="w-12 h-12">
          <AvatarImage src={callerAvatar} />
          <AvatarFallback>{callerName[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{callerName}</h3>
          <p className="text-sm text-gray-500">
            Incoming {callType} call...
          </p>
        </div>
        <div className="text-gray-400">
          {callType === 'video' ? (
            <Video className="w-5 h-5" />
          ) : (
            <Phone className="w-5 h-5" />
          )}
        </div>
      </div>

      <div className="flex space-x-2">
        <Button
          onClick={onDecline}
          variant="outline"
          className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
        >
          <PhoneOff className="w-4 h-4 mr-2" />
          Decline
        </Button>
        <Button
          onClick={onAccept}
          className="flex-1 bg-green-500 hover:bg-green-600"
        >
          <Phone className="w-4 h-4 mr-2" />
          Accept
        </Button>
      </div>
    </div>
  );
}
