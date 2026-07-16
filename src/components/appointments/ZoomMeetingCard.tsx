'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Video, 
  Copy, 
  ExternalLink, 
  Calendar, 
  Clock,
  Shield,
  Info,
  CheckCircle
} from 'lucide-react';
import { IZoomMeetingDetails } from '@/types';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ZoomMeetingCardProps {
  zoomMeeting: IZoomMeetingDetails;
  scheduledAt: Date;
  duration: number;
  isHost?: boolean;
  className?: string;
}

export function ZoomMeetingCard({
  zoomMeeting,
  scheduledAt,
  duration,
  isHost = false,
  className
}: ZoomMeetingCardProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const joinMeeting = () => {
    window.open(zoomMeeting.joinUrl, '_blank', 'noopener,noreferrer');
  };

  const startMeeting = () => {
    if (isHost && zoomMeeting.startUrl) {
      window.open(zoomMeeting.startUrl, '_blank', 'noopener,noreferrer');
    } else {
      joinMeeting();
    }
  };

  const formatMeetingTime = () => {
    const endTime = new Date(scheduledAt.getTime() + duration * 60 * 1000);
    return `${format(scheduledAt, 'MMM d, yyyy')} at ${format(scheduledAt, 'h:mm a')} - ${format(endTime, 'h:mm a')}`;
  };

  const getMeetingStatus = () => {
    const now = new Date();
    const meetingStart = new Date(scheduledAt);
    const meetingEnd = new Date(scheduledAt.getTime() + duration * 60 * 1000);

    if (now < meetingStart) {
      const timeDiff = meetingStart.getTime() - now.getTime();
      const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));
      const minutesUntil = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      
      if (hoursUntil > 0) {
        return { status: 'upcoming', text: `Starts in ${hoursUntil}h ${minutesUntil}m`, variant: 'secondary' as const };
      } else if (minutesUntil > 0) {
        return { status: 'upcoming', text: `Starts in ${minutesUntil} minutes`, variant: 'secondary' as const };
      } else {
        return { status: 'starting', text: 'Starting now', variant: 'default' as const };
      }
    } else if (now >= meetingStart && now <= meetingEnd) {
      return { status: 'live', text: 'Meeting in progress', variant: 'destructive' as const };
    } else {
      return { status: 'ended', text: 'Meeting ended', variant: 'outline' as const };
    }
  };

  const meetingStatus = getMeetingStatus();

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Video className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Zoom Meeting</CardTitle>
          </div>
          <Badge variant={meetingStatus.variant}>
            {meetingStatus.text}
          </Badge>
        </div>
        <CardDescription>
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-1">
              <Calendar className="h-4 w-4" />
              <span>{formatMeetingTime()}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="h-4 w-4" />
              <span>{duration} minutes</span>
            </div>
          </div>
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Meeting Actions */}
        <div className="flex flex-col sm:flex-row gap-2">
          {isHost ? (
            <Button 
              onClick={startMeeting}
              className="flex-1"
              disabled={meetingStatus.status === 'ended'}
            >
              <Video className="h-4 w-4 mr-2" />
              {meetingStatus.status === 'live' ? 'Join as Host' : 'Start Meeting'}
            </Button>
          ) : (
            <Button 
              onClick={joinMeeting}
              className="flex-1"
              disabled={meetingStatus.status === 'ended'}
            >
              <Video className="h-4 w-4 mr-2" />
              Join Meeting
            </Button>
          )}
          
          <Button
            variant="outline"
            onClick={() => copyToClipboard(zoomMeeting.joinUrl, 'Meeting link')}
            className="shrink-0"
          >
            {copied ? (
              <CheckCircle className="h-4 w-4 mr-2" />
            ) : (
              <Copy className="h-4 w-4 mr-2" />
            )}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
        </div>

        {/* Meeting Details */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="font-medium text-gray-700">Meeting ID</label>
              <div className="flex items-center space-x-2 mt-1">
                <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                  {zoomMeeting.meetingId}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(zoomMeeting.meetingId, 'Meeting ID')}
                  className="h-6 w-6 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            {zoomMeeting.password && (
              <div>
                <label className="font-medium text-gray-700">Password</label>
                <div className="flex items-center space-x-2 mt-1">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs font-mono">
                    {zoomMeeting.password}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(zoomMeeting.password!, 'Meeting password')}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Meeting Link */}
          <div>
            <label className="font-medium text-gray-700">Meeting Link</label>
            <div className="flex items-center space-x-2 mt-1">
              <input
                type="text"
                value={zoomMeeting.joinUrl}
                readOnly
                className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 font-mono"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(zoomMeeting.joinUrl, '_blank')}
                className="h-6 w-6 p-0"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription className="text-xs">
            This meeting is secured with Zoom's end-to-end encryption. 
            Please do not share meeting details with unauthorized persons.
          </AlertDescription>
        </Alert>

        {/* Instructions */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>First time using Zoom?</strong> You may need to download the Zoom app. 
            The meeting will automatically prompt you to install it if needed.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
