'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserNavBar from '@/components/client/UserNavBar';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  Shield, 
  Database,
  Lock,
  Eye,
  Share2,
  Trash2,
  FileText,
  Mail
} from 'lucide-react';

export default function PrivacyPolicyPage() {
  const { isDarkMode } = useTheme();

  const sections = [
    {
      title: 'Information We Collect',
      icon: Database,
      color: '#E06A26',
      content: [
        {
          subtitle: 'Personal Information',
          text: 'We collect information you provide directly, including name, email, phone number, and health-related data such as weight, height, dietary preferences, and medical conditions.'
        },
        {
          subtitle: 'Usage Data',
          text: 'We automatically collect information about how you use our app, including meal tracking data, appointment history, and interaction with features.'
        },
        {
          subtitle: 'Device Information',
          text: 'We may collect device identifiers, operating system, app version, and notification tokens to provide and improve our services.'
        }
      ]
    },
    {
      title: 'How We Use Your Information',
      icon: Eye,
      color: '#3AB1A0',
      content: [
        {
          subtitle: 'Service Delivery',
          text: 'To provide personalized diet plans, facilitate appointments with dietitians, and deliver health-related recommendations.'
        },
        {
          subtitle: 'Communication',
          text: 'To send appointment reminders, meal notifications, and important updates about your health journey.'
        },
        {
          subtitle: 'Improvement',
          text: 'To analyze usage patterns and improve our app features, user experience, and healthcare recommendations.'
        }
      ]
    },
    {
      title: 'Data Sharing',
      icon: Share2,
      color: '#E06A26',
      content: [
        {
          subtitle: 'Healthcare Providers',
          text: 'Your health information is shared with your assigned dietitian and healthcare team to provide you with personalized care.'
        },
        {
          subtitle: 'Service Providers',
          text: 'We may share data with trusted third-party services for payment processing, cloud storage, and analytics, under strict confidentiality agreements.'
        },
        {
          subtitle: 'Legal Requirements',
          text: 'We may disclose information when required by law or to protect our rights, your safety, or the safety of others.'
        }
      ]
    },
    {
      title: 'Data Security',
      icon: Lock,
      color: '#3AB1A0',
      content: [
        {
          subtitle: 'Encryption',
          text: 'All data transmitted between your device and our servers is encrypted using industry-standard TLS/SSL protocols.'
        },
        {
          subtitle: 'Storage Security',
          text: 'Your data is stored on secure servers with multiple layers of protection, including firewalls and access controls.'
        },
        {
          subtitle: 'Access Control',
          text: 'Only authorized personnel and your assigned healthcare providers have access to your personal health information.'
        }
      ]
    },
    {
      title: 'Your Rights',
      icon: Shield,
      color: '#E06A26',
      content: [
        {
          subtitle: 'Access',
          text: 'You have the right to access and receive a copy of your personal data stored in our systems.'
        },
        {
          subtitle: 'Correction',
          text: 'You can update or correct your personal information at any time through your profile settings.'
        },
        {
          subtitle: 'Deletion',
          text: 'You can request deletion of your account and associated data, subject to legal retention requirements.'
        }
      ]
    },
    {
      title: 'Data Retention',
      icon: Trash2,
      color: '#3AB1A0',
      content: [
        {
          subtitle: 'Active Accounts',
          text: 'We retain your data while your account is active to provide our services and maintain your health records.'
        },
        {
          subtitle: 'Inactive Accounts',
          text: 'If your account becomes inactive, we may retain data for a reasonable period before deletion.'
        },
        {
          subtitle: 'Legal Compliance',
          text: 'Some data may be retained longer as required by healthcare regulations and legal obligations.'
        }
      ]
    }
  ];

  return (
    <div className={`min-h-screen pb-24 ${isDarkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <UserNavBar 
        title="Privacy Policy" 
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
                <Shield className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Your Privacy Matters</h3>
                <p className="text-sm text-white/80">
                  Last updated: January 2025
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Introduction */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
          <CardContent className="p-4">
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
              At DTPS (Diet & Treatment Planning System), we are committed to protecting your privacy 
              and ensuring the security of your personal health information. This Privacy Policy explains 
              how we collect, use, share, and protect your data when you use our services.
            </p>
          </CardContent>
        </Card>

        {/* Policy Sections */}
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
            <CardContent className="p-4 space-y-4">
              {section.content.map((item, idx) => (
                <div key={idx}>
                  <h4 className="font-medium text-[#3AB1A0] text-sm mb-1">
                    {item.subtitle}
                  </h4>
                  <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
                    {item.text}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Contact Section */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
          <CardHeader className={`p-4 pb-2 border-b ${isDarkMode ? 'border-slate-800' : 'border-[#3AB1A0]/10'}`}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#E06A26]/10 flex items-center justify-center">
                <Mail className="h-5 w-5 text-[#E06A26]" />
              </div>
              <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Contact Us
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-200' : 'text-gray-600'}`}>
              If you have any questions about this Privacy Policy or our data practices, 
              please contact us at:
            </p>
            <div className={`mt-3 p-3 rounded-lg space-y-2 ${isDarkMode ? 'bg-slate-950/60 ring-1 ring-white/10' : 'bg-gray-50'}`}>
              <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>support@dtpoonamsagar.com</p>
              <p className="text-sm text-[#3AB1A0] font-medium">+91 98930 27688</p>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                We aim to respond to all inquiries within 48 hours.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Note */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <FileText className={`h-5 w-5 mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
              <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                This Privacy Policy may be updated from time to time. We will notify you of any 
                material changes by posting the new policy on this page and updating the "Last updated" 
                date. Your continued use of our services after any changes indicates your acceptance 
                of the updated policy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
