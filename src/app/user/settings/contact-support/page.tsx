'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import UserNavBar from '@/components/client/UserNavBar';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  MessageCircle, 
  Phone, 
  Mail, 
  Clock, 
  Send,
  Loader2,
  CheckCircle,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';

export default function ContactSupportPage() {
  const { isDarkMode } = useTheme();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/support/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setSubmitted(true);
        toast.success('Message sent successfully!');
        setFormData({ name: '', email: '', subject: '', message: '' });
      } else {
        toast.error('Failed to send message. Please try again.');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const contactOptions = [
    {
      icon: Phone,
      title: 'Phone Support',
      description: '+91 98930 27688',
      subtitle: 'Mon-Sat, 9 AM - 6 PM'
    },
    {
      icon: Mail,
      title: 'Email Support',
      description: 'support@dtpoonamsagar.com',
      subtitle: 'Response within 24 hours'
    },
    {
      icon: MessageCircle,
      title: 'WhatsApp',
      description: '+91 98930 27688',
      subtitle: 'Quick responses'
    }
  ];

  if (submitted) {
    return (
      <div className={isDarkMode ? 'min-h-screen pb-24 bg-slate-950' : 'min-h-screen pb-24 bg-gray-50'}>
        <UserNavBar 
          title="Contact Support" 
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
                Message Sent!
              </h2>
              <p className={isDarkMode ? 'text-slate-300 mb-6' : 'text-gray-600 mb-6'}>
                Thank you for reaching out. Our support team will get back to you within 24 hours.
              </p>
              <Button 
                onClick={() => setSubmitted(false)}
                className="bg-[#3AB1A0] hover:bg-[#3AB1A0]/90"
              >
                Send Another Message
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={isDarkMode ? 'min-h-screen pb-24 bg-slate-950' : 'min-h-screen pb-24 bg-gray-50'}>
      <UserNavBar 
        title="Contact Support" 
        showBack={true}
        showMenu={false}
        showProfile={false}
        showNotification={false}
        backHref="/user/settings"
      />

      <div className="px-4 space-y-4 py-4">
        {/* Header Card */}
        <Card className="border-0 shadow-sm bg-[#E06A26]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Contact Our Support Team</h3>
                <p className="text-sm text-white/80">
                  We're here to help and answer any questions
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {contactOptions.map((option, index) => (
            <Card
              key={index}
              className={
                isDarkMode
                  ? 'bg-slate-900 border border-slate-800 shadow-sm hover:border-slate-700 transition-colors'
                  : 'border-0 shadow-sm hover:shadow-md transition-shadow'
              }
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-[#E06A26]/10 flex items-center justify-center">
                    <option.icon className="h-5 w-5 text-[#E06A26]" />
                  </div>
                  <div>
                    <h3 className={isDarkMode ? 'font-medium text-slate-100' : 'font-medium text-gray-900'}>
                      {option.title}
                    </h3>
                    <p className="text-sm text-[#3AB1A0] font-medium">{option.description}</p>
                    <p className={isDarkMode ? 'text-xs text-slate-400' : 'text-xs text-gray-500'}>
                      {option.subtitle}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

     

        {/* Contact Form */}
        <Card className={isDarkMode ? 'bg-slate-900 border border-slate-800 shadow-sm' : 'border-0 shadow-sm'}>
          <CardHeader className={isDarkMode ? 'p-4 pb-2 border-b border-slate-800' : 'p-4 pb-2 border-b border-[#3AB1A0]/10'}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#E06A26]/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-[#E06A26]" />
              </div>
              <div>
                <CardTitle className={isDarkMode ? 'text-base font-semibold text-slate-100' : 'text-base font-semibold text-[#3AB1A0]'}>
                  Send us a Message
                </CardTitle>
                <p className={isDarkMode ? 'text-xs text-slate-400' : 'text-xs text-gray-500'}>
                  We'll respond within 24 hours
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                    Name
                  </Label>
                  <Input
                    id="name"
                    placeholder="Your name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={
                      isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                        : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={
                      isDarkMode
                        ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                        : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                  Subject
                </Label>
                <Input
                  id="subject"
                  placeholder="How can we help?"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className={
                    isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                      : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0]'
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message" className={isDarkMode ? 'text-slate-200' : 'text-gray-700'}>
                  Message
                </Label>
                <Textarea
                  id="message"
                  placeholder="Describe your issue or question..."
                  rows={4}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className={
                    isDarkMode
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] resize-none'
                      : 'border-gray-200 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] resize-none'
                  }
                />
              </div>
              <Button 
                type="submit" 
                className="w-full bg-[#3AB1A0] hover:bg-[#3AB1A0]/90"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Message
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Office Address */}
        <Card className={isDarkMode ? 'bg-slate-900 border border-slate-800 shadow-sm' : 'border-0 shadow-sm'}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#E06A26]/10 flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-[#E06A26]" />
              </div>
              <div>
                <h3 className={isDarkMode ? 'font-medium text-slate-100' : 'font-medium text-gray-900'}>
                  Office Address
                </h3>
                <p className={isDarkMode ? 'text-sm text-slate-300' : 'text-sm text-gray-600'}>
                  226, Gufa Mandir Rd, Jain Nagar, Lalghati<br />
                  Bhopal, Madhya Pradesh 462001<br />
                  India
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
