'use client';

import { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface ProgressPhoto {
  id: string;
  url: string;
  type: 'front' | 'side' | 'back';
  notes?: string;
  createdAt: string;
}

interface PhotoGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  photos: ProgressPhoto[];
  photoType: 'front' | 'side' | 'back';
  onDelete?: (photoId: string) => void;
}

export function PhotoGalleryModal({ isOpen, onClose, photos, photoType, onDelete }: PhotoGalleryModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const typePhotos = photos.filter(photo => photo.type === photoType);
  const currentPhoto = typePhotos[currentIndex];

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : typePhotos.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < typePhotos.length - 1 ? prev + 1 : 0));
  };

  const handleDelete = async (photoId: string) => {
    if (onDelete) {
      await onDelete(photoId);
      setShowDeleteConfirm(null);
      
      // Adjust current index if needed
      if (currentIndex >= typePhotos.length - 1) {
        setCurrentIndex(Math.max(0, typePhotos.length - 2));
      }
    }
  };

  if (!isOpen || typePhotos.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-[90px] flex items-center justify-center z-50">
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        <div className="text-white">
          <h2 className="text-lg font-bold capitalize">{photoType} View Photos</h2>
          <p className="text-sm opacity-75">{currentIndex + 1} of {typePhotos.length}</p>
        </div>
        <div className="flex items-center space-x-2">
          {onDelete && (
            <button
              onClick={() => setShowDeleteConfirm(currentPhoto.id)}
              className="h-10 w-10 rounded-full bg-red-500/20 backdrop-blur-sm flex items-center justify-center hover:bg-red-500/30 transition-colors"
            >
              <Trash2 className="h-5 w-5 text-red-400" />
            </button>
          )}
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>

      {/* Navigation Arrows */}
      {typePhotos.length > 1 && (
        <>
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors z-10"
          >
            <ChevronLeft className="h-6 w-6 text-white" />
          </button>
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors z-10"
          >
            <ChevronRight className="h-6 w-6 text-white" />
          </button>
        </>
      )}

      {/* Main Photo */}
      <div className="w-full h-full flex items-center justify-center p-4 pt-20 pb-32">
        {currentPhoto && (
          <img
            src={currentPhoto.url}
            alt={`${photoType} progress photo`}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        )}
      </div>

      {/* Photo Info */}
      <div className="absolute bottom-4 left-4 right-4 bg-white/10 backdrop-blur-sm rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-white font-medium">
            {format(new Date(currentPhoto?.createdAt || ''), 'MMMM d, yyyy')}
          </p>
          <p className="text-white/75 text-sm">
            {format(new Date(currentPhoto?.createdAt || ''), 'h:mm a')}
          </p>
        </div>
        {currentPhoto?.notes && (
          <p className="text-white/90 text-sm">{currentPhoto.notes}</p>
        )}
      </div>

      {/* Thumbnail Strip */}
      {typePhotos.length > 1 && (
        <div className="absolute bottom-20 left-4 right-4">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {typePhotos.map((photo, index) => (
              <button
                key={photo.id}
                onClick={() => setCurrentIndex(index)}
                className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  index === currentIndex
                    ? 'border-white'
                    : 'border-white/30 opacity-60 hover:opacity-80'
                }`}
              >
                <img
                  src={photo.url}
                  alt={`Thumbnail ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
          <div className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Photo?</h3>
            <p className="text-sm text-gray-600 mb-6">
              This action cannot be undone. The photo will be permanently deleted.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="flex-1 py-2 px-4 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
