'use client';

import Link from 'next/link';
import { ArrowLeft, Mail, Globe } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/" className="inline-flex items-center text-[#075E54] hover:text-[#064e47] transition-colors">
            <ArrowLeft className="h-5 w-5 mr-2" />
            <span className="font-medium">Back</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-gray-600">
            Last updated: <span className="font-semibold">07/01/2026</span>
          </p>
        </div>

        {/* Introduction */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg mb-8">
          <p className="text-gray-800 mb-4">
            Welcome to <span className="font-semibold">Dietitian Poonam Sagar</span>. This Privacy Policy explains how we collect, use, store, and protect your information when you use our mobile application, website <a href="https://dtpoonamsagar.com" className="text-[#075E54] hover:underline">dtpoonamsagar.com</a>, and related services (collectively, the "Services").
          </p>
          <p className="text-gray-800">
            By accessing or using our App or Website, you agree to the practices described in this Privacy Policy.
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">1</span>
              Information We Collect
            </h2>
            <p className="text-gray-700 mb-6">We collect information only to provide and improve our services.</p>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">a) Personal Information</h3>
                <p className="text-gray-700 mb-3">When you register or interact with our Services, we may collect:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>Name</li>
                  <li>Email address</li>
                  <li>Phone number</li>
                  <li>Age and gender (if provided)</li>
                  <li>Account and communication details</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">b) Health & Dietary Information</h3>
                <p className="text-gray-700 mb-3">To offer personalized nutrition and wellness guidance, we may collect:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>Dietary preferences</li>
                  <li>Health goals</li>
                  <li>Allergies or food restrictions</li>
                  <li>Lifestyle-related inputs shared by you</li>
                </ul>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold text-yellow-700">⚠️ Important:</span> This information is used only for personalization and not for medical diagnosis or treatment.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">c) Usage & Device Information</h3>
                <p className="text-gray-700 mb-3">We may collect non-personal data such as:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>App usage activity</li>
                  <li>Pages/screens viewed</li>
                  <li>Time spent on the App</li>
                  <li>Device type, operating system, and app version</li>
                </ul>
                <p className="text-gray-700 mt-4">This helps us improve performance, functionality, and user experience.</p>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">2</span>
              How We Use Your Information
            </h2>
            <p className="text-gray-700 mb-4">We use your information to:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2 mb-6">
              <li>Provide personalized diet and wellness services</li>
              <li>Improve app functionality and user experience</li>
              <li>Communicate service updates, reminders, and support messages</li>
              <li>Send promotional content (only if you opt-in)</li>
              <li>Maintain security and prevent misuse</li>
            </ul>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-semibold text-sm">
                We do not sell or rent your personal data.
              </p>
            </div>
          </section>

          {/* Section 3 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">3</span>
              Data Storage & Security
            </h2>
            <p className="text-gray-700 mb-4">We take reasonable technical and organizational measures to protect your information against:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2 mb-6">
              <li>Unauthorized access</li>
              <li>Loss or misuse</li>
              <li>Alteration or disclosure</li>
            </ul>
            <p className="text-gray-700 font-semibold">While we strive to protect your data, no digital platform can guarantee 100% security.</p>
          </section>

          {/* Section 4 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">4</span>
              Sharing & Disclosure of Information
            </h2>
            <p className="text-gray-700 mb-6">We do not share your personal data with third parties except in the following cases:</p>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">a) Trusted Service Providers</h3>
                <p className="text-gray-700">We may share limited data with verified third-party partners (such as hosting, analytics, or payment services) strictly for service delivery.</p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">b) Legal Requirements</h3>
                <p className="text-gray-700">We may disclose information if required by law, court order, or government authority.</p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">5</span>
              Third-Party Services
            </h2>
            <p className="text-gray-700 mb-4">Our App may use third-party tools such as:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2 mb-6">
              <li>Google Play Services</li>
              <li>Apple App Store services</li>
              <li>Analytics or crash reporting tools</li>
            </ul>
            <p className="text-gray-700">These services operate under their own privacy policies, and we encourage you to review them separately.</p>
          </section>

          {/* Section 6 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">6</span>
              Your Rights & Choices
            </h2>
            <p className="text-gray-700 mb-4">You have the right to:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2 mb-6">
              <li>Access, update, or correct your personal data</li>
              <li>Request deletion of your account and data</li>
              <li>Opt out of promotional communications at any time</li>
            </ul>
            <p className="text-gray-700">You can manage your data through your account or by contacting us directly.</p>
          </section>

          {/* Section 7 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">7</span>
              Children's Privacy
            </h2>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>Our Services are intended for users 18 years and above.</li>
              <li>We do not knowingly collect data from children under 13 years of age.</li>
              <li>If such data is identified, it will be deleted promptly.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">8</span>
              Data Retention
            </h2>
            <p className="text-gray-700">We retain personal information only for as long as necessary to:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2 mb-0">
              <li>Provide our services</li>
              <li>Meet legal and regulatory obligations</li>
            </ul>
          </section>

          {/* Section 9 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">9</span>
              Changes to This Privacy Policy
            </h2>
            <p className="text-gray-700 mb-4">We may update this Privacy Policy periodically.</p>
            <p className="text-gray-700 mb-4">Any changes will be posted here, and the "Last updated" date will be revised.</p>
            <p className="text-gray-700 font-semibold">Continued use of the App after changes means you accept the updated policy.</p>
          </section>

          {/* Section 10 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">10</span>
              Contact Us
            </h2>
            <p className="text-gray-700 mb-6">If you have any questions, concerns, or requests regarding this Privacy Policy, please contact:</p>
            
            <div className="space-y-4 bg-gray-50 rounded-lg p-6">
              <div className="flex items-start">
                <Mail className="h-5 w-5 text-[#075E54] mr-3 mt-1 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-700">Email</p>
                  <a href="mailto:support@dtpoonamsagar.com" className="text-[#075E54] hover:underline">
                    support@dtpoonamsagar.com
                  </a>
                </div>
              </div>
              
              <div className="flex items-start">
                <Globe className="h-5 w-5 text-[#075E54] mr-3 mt-1 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-700">Website</p>
                  <a href="https://dtpoonamsagar.com" className="text-[#075E54] hover:underline">
                    dtpoonamsagar.com
                  </a>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 bg-[#075E54] rounded-lg shadow-lg p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-4">Your Privacy Matters</h3>
          <p className="mb-6 text-lg">We are committed to protecting your personal information and maintaining your trust. Thank you for being part of our community.</p>
          <Link href="/" className="inline-block bg-white text-[#075E54] px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
