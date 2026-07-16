'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  MessageCircle, 
  Phone, 
  Video,
  Calendar,
  Mail,
  User,
  Award,
  Clock
} from 'lucide-react';
import Link from 'next/link';

interface Dietitian {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatar?: string;
  bio?: string;
  credentials?: string[];
  specializations?: string[];
  experience?: number;
  consultationFee?: number;
}

interface ContactDietitianProps {
  className?: string;
}

export default function ContactDietitian({ className }: ContactDietitianProps) {
  const [dietitian, setDietitian] = useState<Dietitian | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDietitian();
  }, []);

  const fetchDietitian = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/users/dietitian');
      if (response.ok) {
        const data = await response.json();
        setDietitian(data.dietitian);
      } else {
        setError('Failed to load dietitian information');
      }
    } catch (error) {
      console.error('Error fetching dietitian:', error);
      setError('Failed to load dietitian information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center h-32">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  if (error || !dietitian) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <User className="h-5 w-5" />
            <span>Your Dietitian</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Dietitian Assigned</h3>
          <p className="text-gray-600 text-sm">
            You haven't been assigned a dietitian yet. Contact support for assistance.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <User className="h-5 w-5" />
          <span>Your Dietitian</span>
        </CardTitle>
        <CardDescription>Get in touch with your nutrition expert</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Dietitian Profile */}
        <div className="flex items-start space-x-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={dietitian.avatar} />
            <AvatarFallback className="text-lg">
              {dietitian.firstName[0]}{dietitian.lastName[0]}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">
              Dt. {dietitian.firstName} {dietitian.lastName}
            </h3>
            
            <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
              {dietitian.experience && (
                <div className="flex items-center space-x-1">
                  <Clock className="h-4 w-4" />
                  <span>{dietitian.experience} years exp.</span>
                </div>
              )}
              
              {dietitian.consultationFee && (
                <div className="flex items-center space-x-1">
                  <span>${dietitian.consultationFee}/session</span>
                </div>
              )}
            </div>

            {dietitian.bio && (
              <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                {dietitian.bio}
              </p>
            )}
          </div>
        </div>

        {/* Specializations */}
        {dietitian.specializations && dietitian.specializations.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">Specializations</h4>
            <div className="flex flex-wrap gap-2">
              {dietitian.specializations.slice(0, 3).map((spec, index) => (
                <Badge key={index} variant="outline" className="text-xs">
                  {spec}
                </Badge>
              ))}
              {dietitian.specializations.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{dietitian.specializations.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Credentials */}
        {dietitian.credentials && dietitian.credentials.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center space-x-1">
              <Award className="h-4 w-4" />
              <span>Credentials</span>
            </h4>
            <div className="flex flex-wrap gap-2">
              {dietitian.credentials.slice(0, 2).map((credential, index) => (
                <Badge key={index} variant="outline" className="text-xs bg-blue-50 text-blue-700">
                  {credential}
                </Badge>
              ))}
              {dietitian.credentials.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{dietitian.credentials.length - 2} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Contact Actions */}
        <div className="space-y-3 pt-4 border-t">
          <h4 className="text-sm font-medium text-gray-900">Get in Touch</h4>
          
          <div className="grid grid-cols-1 gap-2">
            {/* Message */}
            <Button asChild className="w-full">
              <Link href={`/messages?user=${dietitian._id}`}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Send Message
              </Link>
            </Button>

            {/* Book Appointment */}
            <Button variant="outline" asChild className="w-full">
              <Link href="/appointments/book">
                <Calendar className="h-4 w-4 mr-2" />
                Book Appointment
              </Link>
            </Button>

            {/* Contact Options */}
            <div className="grid grid-cols-2 gap-2">
              {dietitian.email && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${dietitian.email}`}>
                    <Mail className="h-4 w-4 mr-1" />
                    Email
                  </a>
                </Button>
              )}
              
              {dietitian.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${dietitian.phone}`}>
                    <Phone className="h-4 w-4 mr-1" />
                    Call
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-center">
            <p className="text-xs text-gray-600 mb-1">Available for consultations</p>
            <div className="flex items-center justify-center space-x-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm font-medium text-green-700">Online</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
