'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  MessageCircle, 
  User,
  Users,
  Stethoscope,
  Heart
} from 'lucide-react';

interface AvailableUser {
  _id: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string;
  isAssigned?: boolean;
  consultationFee?: number;
  specializations?: string[];
  healthGoals?: string[];
}

interface StartConversationProps {
  onSelectUser: (userId: string) => void;
}

export default function StartConversation({ onSelectUser }: StartConversationProps) {
  const { data: session } = useSession();
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAvailableUsers();
  }, []);

  const fetchAvailableUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users/available');
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching available users:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'dietitian':
        return <Stethoscope className="h-4 w-4" />;
      case 'client':
        return <Heart className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'dietitian':
        return 'bg-green-100 text-green-800';
      case 'client':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <LoadingSpinner />
      </div>
    );
  }

  if (availableUsers.length === 0) {
    return (
      <div className="text-center py-8">
        <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No users available</h3>
        <p className="text-gray-600 text-sm">
          {session?.user?.role === 'client' 
            ? 'You haven\'t been assigned a dietitian yet.'
            : 'No clients have been assigned to you yet.'
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Start a conversation</h3>
        <p className="text-gray-600 text-sm">
          {session?.user?.role === 'client' 
            ? 'Choose a dietitian to start messaging'
            : 'Select a client to start messaging'
          }
        </p>
      </div>

      <div className="space-y-2">
        {availableUsers.map((user) => (
          <div
            key={user._id}
            className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={() => onSelectUser(user._id)}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={user.avatar} />
              <AvatarFallback>
                {user.firstName[0]}{user.lastName[0]}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 truncate">
                  {user.role === 'dietitian' ? 'Dt. ' : ''}
                  {user.firstName} {user.lastName}
                  {user.isAssigned && (
                    <Badge className="ml-2 bg-blue-100 text-blue-800">
                      Assigned
                    </Badge>
                  )}
                </p>
                <Badge className={getRoleColor(user.role)}>
                  <span className="flex items-center space-x-1">
                    {getRoleIcon(user.role)}
                    <span className="capitalize">{user.role}</span>
                  </span>
                </Badge>
              </div>
              
              <div className="flex items-center justify-between mt-1">
                <div className="text-sm text-gray-600">
                  {user.role === 'dietitian' && user.specializations && user.specializations.length > 0 && (
                    <span>{user.specializations[0]}</span>
                  )}
                  {user.role === 'client' && user.healthGoals && user.healthGoals.length > 0 && (
                    <span>{user.healthGoals[0]}</span>
                  )}
                </div>
                
                {user.consultationFee && (
                  <span className="text-sm text-gray-500">
                    ${user.consultationFee}/session
                  </span>
                )}
              </div>
            </div>
            
            <Button size="sm" variant="outline">
              <MessageCircle className="h-4 w-4 mr-1" />
              Message
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
