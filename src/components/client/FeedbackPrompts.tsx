'use client';

import {useCallback, useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {AlertCircle, ChevronRight, ClipboardList, Star, X} from 'lucide-react';
import {useTheme} from '@/contexts/ThemeContext';

type FeedbackPrompts = {
  onboardingDue: boolean;
  feedbackDue: boolean;
  feedbackDueFrom: string | null;
  showPopup: boolean;
  nextPopupAt: string | null;
};

/** Sections where opening them can bring up the popup (same 24-hour window for all). */
const POPUP_SECTIONS = ['/user/plan', '/user/messages', '/user/profile'];
/** Never cover the forms themselves. */
const FORM_PAGES = ['/user/feedback', '/user/onboarding-feedback'];

async function loadPrompts(): Promise<FeedbackPrompts | null> {
  try {
    const response = await fetch('/api/user/feedback/prompts', {cache: 'no-store'});
    if (!response.ok) return null;
    return (await response.json()) as FeedbackPrompts;
  } catch {
    return null;
  }
}

function inSection(pathname: string, sections: string[]) {
  return sections.some((section) => pathname === section || pathname.startsWith(section + '/'));
}

/**
 * Onboarding / feedback popup. Shows when the app opens and when the client opens
 * Meal, Messages or Profile, at most once every 24 hours across all of them.
 * It never blocks the app: the client can close it with the cross.
 */
export function FeedbackPopup() {
  const pathname = usePathname();
  const {isDarkMode} = useTheme();
  const [prompts, setPrompts] = useState<FeedbackPrompts | null>(null);
  const [open, setOpen] = useState(false);
  const firstCheck = useRef(true);
  const waitUntil = useRef(0);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current || Date.now() < waitUntil.current) return;
    checking.current = true;
    try {
      const data = await loadPrompts();
      if (!data) return;
      if (!data.onboardingDue && !data.feedbackDue) {
        // Nothing to ask for; look again after a while in case the 10th day arrives.
        waitUntil.current = Date.now() + 60 * 60 * 1000;
        return;
      }
      if (!data.showPopup) {
        waitUntil.current = data.nextPopupAt ? new Date(data.nextPopupAt).getTime() : Date.now() + 60 * 60 * 1000;
        return;
      }
      setPrompts(data);
      setOpen(true);
      const shown = await fetch('/api/user/feedback/prompts', {method: 'POST', cache: 'no-store'}).catch(() => null);
      const after = shown?.ok ? ((await shown.json()) as FeedbackPrompts) : null;
      waitUntil.current = after?.nextPopupAt ? new Date(after.nextPopupAt).getTime() : Date.now() + 24 * 60 * 60 * 1000;
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    if (inSection(pathname, FORM_PAGES)) {
      setOpen(false);
      return;
    }
    // App open (first screen) or one of the three sections.
    if (firstCheck.current || inSection(pathname, POPUP_SECTIONS)) {
      firstCheck.current = false;
      void check();
    }
  }, [pathname, check]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open || !prompts) return null;

  const card = isDarkMode ? 'bg-gray-900 text-gray-100 border-gray-800' : 'bg-white text-gray-900 border-gray-100';
  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const row = isDarkMode ? 'border-gray-800 hover:bg-white/5' : 'border-gray-100 hover:bg-gray-50';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-popup-title"
      onClick={() => setOpen(false)}
    >
      <div className={`relative w-full max-w-md rounded-3xl border p-5 shadow-xl ${card}`} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className={`absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
        >
          <X className="h-5 w-5" />
        </button>
        <h2 id="feedback-popup-title" className="pr-10 text-lg font-bold">
          A quick request from your dietitian
        </h2>
        <p className={`mt-1 text-sm ${muted}`}>It takes just a few minutes and helps us guide you better.</p>
        <div className="mt-4 space-y-2">
          {prompts.onboardingDue && (
            <Link href="/user/onboarding-feedback" onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-2xl border p-3 ${row}`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3AB1A0]/15 text-[#3AB1A0]">
                <ClipboardList className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">Onboarding form</span>
                <span className={`block text-xs ${muted}`}>Tell us about yourself</span>
              </span>
              <ChevronRight className={`h-5 w-5 ${muted}`} />
            </Link>
          )}
          {prompts.feedbackDue && (
            <Link href="/user/feedback" onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-2xl border p-3 ${row}`}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E06A26]/15 text-[#E06A26]">
                <Star className="h-5 w-5" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold">Feedback form</span>
                <span className={`block text-xs ${muted}`}>Share how your plan is going</span>
              </span>
              <ChevronRight className={`h-5 w-5 ${muted}`} />
            </Link>
          )}
        </div>
        <button type="button" onClick={() => setOpen(false)} className={`mt-4 w-full rounded-xl py-2.5 text-sm font-medium ${muted}`}>
          Maybe later
        </button>
      </div>
    </div>
  );
}

/**
 * Red reminder on the home screen under the client's name. Shows from the 10th day
 * until the feedback form is submitted. It cannot be dismissed.
 */
export function FeedbackReminderBanner() {
  const [due, setDue] = useState(false);

  useEffect(() => {
    let active = true;
    void loadPrompts().then((data) => {
      if (active) setDue(Boolean(data?.feedbackDue));
    });
    return () => {
      active = false;
    };
  }, []);

  if (!due) return null;

  return (
    <Link
      href="/user/feedback"
      className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700 transition-colors hover:bg-red-100 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200"
    >
      <AlertCircle className="h-5 w-5 shrink-0" />
      <span className="flex-1 text-sm font-semibold">Your feedback form is pending. Tap to fill it now.</span>
      <ChevronRight className="h-5 w-5 shrink-0" />
    </Link>
  );
}
