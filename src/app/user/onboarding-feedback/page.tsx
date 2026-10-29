'use client';

import {useCallback, useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSession} from 'next-auth/react';
import {ArrowLeft, CheckCircle2, Clock, ExternalLink, Loader2, MessageSquare, RefreshCw} from 'lucide-react';
import EmbeddedFeedbackForm, {embeddedFormUrl} from '@/components/client/EmbeddedFeedbackForm';

type Eligibility = {
  status: 'eligible_initial' | 'completed' | 'pending';
  canSubmit: boolean;
  formType: 'initial';
  remainingSeconds: number;
  nextEligibleAt: string | null;
  formUrl: string | null;
};

export default function OnboardingFeedbackPage() {
  const router = useRouter();
  const {status: authStatus} = useSession();

  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [formSrc, setFormSrc] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const loadEligibility = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/user/onboarding-feedback/eligibility', {cache: 'no-store'});

      if (response.status === 401) {
        router.replace('/auth/signin');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load onboarding feedback.');
      }

      setEligibility({
        status: data.status ?? (data.canSubmit ? 'eligible_initial' : 'completed'),
        canSubmit: Boolean(data.canSubmit),
        formType: 'initial',
        remainingSeconds: Number(data.remainingSeconds) || 0,
        nextEligibleAt: data.nextEligibleAt ?? null,
        formUrl: data.formUrl ?? null,
      });
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load onboarding feedback.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      void loadEligibility();
    } else if (authStatus === 'unauthenticated') {
      router.replace('/auth/signin');
    }
  }, [authStatus, loadEligibility, router]);

  const openForm = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    setError('');

    try {
      const response = await fetch('/api/user/onboarding-feedback', {method: 'POST', cache: 'no-store'});

      if (response.status === 401) {
        router.replace('/auth/signin');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to start onboarding feedback.');
      }

      setEligibility({
        status: data.status ?? (data.canSubmit ? 'eligible_initial' : 'completed'),
        canSubmit: Boolean(data.canSubmit),
        formType: 'initial',
        remainingSeconds: Number(data.remainingSeconds) || 0,
        nextEligibleAt: data.nextEligibleAt ?? null,
        formUrl: data.formUrl ?? null,
      });
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start onboarding feedback.');
    } finally {
      setOpening(false);
    }
  }, [opening, router]);

  useEffect(() => {
    const nextEligibleAt = eligibility?.nextEligibleAt;
    if (!nextEligibleAt) return;

    const target = new Date(nextEligibleAt).getTime();
    const interval = setInterval(() => {
      if (Date.now() >= target) {
        clearInterval(interval);
        void loadEligibility();
        return;
      }
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [eligibility?.nextEligibleAt, loadEligibility]);

  // Keep an open form on screen while the status refreshes, so typed answers are not lost.
  if (authStatus === 'loading' || (loading && !formSrc)) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading onboarding feedback...
        </div>
      </main>
    );
  }

  const remaining = eligibility?.nextEligibleAt
    ? Math.max(0, Math.ceil((new Date(eligibility.nextEligibleAt).getTime() - now) / 1000))
    : 0;
  // During the open→lock window the client may still open the form, so it stays eligible.
  const windowOpen = eligibility?.status === 'pending' && eligibility?.canSubmit;
  const windowMinutes = Math.ceil(remaining / 60);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-2 rounded-lg text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-6 py-7 dark:border-gray-800 sm:px-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Onboarding Feedback</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Share your first impressions of getting started with DTPS.
            </p>
          </div>

          <div className="px-6 py-7 sm:px-8">
            {formSrc ? (
              <EmbeddedFeedbackForm
                src={formSrc}
                title="DTPS onboarding feedback form"
                onClose={() => {
                  setFormSrc(null);
                  void loadEligibility();
                }}
                onSubmitted={() => {
                  // Save that this client filled the form, so it is not offered again.
                  void fetch('/api/user/feedback/complete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({formType: 'initial'}),
                    cache: 'no-store',
                  }).catch(() => undefined);
                }}
              />
            ) : error ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => void loadEligibility()}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Try again
                </button>
              </div>
            ) : eligibility?.canSubmit ? (
              <div className="py-4">
                <div className="mb-5 flex items-start gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>Tell us how your onboarding is going.</p>
                </div>

                <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                  This onboarding form can be completed once during your entire account lifetime.
                  You&rsquo;ll have 2 minutes to finish it after opening.
                </p>

                {windowOpen && (
                  <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                    Your feedback window is open — you can reopen the form for about{' '}
                    {windowMinutes} minute{windowMinutes === 1 ? '' : 's'}.
                  </p>
                )}

                {eligibility.formUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Show the form inside this page. Leaving the page for docs.google.com
                      // or a browser fails on some installed app versions, a frame never does.
                      setFormSrc(embeddedFormUrl(eligibility.formUrl!));
                      void openForm();
                    }}
                    className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Open onboarding feedback form
                    <ExternalLink className="h-4 w-4" />
                  </button>
                ) : (
                  <p className="mt-7 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    The onboarding feedback form is not configured yet. Please contact support.
                  </p>
                )}
              </div>
            ) : (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-semibold">Onboarding feedback submitted</h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Thank you for sharing your onboarding feedback. This form can only be completed once.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}