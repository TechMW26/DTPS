'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { 
  ArrowLeft,
  Calendar, 
  Clock, 
  User,
  Video,
  Phone,
  MapPin,
  MessageCircle,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { format, isPast } from 'date-fns';
import Link from 'next/link';

interface Appointment {
  _id: string;
  type: string;
  status: string;
  scheduledAt: string;
  duration: number;
  notes?: string;
  meetingLink?: string;
  dietitian: {
    _id: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  };
}

export default function MobileAppointmentDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/auth/signin');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session && params.id) {
      fetchAppointment();
    }
  }, [session, params.id]);

  const fetchAppointment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/appointments/${params.id}`);
      if (response.ok) {
        const data = await response.json();
        setAppointment(data); // API returns appointment directly, not wrapped in data.appointment
      } else {
        router.push('/appointments');
      }
    } catch (error) {
      console.error('Error fetching appointment:', error);
      router.push('/appointments');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAppointment = async () => {
    if (!confirm('Are you sure you want to cancel this appointment?')) {
      return;
    }

    try {
      setCancelling(true);
      const response = await fetch(`/api/appointments/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' })
      });

      if (response.ok) {
        router.push('/appointments');
      } else {
        alert('Failed to cancel appointment');
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      alert('Failed to cancel appointment');
    } finally {
      setCancelling(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-linear-to-r from-green-500 to-emerald-500 text-white';
      case 'scheduled': return 'bg-linear-to-r from-blue-500 to-purple-500 text-white';
      case 'completed': return 'bg-linear-to-r from-gray-500 to-gray-600 text-white';
      case 'cancelled': return 'bg-linear-to-r from-red-500 to-pink-500 text-white';
      default: return 'bg-linear-to-r from-gray-500 to-gray-600 text-white';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CheckCircle className="h-5 w-5" />;
      case 'scheduled': return <Clock className="h-5 w-5" />;
      case 'completed': return <CheckCircle className="h-5 w-5" />;
      case 'cancelled': return <XCircle className="h-5 w-5" />;
      default: return <AlertCircle className="h-5 w-5" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video_consultation': return <Video className="h-7 w-7 text-white" />;
      case 'video': return <Video className="h-7 w-7 text-white" />;
      case 'phone': return <Phone className="h-7 w-7 text-white" />;
      case 'in-person': return <MapPin className="h-7 w-7 text-white" />;
      case 'consultation': return <User className="h-7 w-7 text-white" />;
      default: return <Calendar className="h-7 w-7 text-white" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner className="h-12 w-12 text-emerald-500" />
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-purple-50 via-pink-50 to-blue-50">
        <div className="text-center px-6">
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-linear-to-r from-purple-400 to-pink-400 rounded-full blur-2xl opacity-30 animate-pulse"></div>
            <div className="relative h-24 w-24 rounded-full bg-linear-to-br from-purple-100 to-pink-100 flex items-center justify-center mx-auto">
              <AlertCircle className="h-12 w-12 text-purple-600" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">Appointment not found</h3>
          <p className="text-gray-600 text-sm mb-8 max-w-xs mx-auto">
            The appointment you're looking for doesn't exist or has been removed
          </p>
          <Link
            href="/appointments"
            className="inline-flex items-center gap-2 px-8 py-4 bg-linear-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-semibold shadow-xl hover:shadow-2xl active:scale-95 transition-all"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Appointments
          </Link>
        </div>
      </div>
    );
  }

  const isUpcoming = !isPast(new Date(appointment.scheduledAt)) && appointment.status !== 'cancelled';
  const canCancel = isUpcoming && appointment.status === 'scheduled';

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 via-pink-50 to-blue-50 pb-6">
      {/* Modern Gradient Header */}
      <div className="bg-linear-to-r from-purple-600 via-pink-600 to-blue-600 text-white px-4 pt-safe-top pb-6 shadow-xl">
        <div className="flex items-center gap-3 py-4">
          <button
            onClick={() => router.back()}
            className="p-2.5 hover:bg-white/20 rounded-xl transition-all active:scale-95 backdrop-blur-sm"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Appointment Details</h1>
            <p className="text-sm text-white/90 mt-0.5 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              View your session information
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 space-y-6">
        {/* Status Badge with Animation */}
        <div className="flex items-center justify-center">
          <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl shadow-lg ${getStatusColor(appointment.status)} border border-white/20 backdrop-blur-sm`}>
            {getStatusIcon(appointment.status)}
            <span className="font-bold capitalize text-lg">{appointment.status}</span>
          </div>
        </div>

        {/* Dietitian Card - Modern Design */}
        <div className="bg-white rounded-3xl shadow-xl p-6 border border-purple-100/50">
          <div className="flex items-center gap-4 mb-6">
            {/* Avatar with gradient ring */}
            <div className="relative shrink-0">
              <div className="absolute inset-0 bg-linear-to-br from-purple-500 to-pink-500 rounded-full blur-md opacity-50"></div>
              <div className="relative h-20 w-20 rounded-full bg-linear-to-br from-purple-500 to-pink-500 p-0.5">
                <div className="h-full w-full rounded-full bg-white p-0.5">
                  {appointment.dietitian.avatar ? (
                    <img
                      src={appointment.dietitian.avatar}
                      alt={appointment.dietitian.firstName}
                      className="h-full w-full rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full rounded-full bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <User className="h-10 w-10 text-white" />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">
                Dt. {appointment.dietitian.firstName} {appointment.dietitian.lastName}
              </h2>
              <p className="text-sm text-purple-600 font-medium">Your Dietitian</p>
              <div className="flex items-center gap-1 mt-1">
                <div className="h-2 w-2 rounded-full bg-green-400"></div>
                <span className="text-xs text-gray-500">Available</span>
              </div>
            </div>
          </div>

          <Link
            href={`/messages?dietitian=${appointment.dietitian._id}`}
            className="w-full flex items-center justify-center gap-2 py-4 bg-linear-to-r from-purple-600 to-pink-600 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl active:scale-95 transition-all"
          >
            <MessageCircle className="h-5 w-5" />
            Send Message
          </Link>
        </div>

        {/* Appointment Details - Enhanced Design */}
        <div className="bg-white rounded-3xl shadow-xl p-6 border border-blue-100/50">
          <h3 className="font-bold text-gray-900 text-xl mb-6 flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-linear-to-br from-blue-500 to-purple-500 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-white" />
            </div>
            Session Details
          </h3>

          <div className="space-y-5">
            {/* Date */}
            <div className="flex items-start gap-4 p-4 bg-linear-to-r from-blue-50 to-cyan-50 rounded-2xl border border-blue-100">
              <div className="h-14 w-14 rounded-2xl bg-linear-to-br from-blue-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-lg">
                <Calendar className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-700 mb-1">Date</p>
                <p className="font-bold text-gray-900 text-lg">
                  {format(new Date(appointment.scheduledAt), 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
            </div>

            {/* Time */}
            <div className="flex items-start gap-4 p-4 bg-linear-to-r from-purple-50 to-pink-50 rounded-2xl border border-purple-100">
              <div className="h-14 w-14 rounded-2xl bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0 shadow-lg">
                <Clock className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-purple-700 mb-1">Time</p>
                <p className="font-bold text-gray-900 text-lg">
                  {format(new Date(appointment.scheduledAt), 'h:mm a')}
                </p>
                <p className="text-sm text-purple-600 font-medium">{appointment.duration} minutes session</p>
              </div>
            </div>

            {/* Type */}
            <div className="flex items-start gap-4 p-4 bg-linear-to-r from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100">
              <div className="h-14 w-14 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0 shadow-lg">
                {getTypeIcon(appointment.type)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-700 mb-1">Type</p>
                <p className="font-bold text-gray-900 text-lg capitalize">{appointment.type.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Notes - Enhanced Design */}
        {appointment.notes && (
          <div className="bg-white rounded-3xl shadow-xl p-6 border border-gray-100/50">
            <h3 className="font-bold text-gray-900 text-xl mb-4 flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-linear-to-br from-gray-500 to-gray-600 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              Notes
            </h3>
            <div className="p-4 bg-linear-to-r from-gray-50 to-gray-100 rounded-2xl border border-gray-200">
              <p className="text-gray-700 leading-relaxed">{appointment.notes}</p>
            </div>
          </div>
        )}

        {/* Meeting Link - Enhanced Design */}
        {appointment.meetingLink && isUpcoming && (
          <div className="bg-linear-to-br from-purple-600 via-pink-600 to-blue-600 rounded-3xl shadow-2xl p-6 text-white relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-12 -translate-x-12"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-6">
                <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
                  <Video className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="font-bold text-xl">Join Video Call</h3>
                  <p className="text-sm text-white/90">Meeting link is ready</p>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="h-2 w-2 rounded-full bg-green-400 animate-pulse"></div>
                    <span className="text-xs text-white/80">Live session</span>
                  </div>
                </div>
              </div>
              <a
                href={appointment.meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-4 bg-white text-purple-600 rounded-2xl font-bold text-center hover:bg-white/90 active:scale-95 transition-all shadow-lg text-lg"
              >
                Join Meeting Now
              </a>
            </div>
          </div>
        )}

        {/* Cancel Button - Enhanced Design */}
        {canCancel && (
          <button
            onClick={handleCancelAppointment}
            disabled={cancelling}
            className="w-full flex items-center justify-center gap-3 py-4 bg-white border-2 border-red-200 text-red-600 rounded-2xl font-bold hover:bg-red-50 hover:border-red-300 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {cancelling ? (
              <>
                <LoadingSpinner className="h-5 w-5" />
                Cancelling...
              </>
            ) : (
              <>
                <div className="h-8 w-8 rounded-xl bg-red-100 flex items-center justify-center">
                  <Trash2 className="h-4 w-4" />
                </div>
                Cancel Appointment
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

