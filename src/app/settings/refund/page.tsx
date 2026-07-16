'use client';

import Link from 'next/link';
import { ArrowLeft, AlertCircle, Mail, Globe } from 'lucide-react';

export default function RefundCancellationPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/settings" className="inline-flex items-center text-[#075E54] hover:text-[#064e47] transition-colors">
            <ArrowLeft className="h-5 w-5 mr-2" />
            <span className="font-medium">Back to Settings</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Title */}
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Refund & Cancellation Policy
          </h1>
          <p className="text-lg text-gray-600">
            Last updated: <span className="font-semibold">07/01/2026</span>
          </p>
        </div>

        {/* Introduction */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 rounded-lg mb-8">
          <p className="text-gray-800 mb-4">
            This Refund & Cancellation Policy applies to all paid services, programs, and diet plans offered through the <span className="font-semibold">Dietitian Poonam Sagar</span> mobile application, website <a href="https://dtpoonamsagar.com" className="text-[#075E54] hover:underline font-semibold">dtpoonamsagar.com</a>, and related platforms.
          </p>
          <p className="text-gray-800">
            By purchasing any plan or service, you agree to the terms outlined below.
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-8">
          {/* Section 1 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">1</span>
              Money-Back Guarantee – Eligibility
            </h2>
            <p className="text-gray-700 mb-6">A money-back guarantee may be offered on select plans only and is subject to strict eligibility criteria.</p>
            <p className="text-gray-700 mb-6 font-semibold">To qualify, all of the following conditions must be met:</p>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">a) Strict Adherence to the Diet Plan</h3>
                <p className="text-gray-700 mb-3">You must follow the prescribed diet plan exactly, including:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>Consuming only the foods and quantities specified</li>
                  <li>Avoiding all restricted foods and beverages</li>
                  <li>Following meal timings, preparation methods, and instructions provided</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">b) Continuous Compliance</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>The diet plan must be followed without any breaks, pauses, or deviations</li>
                  <li>Any interruption or non-compliance will void eligibility</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">c) Meal Documentation</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>You must submit clear, time-appropriate photographs of your meals as instructed</li>
                  <li>Photos must clearly reflect adherence to the prescribed plan</li>
                  <li>Incomplete or missing documentation will result in ineligibility</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">d) Medical Conditions</h3>
                <p className="text-gray-700 mb-3">The money-back guarantee does not apply to users with pre-existing medical conditions, including but not limited to:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2 mb-4">
                  <li>Thyroid disorders</li>
                  <li>PCOD / PCOS</li>
                  <li>Diabetes</li>
                  <li>Hormonal or metabolic disorders</li>
                </ul>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 font-semibold text-sm">
                    Failure to disclose such conditions before purchase voids refund eligibility.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">2</span>
              Refund Request Process
            </h2>
            <p className="text-gray-700 mb-6">To request a refund (where applicable):</p>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">a) Timeframe</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>Refund requests must be submitted within the refund window specified at the time of purchase (typically 30 or 60 days)</li>
                  <li>Requests submitted after this period will not be considered</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">b) Proof of Compliance</h3>
                <p className="text-gray-700 mb-3">You must provide:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>Complete meal photo records</li>
                  <li>Evidence of uninterrupted adherence</li>
                  <li>Any additional documentation requested during review</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">c) Review & Decision</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-2">
                  <li>All refund requests are reviewed manually</li>
                  <li>Eligibility is determined solely at our discretion based on compliance evidence</li>
                  <li>Our decision will be final and binding</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">3</span>
              Non-Eligibility for Refunds
            </h2>
            <p className="text-gray-700 mb-4">Refunds will not be issued if:</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>The diet plan was not followed exactly</li>
              <li>There were breaks or pauses in the plan</li>
              <li>Required meal documentation was missing or inaccurate</li>
              <li>Medical conditions were undisclosed or present</li>
              <li>Results did not meet personal expectations despite compliance</li>
              <li>The plan was partially used or accessed</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">4</span>
              Refund Scope
            </h2>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>Partial refunds are not available</li>
              <li>If approved, the refund will be for the full amount paid for the eligible plan only</li>
              <li>No refunds are provided for add-ons, consultations already delivered, or expired plans</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">5</span>
              App Store Purchases
            </h2>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>Purchases made via Google Play Store or Apple App Store are also subject to their respective refund policies</li>
              <li>Platform decisions may override or limit refunds in some cases</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">6</span>
              Cancellation Policy
            </h2>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>Once a plan has started or access has been granted, cancellations are not permitted</li>
              <li>Cancellation requests do not guarantee a refund unless refund eligibility criteria are met</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">7</span>
              Policy Modifications
            </h2>
            <p className="text-gray-700 mb-4">We reserve the right to modify this Refund & Cancellation Policy at any time.</p>
            <ul className="list-disc list-inside space-y-3 text-gray-700 ml-2">
              <li>Updates will apply only to new purchases</li>
              <li>Existing purchases will follow the policy active at the time of purchase</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <span className="w-10 h-10 bg-[#075E54] text-white rounded-full flex items-center justify-center mr-3 text-lg font-bold">8</span>
              Contact for Refund Requests
            </h2>
            <p className="text-gray-700 mb-6">All refund or policy-related queries must be submitted to:</p>
            
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

        {/* Important Notice */}
        <div className="mt-12 bg-yellow-50 border-2 border-yellow-300 rounded-lg p-8">
          <div className="flex items-start">
            <AlertCircle className="h-6 w-6 text-yellow-700 mr-4 shrink-0 mt-1" />
            <div>
              <h3 className="text-xl font-bold text-yellow-900 mb-3">Important Notice</h3>
              <p className="text-yellow-800 mb-2">
                This policy is strictly enforced to maintain fairness and transparency for all users. The money-back guarantee is only available when all eligibility criteria are met with verified evidence of compliance.
              </p>
              <p className="text-yellow-800">
                For any disputes or clarifications regarding this policy, please contact our support team immediately.
              </p>
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-12 bg-[#075E54] rounded-lg shadow-lg p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-4">Questions About Your Purchase?</h3>
          <p className="mb-6 text-lg">We're here to help. Contact our support team for any refund or cancellation inquiries.</p>
          <Link href="/settings" className="inline-block bg-white text-[#075E54] px-8 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors">
            Back to Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
