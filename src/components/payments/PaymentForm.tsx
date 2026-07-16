'use client';

import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  CreditCard, 
  Lock,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface PaymentFormProps {
  amount: number;
  currency?: string;
  description: string;
  appointmentId?: string;
  dietitianId?: string;
  onSuccess?: (paymentIntent: any) => void;
  onError?: (error: string) => void;
}

const CheckoutForm = ({ 
  amount, 
  currency = 'USD', 
  description, 
  appointmentId, 
  dietitianId,
  onSuccess,
  onError 
}: PaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError('');

    const cardElement = elements.getElement(CardElement);

    if (!cardElement) {
      setError('Card element not found');
      setLoading(false);
      return;
    }

    try {
      // Create payment intent
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount,
          currency,
          description,
          appointmentId,
          dietitianId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment intent');
      }

      const { paymentIntent } = await response.json();

      // Confirm payment with Stripe
      const { error: stripeError, paymentIntent: confirmedPaymentIntent } = await stripe.confirmCardPayment(
        paymentIntent.client_secret,
        {
          payment_method: {
            card: cardElement,
          }
        }
      );

      if (stripeError) {
        setError(stripeError.message || 'Payment failed');
        onError?.(stripeError.message || 'Payment failed');
      } else if (confirmedPaymentIntent?.status === 'succeeded') {
        setSucceeded(true);
        
        // Update payment status in our database
        await fetch('/api/payments', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentIntentId: confirmedPaymentIntent.id,
            status: 'completed',
            metadata: {
              stripePaymentIntentId: confirmedPaymentIntent.id
            }
          }),
        });

        onSuccess?.(confirmedPaymentIntent);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
  };

  if (succeeded) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-green-600 mb-2">Payment Successful!</h3>
          <p className="text-gray-600">
            Your payment of ${amount.toFixed(2)} has been processed successfully.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <CreditCard className="h-5 w-5" />
          <span>Payment Details</span>
        </CardTitle>
        <CardDescription>
          Complete your payment of ${amount.toFixed(2)} {currency}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Card Information
              </label>
              <div className="p-3 border border-gray-300 rounded-md">
                <CardElement options={cardElementOptions} />
              </div>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Payment Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Service:</span>
                  <span>{description}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount:</span>
                  <span>${amount.toFixed(2)} {currency}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Total:</span>
                  <span>${amount.toFixed(2)} {currency}</span>
                </div>
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={!stripe || loading}
          >
            {loading ? (
              <>
                <LoadingSpinner className="mr-2 h-4 w-4" />
                Processing...
              </>
            ) : (
              <>
                <Lock className="mr-2 h-4 w-4" />
                Pay ${amount.toFixed(2)}
              </>
            )}
          </Button>

          <div className="flex items-center justify-center space-x-2 text-xs text-gray-500">
            <Lock className="h-3 w-3" />
            <span>Your payment information is secure and encrypted</span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default function PaymentForm(props: PaymentFormProps) {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm {...props} />
    </Elements>
  );
}
