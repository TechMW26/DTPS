'use client';

import { X, Calendar, Camera } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface ProgressPhoto {
  id: string;
  url: string;
  type: 'front' | 'side' | 'back';
  notes?: string;
  createdAt: string;
}

interface PhotoComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  newPhoto: ProgressPhoto;
  previousPhoto?: ProgressPhoto;
  photoType: 'front' | 'side' | 'back';
}

export function PhotoComparisonModal({ 
  isOpen, 
  onClose, 
  newPhoto, 
  previousPhoto, 
  photoType 
}: PhotoComparisonModalProps) {
  if (!isOpen) return null;

  const daysDifference = previousPhoto 
    ? differenceInDays(new Date(newPhoto.createdAt), new Date(previousPhoto.createdAt))
    : 0;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-[90px] flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative p-6 pb-4 border-b border-gray-100">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
          
          <div className="text-center">
            <div className="h-12 w-12 rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white mx-auto mb-3">
              <Camera className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              Progress Photo Added!
            </h2>
            <p className="text-sm text-gray-500 capitalize">
              {photoType} view • {format(new Date(newPhoto.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Photo Comparison */}
        <div className="p-6">
          {previousPhoto ? (
            <>
              {/* Progress Stats */}
              <div className="bg-linear-to-r from-emerald-50 to-teal-50 rounded-2xl p-4 mb-6">
                <div className="flex items-center justify-center space-x-6">
                  <div className="text-center">
                    <div className="flex items-center justify-center space-x-1 mb-1">
                      <Calendar className="h-4 w-4 text-emerald-600" />
                      <span className="text-sm font-medium text-emerald-900">Progress Period</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700">
                      {daysDifference} {daysDifference === 1 ? 'day' : 'days'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Before/After Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Before Photo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">Before</h3>
                    <span className="text-sm text-gray-500">
                      {format(new Date(previousPhoto.createdAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="relative">
                    <img
                      src={previousPhoto.url}
                      alt={`Previous ${photoType} progress photo`}
                      className="w-full h-80 object-cover rounded-2xl shadow-lg"
                    />
                    <div className="absolute top-3 left-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1">
                      <span className="text-xs text-white font-medium">Before</span>
                    </div>
                  </div>
                  {previousPhoto.notes && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-sm text-gray-600">{previousPhoto.notes}</p>
                    </div>
                  )}
                </div>

                {/* After Photo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900">After</h3>
                    <span className="text-sm text-gray-500">
                      {format(new Date(newPhoto.createdAt), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="relative">
                    <img
                      src={newPhoto.url}
                      alt={`Latest ${photoType} progress photo`}
                      className="w-full h-80 object-cover rounded-2xl shadow-lg ring-2 ring-emerald-500"
                    />
                    <div className="absolute top-3 left-3 bg-emerald-500 backdrop-blur-sm rounded-lg px-3 py-1">
                      <span className="text-xs text-white font-medium">After</span>
                    </div>
                  </div>
                  {newPhoto.notes && (
                    <div className="bg-emerald-50 rounded-xl p-3">
                      <p className="text-sm text-emerald-700">{newPhoto.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Motivational Message */}
              <div className="mt-6 text-center">
                <div className="bg-linear-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
                  <h3 className="text-lg font-bold mb-2">Keep Up the Great Work! 🎉</h3>
                  <p className="text-emerald-100">
                    You've been consistently tracking your progress for {daysDifference} days. 
                    Every photo is a step forward in your journey!
                  </p>
                </div>
              </div>
            </>
          ) : (
            /* First Photo */
            <div className="text-center">
              <div className="relative inline-block">
                <img
                  src={newPhoto.url}
                  alt={`First ${photoType} progress photo`}
                  className="w-full max-w-md h-80 object-cover rounded-2xl shadow-lg mx-auto"
                />
                <div className="absolute top-3 left-3 bg-emerald-500 backdrop-blur-sm rounded-lg px-3 py-1">
                  <span className="text-xs text-white font-medium">First Photo</span>
                </div>
              </div>
              
              {newPhoto.notes && (
                <div className="bg-emerald-50 rounded-xl p-4 mt-4 max-w-md mx-auto">
                  <p className="text-sm text-emerald-700">{newPhoto.notes}</p>
                </div>
              )}

              <div className="mt-6">
                <div className="bg-linear-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 text-white max-w-md mx-auto">
                  <h3 className="text-lg font-bold mb-2">Your Journey Starts Now! 🚀</h3>
                  <p className="text-emerald-100">
                    This is your first progress photo. Keep taking photos regularly to see your amazing transformation!
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 mt-6">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-linear-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold shadow-lg active:scale-95 transition-transform"
            >
              Continue Tracking
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
