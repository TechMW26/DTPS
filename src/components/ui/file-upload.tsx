'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  X,
  File,
  ImageIcon,
  FileText,
  AlertCircle
} from 'lucide-react';

interface FileUploadProps {
  type: 'avatar' | 'document' | 'recipe-image';
  onUpload: (url: string, filename: string) => void;
  onError?: (error: string) => void;
  accept?: string;
  maxSize?: number;
  className?: string;
  children?: React.ReactNode;
}

export default function FileUpload({
  type,
  onUpload,
  onError,
  accept,
  maxSize = 10 * 1024 * 1024, // 10MB default
  className = '',
  children
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAcceptTypes = () => {
    if (accept) return accept;

    switch (type) {
      case 'avatar':
      case 'recipe-image':
        return 'image/*,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif';
      case 'document':
        return 'application/pdf,image/*,.jpg,.jpeg,.png,.webp,.heic,.heif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.doc,.docx,.pdf';
      default:
        return '*/*';
    }
  };

  const validateFile = (file: File): string | null => {
    if (file.size > maxSize) {
      return `File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`;
    }

    const mimeType = (file.type || '').toLowerCase();
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'];
    const docExtensions = ['pdf', 'doc', 'docx'];

    if (type === 'avatar' || type === 'recipe-image') {
      // Accept any image MIME, or (empty/non-standard MIME) with an image extension.
      // Android/iPhone gallery pickers often report an empty MIME type.
      if (mimeType.startsWith('image/') || (mimeType === '' && imageExtensions.includes(extension))) {
        return null;
      }
      return 'Please select a valid image file (JPG, PNG, WEBP, or HEIC).';
    }

    if (type === 'document') {
      const isPdfOrImage =
        mimeType === 'application/pdf' ||
        mimeType.startsWith('image/') ||
        mimeType === 'application/msword' ||
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      if (isPdfOrImage || (mimeType === '' && [...imageExtensions, ...docExtensions].includes(extension))) {
        return null;
      }
      return 'Please select a valid document (PDF, DOC, or image).';
    }

    const acceptedTypes = getAcceptTypes().split(',');
    if (!acceptedTypes.includes('*/*') && mimeType && !acceptedTypes.includes(mimeType)) {
      return 'Invalid file type';
    }

    return null;
  };

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      onError?.(validationError);
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      onUpload(data.url, data.filename);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };

  const getFileIcon = () => {
    switch (type) {
      case 'avatar':
      case 'recipe-image':
        return <ImageIcon className="h-8 w-8 text-gray-400" />;
      case 'document':
        return <FileText className="h-8 w-8 text-gray-400" />;
      default:
        return <File className="h-8 w-8 text-gray-400" />;
    }
  };

  const getUploadText = () => {
    switch (type) {
      case 'avatar':
        return 'Upload profile picture';
      case 'recipe-image':
        return 'Upload recipe image';
      case 'document':
        return 'Upload document';
      default:
        return 'Upload file';
    }
  };

  if (children) {
    return (
      <div className={className}>
        <input
          ref={fileInputRef}
          type="file"
          accept={getAcceptTypes()}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div onClick={() => fileInputRef.current?.click()}>
          {children}
        </div>

        {error && (
          <Alert variant="destructive" className="mt-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptTypes()}
        onChange={handleFileSelect}
        className="hidden"
      />

      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${dragOver
            ? 'border-green-500 bg-green-50'
            : 'border-gray-300 hover:border-gray-400'
          }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <div className="flex flex-col items-center space-y-2">
            <LoadingSpinner className="h-8 w-8" />
            <p className="text-sm text-gray-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2">
            {getFileIcon()}
            <div>
              <p className="text-sm font-medium text-gray-900">
                {getUploadText()}
              </p>
              <p className="text-xs text-gray-500">
                Drag and drop or click to browse
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Max size: {Math.round(maxSize / 1024 / 1024)}MB
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mt-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
