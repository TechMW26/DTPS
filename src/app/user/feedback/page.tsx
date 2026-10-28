'use client';

import {useCallback, useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {useSession} from 'next-auth/react';
import {ArrowLeft, Clock, ExternalLink, Loader2, MessageSquare, RefreshCw, Star} from 'lucide-react';
import {openExternalUrl} from '@/lib/native/open-external';

type EligibilityStatus = 'eligible_recurring' | 'cooldown' | 'pending';

type Eligibility = {
  status: EligibilityStatus;
  canSubmit: boolean;
  formType: 'recurring' | null;
  remainingSeconds: number;
  nextEligibleAt: string | null;
  formUrl: string | null;
};

function breakdown(totalSeconds: number) {
  const seconds = Math.max(0, totalSeconds);
  return {
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3_600),
    minutes: Math.floor((seconds % 3_600) / 60),
    seconds: Math.floor(seconds % 60),
  };
}

function remainingLabel(totalSeconds: number) {
  const {days, hours, minutes, seconds} = breakdown(totalSeconds);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (days === 0 && minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  if (days === 0 && minutes === 0 && seconds > 0) parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  if (!parts.length) parts.push('less than a minute');
  return parts.join(', ');
}

const COUNTDOWN_UNITS = ['Days', 'Hours', 'Minutes', 'Seconds'] as const;

export default function FeedbackPage() {
  const router = useRouter();
  const {status: authStatus} = useSession();

  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const loadEligibility = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/user/feedback/eligibility', {cache: 'no-store'});

      if (response.status === 401) {
        router.replace('/auth/signin');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to load feedback eligibility.');
      }

      setEligibility({
        status: data.status,
        canSubmit: Boolean(data.canSubmit),
        formType: data.formType ?? null,
        remainingSeconds: Number(data.remainingSeconds) || 0,
        nextEligibleAt: data.nextEligibleAt ?? null,
        formUrl: data.formUrl ?? null,
      });
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load feedback eligibility.');
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
    if (opening || !eligibility?.formUrl) return;
    setOpening(true);
    setError('');

    try {
      const response = await fetch('/api/user/feedback', {method: 'POST', cache: 'no-store'});

      if (response.status === 401) {
        router.replace('/auth/signin');
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to start feedback.');
      }

      setEligibility({
        status: data.status,
        canSubmit: Boolean(data.canSubmit),
        formType: data.formType ?? null,
        remainingSeconds: Number(data.remainingSeconds) || 0,
        nextEligibleAt: data.nextEligibleAt ?? null,
        formUrl: data.formUrl ?? null,
      });
      setNow(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start feedback.');
    } finally {
      setOpening(false);
    }
  }, [opening, eligibility?.formUrl, router]);

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

  if (authStatus === 'loading' || loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Checking your feedback eligibility...
        </div>
      </main>
    );
  }

  const remaining = eligibility?.nextEligibleAt
    ? Math.max(0, Math.ceil((new Date(eligibility.nextEligibleAt).getTime() - now) / 1000))
    : 0;
  const {days, hours, minutes, seconds} = breakdown(remaining);
  const showCooldown = eligibility?.status === 'cooldown';
  const showPending = eligibility?.status === 'pending';

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
            <h1 className="text-2xl font-bold tracking-tight">Your Feedback</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Help us improve your DTPS experience. Feedback is collected through our short Google Form.
            </p>
          </div>

          <div className="px-6 py-7 sm:px-8">
            {error ? (
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
            ) : showPending ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Clock className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-semibold">Form opened — finish it now</h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Feedback locks in {remainingLabel(remaining)}. Complete the form before the timer ends;
                  you can then submit again after 30 days.
                </p>
                <div className="mx-auto mt-6 flex items-center justify-center gap-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800">
                    <div className="text-3xl font-bold tabular-nums">{String(minutes).padStart(2, '0')}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Minutes</div>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-800 dark:bg-gray-800">
                    <div className="text-3xl font-bold tabular-nums">{String(seconds).padStart(2, '0')}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">Seconds</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void loadEligibility()}
                  className="mt-5 inline-flex items-center gap-2 text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh status
                </button>
              </div>
            ) : showCooldown ? (
              <div className="py-4 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
                  <Clock className="h-8 w-8" />
                </div>
                <h2 className="text-xl font-semibold">
                  You can respond again in {remainingLabel(remaining)}
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Thank you for your last feedback. You can share feedback once every 30 days.
                </p>
                <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
                  {COUNTDOWN_UNITS.map((label, index) => (
                    <div
                      key={label}
                      className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-4 dark:border-gray-800 dark:bg-gray-800"
                    >
                      <div className="text-2xl font-bold tabular-nums sm:text-3xl">
                        {String([days, hours, minutes, seconds][index]).padStart(2, '0')}
                      </div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{label}</div>
                    </div>
                  ))}
                </div>
                {eligibility?.nextEligibleAt && (
                  <p className="mt-5 text-xs text-gray-500 dark:text-gray-400">
                    Available from {new Date(eligibility.nextEligibleAt).toLocaleString()}
                  </p>
                )}
              </div>
            ) : eligibility?.canSubmit ? (
              <div className="py-4">
                <div className="mb-5 flex items-start gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  <Star className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>You&rsquo;re eligible to share your feedback!</p>
                </div>

                <p className="text-sm leading-6 text-gray-500 dark:text-gray-400">
                  Open the form to share what is working well and what we can improve. You&rsquo;ll have
                  2 minutes to finish it before feedback locks for 30 days.
                </p>

                {eligibility.formUrl ? (
                  <a
                    href={eligibility.formUrl}
                    onClick={(event) => {
                      event.preventDefault();
                      // Only start the 2-minute lock when the form actually opened.
                      // An older Android build without the openExternal bridge cannot
                      // open it, so those clients stay unlocked until they update.
                      if (openExternalUrl(eligibility.formUrl!)) {
                        void openForm();
                      }
                    }}
                    className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                  >
                    Open feedback form
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <p className="mt-7 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    The feedback form is not configured yet. Please contact support.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => void loadEligibility()}
                  className="mt-4 inline-flex items-center gap-2 text-sm text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh status
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}