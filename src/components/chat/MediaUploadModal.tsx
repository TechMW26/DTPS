'use client';

import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Send, Image, Video, FileText, Music, Camera, Upload, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/imageCompression';
import { toast } from 'sonner';

interface MediaUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (file: File, caption?: string) => Promise<void>;
}

export function MediaUploadModal({ isOpen, onClose, onSend }: MediaUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionStatus, setCompressionStatus] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Compress image using browser-image-compression library
  const compressImageFile = async (file: File): Promise<File> => {
    // Skip if file is small (< 500KB) or is a GIF
    if (file.size < 500 * 1024 || file.type === 'image/gif') {
      return file;
    }

    try {
      setCompressionStatus('Compressing image...');
      const result = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.85,
        format: 'image/jpeg'
      });

      // Create a new File from the blob
      const compressedFile = new File([result.blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      console.log(`Image compressed: ${(file.size / 1024).toFixed(2)}KB → ${(result.compressedSize / 1024).toFixed(2)}KB`);
      return compressedFile;
    } catch (err) {
      console.warn('Image compression failed, using original:', err);
      return file;
    }
  };

  // Compress video using canvas/mediarecorder (client-side)
  const compressVideo = async (file: File): Promise<File> => {
    // For small videos (< 5MB), don't compress
    if (file.size < 5 * 1024 * 1024) return file;

    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      video.onloadedmetadata = async () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file); // Fallback to original
            return;
          }

          // Scale down if video is too large (max 720p)
          const maxHeight = 720;
          let width = video.videoWidth;
          let height = video.videoHeight;

          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;

          // Use MediaRecorder to re-encode
          const stream = canvas.captureStream(24); // 24 fps
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
              ? 'video/webm;codecs=vp9'
              : 'video/webm',
            videoBitsPerSecond: 1500000 // 1.5 Mbps for decent quality
          });

          const chunks: Blob[] = [];
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webm'), {
              type: 'video/webm',
              lastModified: Date.now()
            });
            // Only use compressed if it's smaller
            resolve(compressedFile.size < file.size ? compressedFile : file);
          };

          mediaRecorder.onerror = () => resolve(file);
          mediaRecorder.start();

          // Draw frames
          video.currentTime = 0;
          video.play();

          const drawFrame = () => {
            if (video.paused || video.ended) {
              mediaRecorder.stop();
              return;
            }
            ctx.drawImage(video, 0, 0, width, height);
            requestAnimationFrame(drawFrame);
          };

          video.onplay = drawFrame;
          video.onended = () => mediaRecorder.stop();

          // Timeout for long videos (max 60 seconds of processing)
          setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
              video.pause();
              mediaRecorder.stop();
            }
          }, 60000);

        } catch (err) {
          console.error('Video compression error:', err);
          resolve(file); // Fallback to original
        }
      };

      video.onerror = () => resolve(file);
      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setCaption('');

    // Create preview URL for images and videos
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl('');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleSend = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      let fileToUpload = selectedFile;

      // Compress image if it's an image file
      if (selectedFile.type.startsWith('image/') && !selectedFile.type.includes('gif')) {
        setIsCompressing(true);
        setUploadProgress(5);
        try {
          fileToUpload = await compressImageFile(selectedFile);
          setUploadProgress(15);
        } catch (err) {
          console.warn('Image compression failed, using original:', err);
        }
        setIsCompressing(false);
        setCompressionStatus('');
      }

      // Compress video if it's a video file
      if (selectedFile.type.startsWith('video/')) {
        setIsCompressing(true);
        setCompressionStatus('Processing video...');
        setUploadProgress(10);
        try {
          fileToUpload = await compressVideo(selectedFile);
        } catch (err) {
          console.warn('Video compression failed, using original:', err);
        }
        setIsCompressing(false);
        setCompressionStatus('');
      }

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 150);

      await onSend(fileToUpload, caption);

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Close modal after successful upload
      setTimeout(() => {
        handleClose();
      }, 300);
    } catch (error) {
      console.error('Upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed. Please try again.';
      setUploadError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setUploading(false);
      setIsCompressing(false);
      setCompressionStatus('');
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setCaption('');
    setPreviewUrl('');
    setUploading(false);
    setUploadProgress(0);
    setUploadError(null);
    onClose();
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="w-8 h-8" />;
    if (file.type.startsWith('video/')) return <Video className="w-8 h-8" />;
    if (file.type.startsWith('audio/')) return <Music className="w-8 h-8" />;
    return <FileText className="w-8 h-8" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Media</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!selectedFile ? (
            // File selection options
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-20 flex-col space-y-2"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'image/*';
                      fileInputRef.current.click();
                    }
                  }}
                >
                  <Image className="w-6 h-6" />
                  <span className="text-sm">Photos</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex-col space-y-2"
                  onClick={() => {
                    if (videoInputRef.current) {
                      videoInputRef.current.click();
                    }
                  }}
                >
                  <Video className="w-6 h-6" />
                  <span className="text-sm">Videos</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex-col space-y-2"
                  onClick={() => {
                    if (documentInputRef.current) {
                      documentInputRef.current.click();
                    }
                  }}
                >
                  <FileText className="w-6 h-6" />
                  <span className="text-sm">Documents</span>
                </Button>

                <Button
                  variant="outline"
                  className="h-20 flex-col space-y-2"
                  onClick={() => {
                    // Use separate camera input with capture attribute
                    const cameraInput = document.getElementById('camera-input') as HTMLInputElement;
                    if (cameraInput) {
                      cameraInput.click();
                    }
                  }}
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-sm">Camera</span>
                </Button>
              </div>

              <div className="text-center">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Browse Files
                </Button>
              </div>
            </div>
          ) : (
            // File preview and caption
            <div className="space-y-4">
              {/* File preview */}
              <div className="border rounded-lg p-4">
                {selectedFile.type.startsWith('image/') && previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded"
                  />
                )}

                {selectedFile.type.startsWith('video/') && previewUrl && (
                  <video
                    src={previewUrl}
                    controls
                    className="w-full h-48 object-cover rounded"
                  />
                )}

                {!selectedFile.type.startsWith('image/') && !selectedFile.type.startsWith('video/') && (
                  <div className="flex items-center space-x-3 p-4">
                    <div className="text-blue-600">
                      {getFileIcon(selectedFile)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(selectedFile.size)}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Caption input */}
              <div>
                <Textarea
                  placeholder="Add a caption..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="min-h-20"
                  disabled={uploading}
                />
              </div>

              {/* Upload progress */}
              {uploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} className="w-full" />
                  <p className="text-sm text-gray-500 text-center flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {isCompressing ? compressionStatus || 'Compressing...' : `Uploading... ${uploadProgress}%`}
                  </p>
                </div>
              )}

              {/* Upload error */}
              {uploadError && !uploading && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800">Upload Failed</p>
                      <p className="text-xs text-red-600 mt-1">{uploadError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null);
                    setUploadError(null);
                  }}
                  disabled={uploading}
                  className="flex-1"
                >
                  Change File
                </Button>
                {uploadError ? (
                  <Button
                    onClick={handleSend}
                    disabled={uploading}
                    className="flex-1 bg-orange-500 hover:bg-orange-600"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Retry
                  </Button>
                ) : (
                  <Button
                    onClick={handleSend}
                    disabled={uploading}
                    className="flex-1"
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Send
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Hidden file inputs */}
        {/* Gallery image picker - NO capture attribute to allow gallery selection */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileInputChange}
          className="hidden"
        />
        <input
          ref={documentInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain"
          onChange={handleFileInputChange}
          className="hidden"
        />
        {/* Separate camera input with capture attribute */}
        <input
          id="camera-input"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInputChange}
          className="hidden"
        />
      </DialogContent>
    </Dialog>
  );
}
