'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import UserNavBar from '@/components/client/UserNavBar';
import { useTheme } from '@/contexts/ThemeContext';
import {
  BadgeCheck,
  ClipboardList,
  ShieldX,
  CreditCard,
  Store,
  Ban,
  RefreshCcw,
  Mail,
} from 'lucide-react';

export default function RefundPolicyPage() {
  const { isDarkMode } = useTheme();

  const sections = [
    {
      title: 'Money-Back Guarantee – Eligibility',
      icon: BadgeCheck,
      color: '#3AB1A0',
      content: [
        {
          subtitle: 'Strict Adherence to the Diet Plan',
          bullets: [
            'Consuming only the foods and quantities specified',
            'Avoiding all restricted foods and beverages',
            'Following meal timings, preparation methods, and instructions provided',
          ],
        },
        {
          subtitle: 'Continuous Compliance',
          bullets: [
            'The diet plan must be followed without any breaks, pauses, or deviations',
            'Any interruption or non-compliance will void eligibility',
          ],
        },
        {
          subtitle: 'Meal Documentation',
          bullets: [
            'You must submit clear, time-appropriate photographs of your meals as instructed',
            'Photos must clearly reflect adherence to the prescribed plan',
            'Incomplete or missing documentation will result in ineligibility',
          ],
        },
        {
          subtitle: 'Medical Conditions',
          text: 'The money-back guarantee does not apply to users with pre-existing medical conditions, including but not limited to:',
          bullets: [
            'Thyroid disorders',
            'PCOD / PCOS',
            'Diabetes',
            'Hormonal or metabolic disorders',
            'Failure to disclose such conditions before purchase voids refund eligibility',
          ],
        },
      ],
    },
    {
      title: 'Refund Request Process',
      icon: ClipboardList,
      color: '#E06A26',
      content: [
        {
          subtitle: 'Timeframe',
          bullets: [
            'Refund requests must be submitted within the refund window specified at the time of purchase (typically 30 or 60 days)',
            'Requests submitted after this period will not be considered',
          ],
        },
        {
          subtitle: 'Proof of Compliance',
          text: 'You must provide:',
          bullets: [
            'Complete meal photo records',
            'Evidence of uninterrupted adherence',
            'Any additional documentation requested during review',
          ],
        },
        {
          subtitle: 'Review & Decision',
          bullets: [
            'All refund requests are reviewed manually',
            'Eligibility is determined solely at our discretion based on compliance evidence',
            'Our decision will be final and binding',
          ],
        },
      ],
    },
    {
      title: 'Non-Eligibility for Refunds',
      icon: ShieldX,
      color: '#3AB1A0',
      content: [
        {
          bullets: [
            'The diet plan was not followed exactly',
            'There were breaks or pauses in the plan',
            'Required meal documentation was missing or inaccurate',
            'Medical conditions were undisclosed or present',
            'Results did not meet personal expectations despite compliance',
            'The plan was partially used or accessed',
          ],
        },
      ],
    },
    {
      title: 'Refund Scope',
      icon: CreditCard,
      color: '#E06A26',
      content: [
        {
          bullets: [
            'Partial refunds are not available',
            'If approved, the refund will be for the full amount paid for the eligible plan only',
            'No refunds are provided for add-ons, consultations already delivered, or expired plans',
          ],
        },
      ],
    },
    {
      title: 'App Store Purchases',
      icon: Store,
      color: '#3AB1A0',
      content: [
        {
          bullets: [
            'Purchases made via Google Play Store or Apple App Store are also subject to their respective refund policies',
            'Platform decisions may override or limit refunds in some cases',
          ],
        },
      ],
    },
    {
      title: 'Cancellation Policy',
      icon: Ban,
      color: '#E06A26',
      content: [
        {
          bullets: [
            'Once a plan has started or access has been granted, cancellations are not permitted',
            'Cancellation requests do not guarantee a refund unless refund eligibility criteria are met',
          ],
        },
      ],
    },
    {
      title: 'Policy Modifications',
      icon: RefreshCcw,
      color: '#3AB1A0',
      content: [
        {
          bullets: [
            'We reserve the right to modify this Refund & Cancellation Policy at any time',
            'Updates will apply only to new purchases',
            'Existing purchases will follow the policy active at the time of purchase',
          ],
        },
      ],
    },
    {
      title: 'Contact for Refund Requests',
      icon: Mail,
      color: '#E06A26',
      content: [
        {
          text: 'All refund or policy-related queries must be submitted to:',
          bullets: ['Email: support@dtpoonamsagar.com', 'Website: dtpoonamsagar.com'],
        },
      ],
    },
  ] as const;

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <UserNavBar
        title="Refund & Cancellation"
        subtitle="Policy"
        showBack={true}
        showMenu={false}
        showProfile={false}
        showNotification={false}
        backHref="/user/settings"
      />

      <div className="px-4 space-y-4 py-4">
        <Card className={`border-0 shadow-sm ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <CardHeader className="p-4 pb-2 border-b border-[#3AB1A0]/10">
            <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-[#3AB1A0]'}`}>
              Refund & Cancellation Policy
            </CardTitle>
            <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Last updated: 07/01/2026
            </p>
          </CardHeader>
          <CardContent className="p-4">
            <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              This Refund & Cancellation Policy applies to all paid services, programs, and diet plans offered through the Dietitian Poonam Sagar mobile application, website dtpoonamsagar.com, and related platforms.
            </p>
            <p className={`mt-3 text-sm leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              By purchasing any plan or service, you agree to the terms outlined below.
            </p>
          </CardContent>
        </Card>

        {sections.map((section) => (
          <Card
            key={section.title}
            className={`border-0 shadow-sm hover:shadow-md transition-shadow ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}
          >
            <CardHeader className="p-4 pb-2 border-b border-[#3AB1A0]/10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${section.color}1A` }}>
                  <section.icon className="h-5 w-5" style={{ color: section.color }} />
                </div>
                <CardTitle className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {section.title}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {section.content.map((block, idx) => (
                <div key={idx} className="space-y-2">
                  {'subtitle' in block && block.subtitle ? (
                    <h3 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {block.subtitle}
                    </h3>
                  ) : null}

                  {'text' in block && block.text ? (
                    <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {block.text}
                    </p>
                  ) : null}

                  {'bullets' in block && block.bullets && block.bullets.length > 0 ? (
                    <ul className={`list-disc pl-5 text-sm space-y-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      {block.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
