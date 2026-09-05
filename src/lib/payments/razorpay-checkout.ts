'use client';

export interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutPayload {
  provider: 'razorpay_checkout';
  keyId: string;
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  image?: string;
  order_id: string;
  handler(response: RazorpayCheckoutResponse): void | Promise<void>;
  prefill?: RazorpayCheckoutPayload['prefill'];
  theme?: { color: string };
  modal?: { ondismiss(): void };
}

interface RazorpayInstance {
  open(): void;
}

interface RazorpayConstructor {
  new(options: RazorpayOptions): RazorpayInstance;
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let checkoutScriptPromise: Promise<RazorpayConstructor> | null = null;

export function loadRazorpayCheckout(): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay Checkout is available only in the browser.'));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScriptPromise) return checkoutScriptPromise;

  checkoutScriptPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    const script = existing || document.createElement('script');
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
    const handleLoad = () => {
      cleanup();
      if (window.Razorpay) {
        resolve(window.Razorpay);
      } else {
        checkoutScriptPromise = null;
        reject(new Error('Razorpay Checkout did not initialize. Please try again.'));
      }
    };
    const handleError = () => {
      cleanup();
      checkoutScriptPromise = null;
      reject(new Error('Unable to load Razorpay Checkout. Check your connection and try again.'));
    };

    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    const timeoutId = window.setTimeout(handleError, 15_000);

    if (!existing) {
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.dataset.checkoutProvider = 'razorpay';
      document.head.appendChild(script);
    }
  });

  return checkoutScriptPromise;
}

export function assertRazorpayCheckoutPayload(value: unknown): asserts value is RazorpayCheckoutPayload {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid checkout response. Please try again.');
  }
  const payload = value as Partial<RazorpayCheckoutPayload>;
  if (
    payload.provider !== 'razorpay_checkout'
    || !payload.keyId
    || !payload.orderId
    || !payload.paymentId
    || !Number.isFinite(payload.amount)
    || !payload.currency
  ) {
    throw new Error('Razorpay Checkout could not be initialized. Please try again.');
  }
}
