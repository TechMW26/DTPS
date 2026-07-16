'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  Clock, 
  Video, 
  Phone, 
  MapPin, 
  User,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, isToday, isTomorrow } from 'date-fns';

type AppointmentType = 'video' | 'audio' | 'in-person';
type AppointmentStatus = 'upcoming' | 'completed' | 'cancelled' | 'rescheduled';

interface AppointmentCardProps {
  id: string;
  dietitianName: string;
  dietitianImage?: string;
  date: Date;
  time: string;
  duration: number; // in minutes
  type: AppointmentType;
  status: AppointmentStatus;
  notes?: string;
  onJoin?: () => void;
  onReschedule?: () => void;
  onCancel?: () => void;
  onMessage?: () => void;
  className?: string;
}

export function ClientAppointmentCard({
  id,
  dietitianName,
  dietitianImage,
  date,
  time,
  duration,
  type,
  status,
  notes,
  onJoin,
  onReschedule,
  onCancel,
  onMessage,
  className,
}: AppointmentCardProps) {
  const getTypeIcon = () => {
    switch (type) {
      case 'video':
        return <Video className="h-4 w-4" />;
      case 'audio':
        return <Phone className="h-4 w-4" />;
      case 'in-person':
        return <MapPin className="h-4 w-4" />;
    }
  };

  const getTypeLabel = () => {
    switch (type) {
      case 'video':
        return 'Video Call';
      case 'audio':
        return 'Audio Call';
      case 'in-person':
        return 'In-Person';
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'upcoming':
        return (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
            Upcoming
          </Badge>
        );
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            Completed
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
            Cancelled
          </Badge>
        );
      case 'rescheduled':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
            Rescheduled
          </Badge>
        );
    }
  };

  const getDateDisplay = () => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  return (
    <Card className={cn(
      "border-0 shadow-sm transition-all duration-200 hover:shadow-md",
      status === 'cancelled' && "opacity-60",
      className
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Dietitian Avatar */}
            <div className="h-10 w-10 rounded-full bg-linear-to-br from-green-400 to-green-600 flex items-center justify-center text-white font-semibold">
              {dietitianImage ? (
                <img 
                  src={dietitianImage} 
                  alt={dietitianName} 
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <User className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">{dietitianName}</p>
              <div className="flex items-center gap-1 text-xs text-gray-500">
                {getTypeIcon()}
                <span>{getTypeLabel()}</span>
              </div>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* Date & Time */}
        <div className="flex items-center gap-4 mb-3 p-2 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-gray-400" />
            <span className="font-medium text-gray-700">{getDateDisplay()}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-gray-600">{time}</span>
            <span className="text-gray-400">({duration} min)</span>
          </div>
        </div>

        {/* Notes */}
        {notes && (
          <p className="text-xs text-gray-500 mb-3 line-clamp-2">{notes}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {status === 'upcoming' && (
            <>
              {(type === 'video' || type === 'audio') && onJoin && (
                <Button 
                  size="sm" 
                  onClick={onJoin}
                  className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700"
                >
                  {type === 'video' ? <Video className="h-3 w-3 mr-1" /> : <Phone className="h-3 w-3 mr-1" />}
                  Join Now
                </Button>
              )}
              {onMessage && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={onMessage}
                  className="h-8 px-3"
                >
                  <MessageSquare className="h-3 w-3" />
                </Button>
              )}
              {onReschedule && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onReschedule}
                  className="h-8 text-xs text-gray-600"
                >
                  Reschedule
                </Button>
              )}
            </>
          )}
          {status === 'completed' && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full h-8 text-xs"
            >
              View Summary
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface AppointmentListProps {
  children: React.ReactNode;
  className?: string;
}

export function ClientAppointmentList({ children, className }: AppointmentListProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </div>
  );
}

export default ClientAppointmentCard;
