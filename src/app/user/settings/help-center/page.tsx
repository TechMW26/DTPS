'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import UserNavBar from '@/components/client/UserNavBar';
import { useTheme } from '@/contexts/ThemeContext';
import { 
  HelpCircle, 
  Search,
  ChevronRight,
  ChevronDown,
  Utensils,
  Calendar,
  CreditCard,
  User,
  MessageCircle,
  Bell,
  Settings,
  Shield
} from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQCategory {
  title: string;
  icon: React.ElementType;
  color: string;
  faqs: FAQItem[];
}

export default function HelpCenterPage() {
  const { isDarkMode } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [expandedFAQ, setExpandedFAQ] = useState<string | null>(null);

  const faqCategories: FAQCategory[] = [
    {
      title: 'Meal Plans',
      icon: Utensils,
      color: '#E06A26',
      faqs: [
        {
          question: 'How do I view my meal plan?',
          answer: 'Go to "My Plan" from the dashboard or bottom navigation. You can see your daily meals, recipes, and nutritional information there.'
        },
        {
          question: 'Can I customize my meal plan?',
          answer: 'Your dietitian creates personalized meal plans for you. If you have specific preferences or allergies, please discuss them with your dietitian during your appointment.'
        },
        {
          question: 'How do I mark a meal as completed?',
          answer: 'In your meal plan, tap on any meal and click the "Mark as Complete" button. You can also add photos of your meals for better tracking.'
        },
        {
          question: 'What if I don\'t like a particular meal?',
          answer: 'You can request meal substitutions from your dietitian. They can suggest alternatives that match your nutritional requirements.'
        }
      ]
    },
    {
      title: 'Appointments',
      icon: Calendar,
      color: '#3AB1A0',
      faqs: [
        {
          question: 'How do I book an appointment?',
          answer: 'Go to "Appointments" from the menu, select your preferred date and available time slot, then confirm your booking.'
        },
        {
          question: 'Can I reschedule an appointment?',
          answer: 'Yes, you can reschedule up to 24 hours before your appointment. Go to your upcoming appointments and select "Reschedule".'
        },
        {
          question: 'How do I join a video consultation?',
          answer: 'At your scheduled time, go to your appointment details and click "Join Call". Make sure to allow camera and microphone access.'
        },
        {
          question: 'What if I miss my appointment?',
          answer: 'If you miss an appointment, please contact support to reschedule. Repeated no-shows may affect your booking privileges.'
        }
      ]
    },
    {
      title: 'Billing & Payments',
      icon: CreditCard,
      color: '#E06A26',
      faqs: [
        {
          question: 'What payment methods are accepted?',
          answer: 'We accept all major credit/debit cards, UPI, net banking, and popular digital wallets like PayTM and PhonePe.'
        },
        {
          question: 'How do I view my payment history?',
          answer: 'Go to "Billing" from the menu to see all your past transactions, invoices, and payment receipts.'
        },
        {
          question: 'Is my payment information secure?',
          answer: 'Yes, we use industry-standard encryption and secure payment gateways. We never store your complete card details.'
        },
        {
          question: 'How do I request a refund?',
          answer: 'Refund requests can be made within 7 days of payment. Contact support with your payment details for assistance.'
        }
      ]
    },
    {
      title: 'Account & Profile',
      icon: User,
      color: '#3AB1A0',
      faqs: [
        {
          question: 'How do I update my profile?',
          answer: 'Go to "Profile" from the menu. You can update your personal information, profile photo, and contact details.'
        },
        {
          question: 'How do I change my password?',
          answer: 'Go to Settings > Privacy & Security > Change Password. You\'ll need to enter your current password to set a new one.'
        },
        {
          question: 'Can I delete my account?',
          answer: 'Yes, you can request account deletion from Settings. Please note this action is irreversible and all your data will be permanently deleted.'
        },
        {
          question: 'How do I update my health information?',
          answer: 'Go to Profile > Health Info. Keep your health details updated for better personalized recommendations.'
        }
      ]
    },
    {
      title: 'Messages & Communication',
      icon: MessageCircle,
      color: '#E06A26',
      faqs: [
        {
          question: 'How do I message my dietitian?',
          answer: 'Go to "Messages" from the menu or dashboard. Select your dietitian from the chat list to start a conversation.'
        },
        {
          question: 'Can I share files in messages?',
          answer: 'Yes, you can share images, documents, audio messages, and videos directly in the chat.'
        },
        {
          question: 'What are the response times?',
          answer: 'Your dietitian typically responds within 24 hours during working days. For urgent matters, book an appointment.'
        },
        {
          question: 'Are my messages private?',
          answer: 'Yes, all messages are end-to-end encrypted and only visible to you and your assigned dietitian.'
        }
      ]
    },
    {
      title: 'Notifications',
      icon: Bell,
      color: '#3AB1A0',
      faqs: [
        {
          question: 'How do I enable notifications?',
          answer: 'Go to Settings > Notifications and turn on the types of notifications you want to receive.'
        },
        {
          question: 'Why am I not receiving notifications?',
          answer: 'Check if notifications are enabled in both app settings and your device settings. Also ensure "Do Not Disturb" is off.'
        },
        {
          question: 'Can I customize notification times?',
          answer: 'Yes, meal reminders can be set for specific times. Go to Settings > Reminders to customize.'
        },
        {
          question: 'How do I stop notifications?',
          answer: 'You can disable specific notification types from Settings > Notifications, or all notifications from your device settings.'
        }
      ]
    },
    {
      title: 'App Settings',
      icon: Settings,
      color: '#E06A26',
      faqs: [
        {
          question: 'How do I enable dark mode?',
          answer: 'Go to Settings > Appearance and toggle on "Dark Mode" for a comfortable viewing experience at night.'
        },
        {
          question: 'Can I change the app language?',
          answer: 'Currently the app is available in English. More languages will be added in future updates.'
        },
        {
          question: 'How do I clear app cache?',
          answer: 'You can clear cache from your device settings under App Storage. This won\'t delete your account data.'
        },
        {
          question: 'How do I update the app?',
          answer: 'Visit your device\'s app store (Play Store/App Store) and check for available updates.'
        }
      ]
    },
    {
      title: 'Privacy & Security',
      icon: Shield,
      color: '#3AB1A0',
      faqs: [
        {
          question: 'How is my health data protected?',
          answer: 'We use bank-grade encryption and secure servers. Your health data is stored securely and only accessible to you and your assigned healthcare team.'
        },
        {
          question: 'Can I download my data?',
          answer: 'Yes, you can request a copy of your data from Settings > Privacy. We\'ll email you a downloadable file.'
        },
        {
          question: 'Who can see my information?',
          answer: 'Only you, your assigned dietitian, and authorized healthcare professionals can access your information.'
        },
        {
          question: 'How do I report a security concern?',
          answer: 'If you notice any suspicious activity, immediately contact support or use the "Report a Problem" feature.'
        }
      ]
    }
  ];

  const filteredCategories = searchQuery
    ? faqCategories.map(category => ({
        ...category,
        faqs: category.faqs.filter(
          faq =>
            faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(category => category.faqs.length > 0)
    : faqCategories;

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-slate-950' : 'bg-gray-50'}`}>
      <UserNavBar 
        title="Help Center" 
        showBack={true}
        showMenu={false}
        showProfile={false}
        showNotification={false}
        backHref="/user/settings"
      />

      <div className="px-4 space-y-4 py-4">
        {/* Search Bar */}
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Search for help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-10 focus:border-[#3AB1A0] focus:ring-[#3AB1A0] ${
                  isDarkMode ? 'border-slate-800 bg-slate-950 text-white placeholder:text-slate-500' : 'border-gray-200'
                }`}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Help */}
        {!searchQuery && (
          <Card className="border-0 shadow-sm bg-[#e48b57]">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
                  <HelpCircle className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white">Need More Help?</h3>
                  <p className="text-sm text-white/80">
                    Can't find what you're looking for? Contact our support team.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* FAQ Categories */}
        <div className="space-y-3">
          {filteredCategories.map((category) => (
            <Card
              key={category.title}
              className={`border-0 shadow-sm overflow-hidden ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}
            >
              <CardHeader 
                className={`p-4 cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
                onClick={() => setExpandedCategory(
                  expandedCategory === category.title ? null : category.title
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: `${category.color}15` }}
                    >
                      <category.icon className="h-5 w-5" style={{ color: category.color }} />
                    </div>
                    <div>
                      <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {category.title}
                      </CardTitle>
                      <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                        {category.faqs.length} questions
                      </p>
                    </div>
                  </div>
                  {expandedCategory === category.title ? (
                    <ChevronDown className={`h-5 w-5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                  ) : (
                    <ChevronRight className={`h-5 w-5 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                  )}
                </div>
              </CardHeader>
              
              {expandedCategory === category.title && (
                <CardContent className={`p-0 border-t ${isDarkMode ? 'border-slate-800' : 'border-gray-100'}`}>
                  {category.faqs.map((faq, index) => (
                    <div 
                      key={index}
                      className={`border-b last:border-0 ${isDarkMode ? 'border-slate-800' : 'border-gray-50'}`}
                    >
                      <button
                        className={`w-full p-4 text-left transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}
                        onClick={() => setExpandedFAQ(
                          expandedFAQ === `${category.title}-${index}` 
                            ? null 
                            : `${category.title}-${index}`
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-medium pr-4 ${isDarkMode ? 'text-slate-100' : 'text-gray-800'}`}>
                            {faq.question}
                          </span>
                          {expandedFAQ === `${category.title}-${index}` ? (
                            <ChevronDown className={`h-4 w-4 shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                          ) : (
                            <ChevronRight className={`h-4 w-4 shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-gray-400'}`} />
                          )}
                        </div>
                      </button>
                      
                      {expandedFAQ === `${category.title}-${index}` && (
                        <div className="px-4 pb-4">
                          <p
                            className={`text-sm p-3 rounded-lg ${
                              isDarkMode ? 'text-slate-200 bg-slate-950/60 ring-1 ring-white/10' : 'text-gray-600 bg-gray-50'
                            }`}
                          >
                            {faq.answer}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          ))}
        </div>

        {/* No Results */}
        {searchQuery && filteredCategories.length === 0 && (
          <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-slate-900 ring-1 ring-white/10' : ''}`}>
            <CardContent className="p-8 text-center">
              <div className={`h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isDarkMode ? 'bg-slate-950/60 ring-1 ring-white/10' : 'bg-gray-100'}`}>
                <Search className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className={`text-lg font-semibold mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No Results Found</h3>
              <p className={isDarkMode ? 'text-slate-200' : 'text-gray-600'}>
                Try different keywords or <Link href="/user/settings/contact-support" className="text-[#3AB1A0] hover:underline">contact support</Link> for help.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
