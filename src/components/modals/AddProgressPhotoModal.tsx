'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Camera, Upload, Image as ImageIcon, Folder } from 'lucide-react';

interface AddProgressPhotoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (photo: { file: File; notes?: string; type: 'front' | 'side' | 'back' }) => void;
}

const photoTypes = [
  { value: 'front', label: 'Front View', description: 'Face forward, arms at sides' },
  { value: 'side', label: 'Side View', description: 'Turn to the side, arms at sides' },
  { value: 'back', label: 'Back View', description: 'Face away, arms at sides' },
];

export function AddProgressPhotoModal({ isOpen, onClose, onAdd }: AddProgressPhotoModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<'front' | 'side' | 'back'>('front');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }

      setSelectedFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setLoading(true);
    try {
      await onAdd({
        file: selectedFile,
        notes: notes.trim() || undefined,
        type: selectedType
      });
      
      // Reset form
      setSelectedFile(null);
      setPreview(null);
      setNotes('');
      setSelectedType('front');
      onClose();
    } catch (error) {
      console.error('Error adding photo:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const triggerCameraInput = () => {
    cameraInputRef.current?.click();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-hidden"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden my-auto">
        {/* Header - Sticky */}
        <div className="shrink-0 flex items-center justify-between p-6 border-b border-gray-200 bg-white">
          <h2 className="text-xl font-bold text-gray-900">Add Progress Photo</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        
        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto overscroll-contain">

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Upload Photo
            </label>
            
            {preview ? (
              <div className="relative">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full h-48 object-cover rounded-xl border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview(null);
                  }}
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Camera Button */}
                <button
                  type="button"
                  onClick={triggerCameraInput}
                  className="w-full h-24 border-2 border-dashed border-emerald-300 rounded-xl flex items-center justify-center hover:border-emerald-500 hover:bg-emerald-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Camera className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">Take Photo</p>
                      <p className="text-xs text-gray-500">Use camera</p>
                    </div>
                  </div>
                </button>

                {/* File Upload Button */}
                <button
                  type="button"
                  onClick={triggerFileInput}
                  className="w-full h-24 border-2 border-dashed border-blue-300 rounded-xl flex items-center justify-center hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Folder className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">Choose from Gallery</p>
                      <p className="text-xs text-gray-500">JPG, PNG up to 10MB</p>
                    </div>
                  </div>
                </button>
              </div>
            )}
            
            {/* Hidden file inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* Photo Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Photo Type
            </label>
            <div className="space-y-2">
              {photoTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSelectedType(type.value as 'front' | 'side' | 'back')}
                  className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                    selectedType === type.value
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-semibold text-gray-900">{type.label}</p>
                  <p className="text-sm text-gray-500">{type.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this photo (e.g., lighting, time of day, etc.)"
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedFile || loading}
              className="flex-1 py-3 px-4 bg-linear-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-600 hover:to-teal-700 transition-all"
            >
              {loading ? 'Uploading...' : 'Add Photo'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
