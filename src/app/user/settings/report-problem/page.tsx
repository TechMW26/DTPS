'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import UserNavBar from '@/components/client/UserNavBar';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  Bug, 
  Camera,
  X,
  Send,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Image as ImageIcon,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadFileReliably } from '@/lib/client-upload';

type BugCategory = 'ui' | 'performance' | 'crash' | 'feature' | 'security' | 'other';

interface FormData {
  title: string;
  category: BugCategory;
  description: string;
  steps: string;
  expectedBehavior: string;
  deviceInfo: string;
}

export default function ReportProblemPage() {
  const { isDarkMode } = useTheme();
  const [formData, setFormData] = useState<FormData>({
    title: '',
    category: 'ui',
    description: '',
    steps: '',
    expectedBehavior: '',
    deviceInfo: ''
  });
  const [screenshots, setScreenshots] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories: { value: BugCategory; label: string; icon: React.ElementType }[] = [
    { value: 'ui', label: 'UI/Display Issue', icon: ImageIcon },
    { value: 'performance', label: 'Performance/Speed', icon: AlertTriangle },
    { value: 'crash', label: 'App Crash', icon: Bug },
    { value: 'feature', label: 'Feature Not Working', icon: Info },
    { value: 'security', label: 'Security Concern', icon: AlertTriangle },
    { value: 'other', label: 'Other', icon: Bug }
  ];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    if (screenshots.length + files.length > 5) {
      toast.error('Maximum 5 screenshots allowed');
      return;
    }

    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 10MB)`);
        return false;
      }
      return true;
    });

    setScreenshots(prev => [...prev, ...validFiles]);
    
    setPreviewUrls(prev => [...prev, ...validFiles.map(file => URL.createObjectURL(file))]);
  };

  const removeScreenshot = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setScreenshots(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title || !formData.description) {
      toast.error('Please fill in required fields');
      return;
    }

    setLoading(true);

    try {
      // Upload screenshots first
      const uploadedUrls: string[] = [];

      for (const file of screenshots) {
        const uploadData = await uploadFileReliably(file, 'bug');
        uploadedUrls.push(uploadData.url);
      }

      // Submit bug report
      const response = await fetch('/api/support/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          screenshots: uploadedUrls,
          deviceInfo: formData.deviceInfo || navigator.userAgent
        })
      });

      if (response.ok) {
        setSubmitted(true);
        toast.success('Bug report submitted successfully!');
        setFormData({
          title: '',
          category: 'ui',
          description: '',
          steps: '',
          expectedBehavior: '',
          deviceInfo: ''
        });
        setScreenshots([]);
        setPreviewUrls([]);
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to submit report');
      }
    } catch (error) {
      console.error('Error submitting bug report:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className={isDarkMode ? 'min-h-screen bg-slate-950' : 'min-h-screen bg-gray-50'}>
        <UserNavBar 
          title="Report a Problem" 
          showBack={true}
          showMenu={false}
          showProfile={false}
          showNotification={false}
          backHref="/user/settings"
        />

        <div className="px-4 py-8">
          <Card
            className={
              isDarkMode
                ? 'max-w-md mx-auto bg-slate-900 border border-slate-800 shadow-sm'
                : 'border-0 shadow-sm max-w-md mx-auto'
            }
          >
            <CardContent className="p-8 text-center">
              <div className="h-16 w-16 rounded-full bg-[#3AB1A0]/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-[#3AB1A0]" />
              </div>
              <h2 className={isDarkMode ? 'text-xl font-semibold text-slate-100 mb-2' : 'text-xl font-semibold text-gray-900 mb-2'}>
                Report Submitted!
              </h2>
              <p className={isDarkMode ? 'text-slate-300 mb-6' : 'text-gray-600 mb-6'}>
                Thank you for helping us improve. Our team will review your report and work on a fix.
              </p>
              <Button 
                onClick={() => setSubmitted(false)}
                className="bg-[#3AB1A0] hover:bg-[#3AB1A0]/90"
              >
                Report Another Issue
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={isDarkMode ? 'min-h-screen bg-slate-950' : 'min-h-screen bg-gray-50'}>
      <UserNavBar 
        title="Report a Problem" 
        showBack={true}
        showMenu={false}
        showProfile={false}
        showNotification={false}
        backHref="/user/settings"
      />

      <div className="px-4 space-y-4 py-4">
        {/* Info Banner */}
        <Card className="border-0 shadow-sm bg-[#e48b57]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Bug className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Found a Bug?</h3>
                <p className="text-sm text-white/80">
                  Help us fix issues by providing detailed information.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bug Report Form */}
        <Card className={isDarkMode ? 'bg-slate-900 border border-slate-800 shadow-sm' : 'border-0 shadow-sm'}>
          <CardHeader className={isDarkMode ? 'p-4 pb-2 border-b border-slate-800' : 'p-4 pb-2 border-b border-[#3AB1A0]/10'}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#E06A26]/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-[#E06A26]" />
              </div>
              <div>
                <CardTitle className={isDarkMode ? 'text-base font-semibold text-slate-100' : 'text-base font-semibold text-[#3AB1A0]'}>
                  Bug Report Form
                </CardTitle>
                <p className={isDarkMode ? 'text-xs text-slate-400' : 'text-xs text-gray-500'}>
                  Fields marked with * are required
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Brief description of the issue"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className={
                    isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                      : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                  }
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>Category</Label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat.value })}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                        formData.category === cat.value
                          ? 'border-[#3AB1A0] bg-[#3AB1A0]/5'
                          : isDarkMode
                            ? 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
                            : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <cat.icon className={`h-4 w-4 ${
                        formData.category === cat.value ? 'text-[#3AB1A0]' : isDarkMode ? 'text-slate-400' : 'text-gray-400'
                      }`} />
                      <span className={`text-sm ${
                        formData.category === cat.value
                          ? 'text-[#3AB1A0] font-medium'
                          : isDarkMode
                            ? 'text-slate-300'
                            : 'text-gray-600'
                      }`}>
                        {cat.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="Describe the problem in detail..."
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={
                    isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] resize-none'
                      : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] resize-none'
                  }
                />
              </div>

              {/* Steps to Reproduce */}
              <div className="space-y-2">
                <Label htmlFor="steps" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                  Steps to Reproduce
                </Label>
                <Textarea
                  id="steps"
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  rows={3}
                  value={formData.steps}
                  onChange={(e) => setFormData({ ...formData, steps: e.target.value })}
                  className={
                    isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] resize-none'
                      : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] resize-none'
                  }
                />
              </div>

              {/* Expected Behavior */}
              <div className="space-y-2">
                <Label htmlFor="expectedBehavior" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                  Expected Behavior
                </Label>
                <Textarea
                  id="expectedBehavior"
                  placeholder="What did you expect to happen?"
                  rows={2}
                  value={formData.expectedBehavior}
                  onChange={(e) => setFormData({ ...formData, expectedBehavior: e.target.value })}
                  className={
                    isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] resize-none'
                      : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] resize-none'
                  }
                />
              </div>

              {/* Screenshots */}
              <div className="space-y-2">
                <Label className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>Screenshots (Optional)</Label>
                <p className={isDarkMode ? 'text-xs text-slate-400' : 'text-xs text-gray-500'}>
                  Add up to 5 screenshots to help us understand the issue
                </p>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                />

                {/* Screenshot Previews */}
                {previewUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {previewUrls.map((url, index) => (
                      <div
                        key={index}
                        className={
                          isDarkMode
                            ? 'relative aspect-square rounded-xl overflow-hidden border border-slate-800'
                            : 'relative aspect-square rounded-xl overflow-hidden border border-gray-200'
                        }
                      >
                        <img 
                          src={url} 
                          alt={`Screenshot ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeScreenshot(index)}
                          className="absolute top-1 right-1 h-6 w-6 bg-red-500 rounded-full flex items-center justify-center"
                        >
                          <X className="h-4 w-4 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {screenshots.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={
                      isDarkMode
                        ? 'w-full p-4 border-2 border-dashed border-slate-800 rounded-xl hover:border-[#3AB1A0] hover:bg-[#3AB1A0]/10 transition-colors'
                        : 'w-full p-4 border-2 border-dashed border-gray-300 rounded-xl hover:border-[#3AB1A0] hover:bg-[#3AB1A0]/5 transition-colors'
                    }
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Camera className={isDarkMode ? 'h-8 w-8 text-slate-400' : 'h-8 w-8 text-gray-400'} />
                      <span className={isDarkMode ? 'text-sm text-slate-300' : 'text-sm text-gray-600'}>
                        Click to add screenshots
                      </span>
                      <span className={isDarkMode ? 'text-xs text-slate-500' : 'text-xs text-gray-400'}>
                        {screenshots.length}/5 images
                      </span>
                    </div>
                  </button>
                )}
              </div>

              {/* Device Info */}
              <div className="space-y-2">
                <Label htmlFor="deviceInfo" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                  Device Information (Optional)
                </Label>
                <Input
                  id="deviceInfo"
                  placeholder="e.g., iPhone 14, iOS 17.2"
                  value={formData.deviceInfo}
                  onChange={(e) => setFormData({ ...formData, deviceInfo: e.target.value })}
                  className={
                    isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                      : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                  }
                />
                <p className={isDarkMode ? 'text-xs text-slate-500' : 'text-xs text-gray-400'}>
                  We'll automatically capture your browser information if not provided
                </p>
              </div>

              {/* Submit Button */}
              <Button 
                type="submit" 
                className="w-full bg-[#3AB1A0] hover:bg-[#3AB1A0]/90"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit Report
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className={isDarkMode ? 'bg-slate-900 border border-slate-800 shadow-sm' : 'border-0 shadow-sm'}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-[#3AB1A0] mt-0.5" />
              <div>
                <h4 className={isDarkMode ? 'font-medium text-slate-100 text-sm mb-1' : 'font-medium text-gray-900 text-sm mb-1'}>
                  Tips for a good bug report:
                </h4>
                <ul className={isDarkMode ? 'text-xs text-slate-300 space-y-1' : 'text-xs text-gray-600 space-y-1'}>
                  <li>• Be specific about what you were doing when the issue occurred</li>
                  <li>• Include exact error messages if any</li>
                  <li>• Screenshots help us understand the issue faster</li>
                  <li>• Mention if the issue happens consistently or randomly</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
