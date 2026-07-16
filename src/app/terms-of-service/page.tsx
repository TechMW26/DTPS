'use client';

import Link from 'next/link';
import { ArrowLeft, AlertCircle, Globe } from 'lucide-react';

export default function TermsOfServicePage() {
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
            Terms & Conditions
          </h1>
          <p className="text-lg text-gray-600">
            Last updated: <span className="font-semibold">07 January 2026</span>
          </p>
        </div>

        {/* Introduction */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg mb-8">
          <p className="text-gray-800 mb-4">
            These Terms & Conditions ("Terms") govern your access to and use of the <span className="font-semibold">Dietitian Poonam Sagar</span> mobile application ("App"), website <a href="https://dtpoonamsagar.com" className="text-[#075E54] hover:underline">dtpoonamsagar.com</a>, and related services (collectively, the "Services"), operated by Dietitian Poonam Sagar ("we," "us," or "our").
          </p>
          <p className="text-gray-800">
            By downloading, accessing, or using the App or Services, you agree to be bound by these Terms. If you do not agree, please do not use the App or Services.
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">1</span>
              Purpose of the App & Medical Disclaimer
            </h2>
            <p className="text-gray-700 mb-4">The App provides nutrition, diet, wellness, and lifestyle guidance for general informational and educational purposes only.</p>
            
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2 mb-6">
              <li>The content does not constitute medical advice, diagnosis, or treatment.</li>
              <li>The App is not a substitute for professional medical consultation.</li>
              <li>Always consult a qualified doctor or healthcare professional before making changes to your diet, exercise routine, or lifestyle, especially if you have any medical conditions.</li>
            </ul>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 font-semibold text-sm">
                We do not diagnose, treat, cure, or prevent any disease.
              </p>
            </div>
          </section>

          {/* Section 2 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">2</span>
              Eligibility
            </h2>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>You must be at least 18 years old to use the App independently.</li>
              <li>If you are under 18, you may use the App only under the supervision of a parent or legal guardian.</li>
              <li>By using the App, you confirm that the information you provide is accurate and complete.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">3</span>
              User Responsibilities
            </h2>
            <p className="text-gray-700 mb-4">You agree that you will not:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2 mb-6">
              <li>Use the App for any unlawful, harmful, or fraudulent purpose</li>
              <li>Post, upload, or transmit content that is abusive, defamatory, obscene, misleading, or violates any law</li>
              <li>Attempt to gain unauthorized access to the App, servers, or systems</li>
              <li>Misuse the App in a way that could impair its functionality or security</li>
            </ul>
            <p className="text-gray-700 font-semibold">We reserve the right to suspend or terminate access if these rules are violated.</p>
          </section>

          {/* Section 4 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">4</span>
              Personalized Plans & Results Disclaimer
            </h2>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>Diet plans, recommendations, and results may vary from person to person.</li>
              <li>We do not guarantee specific outcomes such as weight loss, inch loss, or health improvements.</li>
              <li>Progress depends on multiple factors including consistency, metabolism, lifestyle, and adherence.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">5</span>
              Intellectual Property
            </h2>
            <p className="text-gray-700 mb-4">All content available on the App and website, including but not limited to:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2 mb-6">
              <li>Text, images, videos, logos, graphics, meal plans, and brand elements</li>
            </ul>
            <p className="text-gray-700 mb-4">are the exclusive property of Dietitian Poonam Sagar or its licensors and are protected under applicable intellectual property laws.</p>
            <p className="text-gray-700 font-semibold">You may not copy, reproduce, distribute, modify, or create derivative works without prior written permission.</p>
          </section>

          {/* Section 6 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">6</span>
              Payments, Refunds & Cancellations
            </h2>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>Any paid services, subscriptions, or consultations are subject to our Refund & Cancellation Policy.</li>
              <li>Purchases made via Google Play Store or Apple App Store are also subject to their respective payment and refund policies.</li>
            </ul>
            <div className="bg-gray-50 rounded-lg p-4 mt-6">
              <p className="text-sm text-gray-700">
                The policy is available at: <a href="https://dtpoonamsagar.com" className="text-[#075E54] hover:underline font-semibold">dtpoonamsagar.com</a>
              </p>
            </div>
          </section>

          {/* Section 7 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">7</span>
              Third-Party Services
            </h2>
            <p className="text-gray-700 mb-4">The App may use third-party services such as analytics, payment gateways, or app stores.</p>
            <p className="text-gray-700">We are not responsible for the practices, content, or policies of third-party services. Please review their terms separately.</p>
          </section>

          {/* Section 8 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">8</span>
              Privacy
            </h2>
            <p className="text-gray-700 mb-4">Your privacy is important to us. All personal data is handled in accordance with our Privacy Policy.</p>
            <p className="text-gray-700 mb-6">By using the App, you consent to the collection and use of information as described in the Privacy Policy.</p>
            <Link href="/privacy-policy" className="inline-block bg-[#075E54] text-white px-4 py-2 rounded-lg hover:bg-[#064e47] transition-colors">
              Read Privacy Policy →
            </Link>
          </section>

          {/* Section 9 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">9</span>
              App Availability & Modifications
            </h2>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>We may update, modify, suspend, or discontinue the App or any feature at any time without prior notice.</li>
              <li>We are not liable for any interruption, data loss, or unavailability of the App.</li>
            </ul>
          </section>

          {/* Section 10 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">10</span>
              Limitation of Liability
            </h2>
            <p className="text-gray-700 mb-4">To the maximum extent permitted by law:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>We shall not be liable for any indirect, incidental, or consequential damages arising from the use of the App or Services.</li>
              <li>Use of the App is at your own risk.</li>
            </ul>
          </section>

          {/* Section 11 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">11</span>
              Governing Law & Jurisdiction
            </h2>
            <p className="text-gray-700">These Terms shall be governed by and interpreted in accordance with the laws of <span className="font-semibold">India, with Bhopal jurisdiction</span>, without regard to conflict of law principles.</p>
          </section>

          {/* Section 12 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">12</span>
              Changes to These Terms
            </h2>
            <p className="text-gray-700">We may update these Terms from time to time. Continued use of the App after changes means you accept the revised Terms.</p>
          </section>

          {/* Section 13 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">13</span>
              Contact Information
            </h2>
            <p className="text-gray-700 mb-6">For any questions, support, or legal concerns, please contact us via:</p>
            
            <div className="bg-gray-50 rounded-lg p-6">
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

        {/* Important Notice */}
        <div className="mt-12 bg-yellow-50 border-2 border-yellow-300 rounded-lg p-8">
          <div className="flex items-start">
            <AlertCircle className="h-6 w-6 text-yellow-700 mr-4 shrink-0 mt-1" />
            <div>
              <h3 className="text-xl font-bold text-yellow-900 mb-3">Important Notice</h3>
              <p className="text-yellow-800 mb-2">
                By using the Dietitian Poonam Sagar App or Services, you acknowledge that you have read, understood, and agree to be bound by these Terms & Conditions, as well as our Privacy Policy.
              </p>
              <p className="text-yellow-800">
                If you have any concerns or questions about these terms, please contact us before proceeding with the use of our services.
              </p>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 bg-[#075E54] rounded-lg shadow-lg p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-4">Your Agreement Matters</h3>
          <p className="mb-6 text-lg">By using our services, you agree to these terms and conditions. Thank you for being part of our community.</p>
          <Link href="/" className="inline-block bg-white text-[#075E54] px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
