'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserNavBar from '@/components/client/UserNavBar';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  FileText, 
  CheckCircle,
  XCircle,
  AlertTriangle,
  Scale,
  CreditCard,
  Shield,
  Gavel
} from 'lucide-react';

export default function TermsOfServicePage() {
  const { isDarkMode } = useTheme();

  const sections = [
    {
      title: 'Acceptance of Terms',
      icon: CheckCircle,
      color: '#3AB1A0',
      content: `By accessing or using the DTPS (Diet & Treatment Planning System) application, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.

These terms apply to all users, including dietitians, health counselors, and clients using the platform.`
    },
    {
      title: 'Description of Services',
      icon: FileText,
      color: '#E06A26',
      content: `DTPS provides a digital platform connecting clients with registered dietitians and health counselors for personalized diet planning, health tracking, and consultations.

Our services include:
• Personalized meal plans and recipes
• Video and chat consultations with healthcare professionals
• Health and progress tracking tools
• Appointment scheduling and management
• Secure messaging between clients and providers`
    },
    {
      title: 'User Responsibilities',
      icon: Shield,
      color: '#3AB1A0',
      content: `As a user of DTPS, you agree to:
• Provide accurate and complete information during registration
• Keep your login credentials secure and confidential
• Not share your account with others
• Use the platform only for lawful purposes
• Respect the intellectual property rights of DTPS and other users
• Not attempt to access unauthorized areas of the platform
• Follow the advice of healthcare professionals responsibly`
    },
    {
      title: 'Medical Disclaimer',
      icon: AlertTriangle,
      color: '#E06A26',
      content: `DTPS is a tool to support your health journey but is not a substitute for professional medical advice, diagnosis, or treatment.

Important disclaimers:
• Always consult with qualified healthcare providers for medical conditions
• Diet plans are general recommendations and may not be suitable for all medical conditions
• In case of medical emergencies, contact emergency services immediately
• Do not disregard professional medical advice based on information from this app
• Results may vary based on individual adherence and health conditions`
    },
    {
      title: 'Payment Terms',
      icon: CreditCard,
      color: '#3AB1A0',
      content: `Payment terms for services on DTPS:
• Subscription fees are billed according to your selected plan
• Payment is required before accessing premium features
• Refunds are available within 7 days of payment, subject to our refund policy
• We use secure payment processors; we do not store complete card details
• Prices may change with prior notice to users
• Failure to pay may result in service suspension`
    },
    {
      title: 'Intellectual Property',
      icon: Scale,
      color: '#E06A26',
      content: `All content on DTPS, including but not limited to:
• Meal plans and recipes
• App design and interface
• Logos and branding
• Educational content

Is the property of DTPS or its content creators and is protected by copyright laws. You may not reproduce, distribute, or create derivative works without explicit permission.`
    },
    {
      title: 'Prohibited Activities',
      icon: XCircle,
      color: '#3AB1A0',
      content: `Users are strictly prohibited from:
• Using the platform for any illegal activities
• Harassing, abusing, or threatening other users
• Posting false or misleading information
• Attempting to hack or disrupt the platform
• Scraping or collecting user data without permission
• Creating fake accounts or impersonating others
• Sharing confidential information of other users
• Using automated systems to access the platform`
    },
    {
      title: 'Limitation of Liability',
      icon: Gavel,
      color: '#E06A26',
      content: `To the maximum extent permitted by law, DTPS and its affiliates shall not be liable for:
• Any indirect, incidental, or consequential damages
• Loss of data or business interruption
• Health outcomes resulting from use of the platform
• Third-party actions or content
• Technical issues beyond our reasonable control

Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.`
    }
  ];

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <UserNavBar 
        title="Terms of Service" 
        showBack={true}
        showMenu={false}
        showProfile={false}
        showNotification={false}
        backHref="/user/settings"
      />

      <div className="px-4 space-y-4 py-4">
        {/* Header Card */}
        <Card className="border-0 shadow-sm bg-[#e48b57]">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                <FileText className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Terms of Service</h3>
                <p className="text-sm text-white/80">
                  Effective date: January 2025
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Introduction */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
          <CardContent className="p-4">
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
              Welcome to DTPS. These Terms of Service ("Terms") govern your access to and use of 
              our diet planning and health management platform. Please read these terms carefully 
              before using our services.
            </p>
          </CardContent>
        </Card>

        {/* Terms Sections */}
        {sections.map((section, index) => (
          <Card key={index} className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
            <CardHeader className={`p-4 pb-2 border-b ${isDarkMode ? 'border-slate-800' : 'border-[#3AB1A0]/10'}`}>
              <div className="flex items-center gap-3">
                <div 
                  className="h-10 w-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${section.color}15` }}
                >
                  <section.icon className="h-5 w-5" style={{ color: section.color }} />
                </div>
                <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {section.title}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <p className={`text-sm leading-relaxed whitespace-pre-line ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
                {section.content}
              </p>
            </CardContent>
          </Card>
        ))}

        {/* Termination */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
          <CardHeader className={`p-4 pb-2 border-b ${isDarkMode ? 'border-slate-800' : 'border-[#3AB1A0]/10'}`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#E06A26]/10 flex items-center justify-center">
                <XCircle className="h-5 w-5 text-[#E06A26]" />
              </div>
              <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Termination
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
              We reserve the right to suspend or terminate your account at any time for violation 
              of these terms or for any other reason at our discretion. You may also terminate your 
              account at any time by contacting support.
            </p>
            <p className={`text-sm leading-relaxed mt-3 ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
              Upon termination, your right to use the services will cease immediately. Provisions 
              that by their nature should survive termination shall remain in effect.
            </p>
          </CardContent>
        </Card>

        {/* Changes to Terms */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
          <CardHeader className={`p-4 pb-2 border-b ${isDarkMode ? 'border-slate-800' : 'border-[#3AB1A0]/10'}`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#3AB1A0]/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-[#3AB1A0]" />
              </div>
              <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Changes to Terms
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
              We may modify these Terms at any time. We will notify you of material changes by 
              posting the updated terms on this page and updating the effective date. Your continued 
              use of our services after changes indicates acceptance of the modified terms.
            </p>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
          <CardContent className="p-4">
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
              For questions about these Terms of Service, please contact us at:
            </p>
            <div className={`mt-3 p-3 rounded-lg space-y-2 ${isDarkMode ? 'bg-slate-950/60 ring-1 ring-white/10' : 'bg-gray-50'}`}>
              <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>support@dtpoonamsagar.com</p>
              <p className="text-sm text-[#3AB1A0] font-medium">+91 98930 27688</p>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                DTPS Legal Team
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Acknowledgment */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : 'bg-[#3AB1A0]/5'}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-[#3AB1A0] mt-0.5" />
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
                By using DTPS, you acknowledge that you have read, understood, and agree to be 
                bound by these Terms of Service. If you are using our services on behalf of an 
                organization, you represent that you have the authority to bind that organization 
                to these terms.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
