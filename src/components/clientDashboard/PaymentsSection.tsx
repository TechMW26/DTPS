"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { formatDateIST } from '@/lib/utils/formatDateIST';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, Plus, RefreshCw, MoreVertical, Trash2, ExternalLink, Eye, FileText, Bell, Loader2, Mail, Printer, Package, ChevronDown, Wallet, Upload, Calendar } from "lucide-react";
import { useRealtime } from "@/hooks/useRealtime";
import { useDataRefresh, DataEventTypes } from "@/lib/events/useDataRefresh";
import ImageLightbox from "@/components/ui/image-lightbox";
import { resolvePaymentStatus, type ResolvedPaymentStatus } from '@/lib/payments/payment-status';
import { TableSkeleton } from '@/components/ui/skeleton';

// Service Plan interfaces
interface PricingTier {
  _id: string;
  durationDays: number;
  durationLabel: string;
  amount: number;
  isActive: boolean;
}

interface ServicePlan {
  _id: string;
  name: string;
  category: string;
  description?: string;
  pricingTiers: PricingTier[];
  maxDiscountPercent: number;
  isActive: boolean;
}

export interface PaymentItem {
  _id: string;
  razorpayPaymentLinkUrl?: string;
  razorpayPaymentLinkShortUrl?: string;
  razorpayPaymentId?: string;
  transactionId?: string;
  amount: number;
  tax?: number;
  discount?: number;
  finalAmount: number;
  expireDate?: string;
  notes?: string;
  showToClient?: boolean;
  planCategory?: string;
  planName?: string;
  catalogue?: string;
  duration?: string;
  durationDays?: number;
  servicePlanId?: string;
  pricingTierId?: string;
  createdAt: string;
  status?: string;
  paidAt?: string;
  client?: {
    _id: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
  };
  dietitian?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
}

export default function PaymentsSection({
  client,
  formatDate,
  onRegisterReset,
}: {
  client?: any;
  formatDate?: (dateString?: string) => string;
  onRegisterReset?: (fn: () => void) => void;
}) {
  const { data: session } = useSession();
  const normalizedRole = ((session?.user?.role || '') as string).toLowerCase() === 'dietician'
    ? 'dietitian'
    : ((session?.user?.role || '') as string).toLowerCase();
  const isAdmin = normalizedRole === 'admin';
  const isDietitian = normalizedRole === 'dietitian';
  const canEditExpectedDates = isAdmin || isDietitian; // Admin and Dietitian can edit expected dates
  const canEmailInvoice = normalizedRole === 'admin' || normalizedRole === 'dietitian' || normalizedRole === 'health_counselor';

  const [paymentsState, setPaymentsState] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    created: true,
    customerName: true,
    phone: false,
    email: false,
    plan: true,
    amount: true,
    final: true,
    status: true,
    transactionId: true,
    expectedDates: true,
    link: true,
    notes: false,
    catalogue: false,
    duration: true,
    expireDate: true,
  });

  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  // Receipt image lightbox state
  const [receiptLightboxOpen, setReceiptLightboxOpen] = useState(false);
  const [receiptLightboxImage, setReceiptLightboxImage] = useState('');

  const openReceiptLightbox = (url: string) => {
    setReceiptLightboxImage(url);
    setReceiptLightboxOpen(true);
  };

  // Service Plans state
  const [servicePlans, setServicePlans] = useState<ServicePlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedServicePlan, setSelectedServicePlan] = useState<ServicePlan | null>(null);
  const [selectedPricingTier, setSelectedPricingTier] = useState<PricingTier | null>(null);
  const [maxDiscount, setMaxDiscount] = useState<number>(100);

  // Modal fields
  const [showModal, setShowModal] = useState(false);
  const [expireDate, setExpireDate] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [tax, setTax] = useState<number | "">(0);
  const [discount, setDiscount] = useState("0");
  const [finalAmount, setFinalAmount] = useState("0");
  const [isEditingFinalAmount, setIsEditingFinalAmount] = useState(false);
  const skipNextAutoCalcRef = useRef(false);
  const [notes, setNotes] = useState("");
  const [showToClient, setShowToClient] = useState(true);
  const [planCategory, setPlanCategory] = useState("");
  const [planName, setPlanName] = useState("");
  const [catalogue, setCatalogue] = useState("");
  const [duration, setDuration] = useState<number | "">(1);
  const [durationLabel, setDurationLabel] = useState("");

  // Fetch service plans
  const fetchServicePlans = useCallback(async () => {
    setLoadingPlans(true);
    try {
      const response = await fetch('/api/admin/service-plans?activeOnly=true');
      const data = await response.json();
      if (data.success) {
        setServicePlans(data.plans || []);
      }
    } catch (error) {
      console.error('Error fetching service plans:', error);
    } finally {
      setLoadingPlans(false);
    }
  }, []);

  // Get unique categories from service plans
  const getUniqueCategories = () => {
    const categories = [...new Set(servicePlans.map(p => p.category))];
    return categories;
  };

  // Get plans filtered by selected category
  const getPlansForCategory = () => {
    if (!selectedCategory) return [];
    return servicePlans.filter(p => p.category === selectedCategory);
  };

  // Handle category selection
  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedServicePlan(null);
    setSelectedPricingTier(null);
    setPlanCategory(category);
    setPlanName("");
    setAmount("");
    setDuration("");
    setDurationLabel("");
    setMaxDiscount(100);
  };

  // Handle service plan selection
  const handleServicePlanSelect = (planId: string) => {
    const plan = servicePlans.find(p => p._id === planId);
    if (plan) {
      setSelectedServicePlan(plan);
      setSelectedPricingTier(null);
      setPlanName(plan.name);
      setMaxDiscount(plan.maxDiscountPercent);
      // Reset amount when plan changes
      setAmount("");
      setDuration("");
      setDurationLabel("");
    } else {
      setSelectedServicePlan(null);
      setSelectedPricingTier(null);
      setMaxDiscount(100);
    }
  };

  // Handle pricing tier selection - auto-fill amount and duration
  const handlePricingTierSelect = (tierId: string) => {
    if (!selectedServicePlan) return;
    const tier = selectedServicePlan.pricingTiers.find(t => t._id === tierId);
    if (tier) {
      setSelectedPricingTier(tier);
      setAmount(tier.amount);
      setDuration(tier.durationDays);
      setDurationLabel(tier.durationLabel);
      // Use tier-level max discount
      setMaxDiscount((tier as any).maxDiscount || 100);
    }
  };

  // Auto-calc final amount when discount changes (only when not editing final amount directly)
  useEffect(() => {
    if (isEditingFinalAmount) return; // Skip if user is editing final amount directly
    if (skipNextAutoCalcRef.current) {
      skipNextAutoCalcRef.current = false;
      return;
    }

    const amt = typeof amount === "number" ? amount : 0;
    const t = typeof tax === "number" ? tax : 0;
    const d = parseFloat(discount) || 0;

    // Enforce max discount limit
    const effectiveDiscount = Math.min(d, maxDiscount);

    const taxed = amt + (amt * t) / 100;
    const finalVal = Math.max(0, taxed - (amt * effectiveDiscount) / 100);
    const roundedFinal = Math.round(finalVal * 100) / 100;
    setFinalAmount(String(roundedFinal));
  }, [amount, tax, discount, maxDiscount, isEditingFinalAmount]);

  // Handle discount input change — allow free typing, validate on blur
  const handleDiscountChange = (value: string) => {
    // Allow empty string, digits, and one decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setDiscount(value);
    }
  };

  // Validate discount on blur — clamp to [0, maxDiscount]
  const handleDiscountBlur = () => {
    const d = parseFloat(discount) || 0;
    const clamped = Math.min(Math.max(0, d), maxDiscount);
    if (d > maxDiscount) {
      toast.error(`Maximum discount for this plan is ${maxDiscount}%`);
    }
    setDiscount(String(Math.round(clamped * 100) / 100));
  };

  // Calculate discount from final amount when user edits final amount directly
  const handleFinalAmountChange = (value: string) => {
    // Allow empty string, digits, and one decimal point
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;

    setIsEditingFinalAmount(true);
    setFinalAmount(value);
  };

  // Validate final amount on blur and calculate discount
  const handleFinalAmountBlur = () => {
    const amt = typeof amount === "number" ? amount : 0;
    const t = typeof tax === "number" ? tax : 0;
    const taxedAmount = amt + (amt * t) / 100;

    // Parse the entered final amount - keep exact integer if user typed one
    const parsedVal = parseFloat(finalAmount) || 0;
    let val = Math.max(0, parsedVal); // No negative

    // Calculate minimum final amount based on max discount
    const minFinalAmount = taxedAmount - (amt * maxDiscount) / 100;

    let wasAdjusted = false;
    if (val < minFinalAmount && amt > 0) {
      toast.error(`Final amount cannot be less than ₹${Math.ceil(minFinalAmount)} (max ${maxDiscount}% discount)`);
      val = Math.ceil(minFinalAmount);
      wasAdjusted = true;
    }

    // If final amount is more than taxed amount, set discount to 0
    if (val > taxedAmount) {
      val = taxedAmount;
      wasAdjusted = true;
    }

    // Keep the user's exact value if it wasn't adjusted for limits
    const finalVal = wasAdjusted ? val : parsedVal;

    // Set skip flag BEFORE any state changes to prevent useEffect from overwriting
    skipNextAutoCalcRef.current = true;

    // Only update finalAmount if it was adjusted
    if (wasAdjusted) {
      setFinalAmount(String(finalVal));
    }

    // Now calculate the actual discount percentage
    if (amt > 0) {
      const discountAmount = taxedAmount - finalVal;
      const calculatedDiscount = (discountAmount * 100) / amt;
      setDiscount(String(Math.round(Math.max(0, calculatedDiscount) * 100) / 100));
    }

    // Reset editing flag
    setIsEditingFinalAmount(false);
  };

  // Fetch payment links from API
  const fetchPaymentLinks = useCallback(async () => {
    if (!client?._id) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/payment-links?clientId=${client._id}`, { cache: 'no-store' });
      const data = await response.json();

      if (data.success) {
        setPaymentsState(data.paymentLinks || []);
      } else {
        console.error('Failed to fetch payment links:', data.error);
      }
    } catch (error) {
      console.error('Error fetching payment links:', error);
    } finally {
      setLoading(false);
    }
  }, [client?._id]);

  // Load payment links on mount
  useEffect(() => {
    fetchPaymentLinks();
  }, [fetchPaymentLinks]);

  // Load service plans when modal opens
  useEffect(() => {
    if (showModal && servicePlans.length === 0) {
      fetchServicePlans();
    }
  }, [showModal, servicePlans.length, fetchServicePlans]);

  const resetModal = () => {
    setExpireDate("");
    setAmount("");
    setTax(0);
    setDiscount("0");
    setFinalAmount("0");
    setIsEditingFinalAmount(false);
    setNotes("");
    setShowToClient(true);
    setPlanCategory("");
    setPlanName("");
    setCatalogue("");
    setDuration(1);
    setDurationLabel("");
    setSelectedCategory("");
    setSelectedServicePlan(null);
    setSelectedPricingTier(null);
    setMaxDiscount(100);
    setShowModal(false);
  };

  const generateLink = async () => {
    if (!amount || typeof amount !== "number") {
      toast.error("Enter valid amount");
      return;
    }

    if (!client?._id) {
      toast.error("Client information is missing");
      return;
    }

    if (!selectedServicePlan || !selectedPricingTier) {
      toast.error("Please select a service plan and duration");
      return;
    }

    if (!expireDate) {
      toast.error("Link expire date is required");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/payment-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: client._id,
          amount,
          tax: Number(tax) || 0,
          discount: Math.min(parseFloat(discount) || 0, maxDiscount),
          finalAmount: parseFloat(finalAmount) || 0,
          planCategory: planCategory || undefined,
          planName: planName || undefined,
          duration: durationLabel || `${duration} Days`,
          durationDays: Number(duration) || undefined,
          servicePlanId: selectedServicePlan._id,
          pricingTierId: selectedPricingTier._id,
          catalogue: catalogue || undefined,
          expireDate: expireDate || undefined,
          notes: notes || undefined,
          showToClient,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Payment link generated successfully!");
        resetModal();
        fetchPaymentLinks();
      } else {
        toast.error(data.error || "Failed to generate payment link");
      }
    } catch (error) {
      console.error('Error creating payment link:', error);
      toast.error("Failed to generate payment link");
    } finally {
      setCreating(false);
    }
  };

  const getPaymentLink = (payment: PaymentItem): string => {
    // Always prioritize Razorpay short URL (rzp.io) over manual links
    if (payment.razorpayPaymentLinkShortUrl && payment.razorpayPaymentLinkShortUrl.includes('rzp.io')) {
      return payment.razorpayPaymentLinkShortUrl;
    }
    if (payment.razorpayPaymentLinkUrl && payment.razorpayPaymentLinkUrl.includes('rzp.io')) {
      return payment.razorpayPaymentLinkUrl;
    }
    // Fallback to stored URLs (these should now use production URL)
    return payment.razorpayPaymentLinkShortUrl || payment.razorpayPaymentLinkUrl || '';
  };

  const isRazorpayLink = (payment: PaymentItem): boolean => {
    const link = getPaymentLink(payment);
    return link.includes('rzp.io') || link.includes('razorpay');
  };

  const copyLink = async (payment: PaymentItem) => {
    const link = getPaymentLink(payment);
    if (link) {
      await navigator.clipboard.writeText(link);
      toast.success("Link copied to clipboard");
    }
    setOpenRowMenuId(null);
  };

  const deletePayment = async (id: string) => {
    try {
      const response = await fetch(`/api/payment-links?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Payment link cancelled");
        fetchPaymentLinks();
      } else {
        toast.error(data.error || "Failed to cancel payment link");
      }
    } catch (error) {
      console.error('Error deleting payment link:', error);
      toast.error("Failed to cancel payment link");
    }
    setOpenRowMenuId(null);
  };

  const viewPayment = (payment: PaymentItem) => {
    const link = getPaymentLink(payment);
    if (link) {
      window.open(link, "_blank");
    }
    setOpenRowMenuId(null);
  };

  const generateInvoice = async (payment: PaymentItem) => {
    setOpenRowMenuId(null);

    // Find UnifiedPayment (clientPurchase) for this PaymentLink
    const purchase = findLinkedPurchaseByPaymentLinkId(payment._id);

    if (purchase?._id) {
      // Use new UnifiedPayment-based invoice
      window.open(`/api/invoices/${purchase._id}`, '_blank');
    } else {
      // Fallback to old PaymentLink-based invoice
      window.open(`/api/payment-links/invoice?id=${payment._id}`, '_blank');
    }
  };

  const sendInvoiceEmail = async (payment: PaymentItem) => {
    const purchase = findLinkedPurchaseByPaymentLinkId(payment._id);
    const isPaid =
      isPaidLikeStatus(payment.status) ||
      isPaidLikeStatus(purchase?.paymentStatus) ||
      isPaidLikeStatus(purchase?.status);

    if (!isPaid) {
      toast.error('Invoice can only be sent for paid payments');
      setOpenRowMenuId(null);
      return;
    }

    try {
      let response;
      if (purchase?._id) {
        // Use new UnifiedPayment-based invoice email
        response = await fetch(`/api/invoices/${purchase._id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        // Fallback to old PaymentLink-based invoice email
        response = await fetch('/api/payment-links/invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentLinkId: payment._id }),
        });
      }

      const data = await response.json();

      if (data.success) {
        toast.success(`Invoice sent to ${data.sentTo}`);
      } else {
        toast.error(data.error || 'Failed to send invoice');
      }
    } catch (error) {
      console.error('Error sending invoice:', error);
      toast.error('Failed to send invoice');
    }
    setOpenRowMenuId(null);
  };

  const refreshPayment = async () => {
    await fetchPaymentLinks();
    toast.success("Payments refreshed");
    setOpenRowMenuId(null);
  };

  const [sendingReminder, setSendingReminder] = useState(false);
  const [syncingPayment, setSyncingPayment] = useState<string | null>(null);

  // Other Platform Payment states
  const [showOtherPaymentModal, setShowOtherPaymentModal] = useState(false);
  const [selectedPaymentForOther, setSelectedPaymentForOther] = useState<PaymentItem | null>(null);
  const [otherPaymentPlatform, setOtherPaymentPlatform] = useState("");
  const [otherPaymentCustomPlatform, setOtherPaymentCustomPlatform] = useState("");
  const [otherPaymentTransactionId, setOtherPaymentTransactionId] = useState("");
  const [otherPaymentDate, setOtherPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [otherPaymentNotes, setOtherPaymentNotes] = useState("");
  const [otherPaymentReceipt, setOtherPaymentReceipt] = useState<File | null>(null);
  const [submittingOtherPayment, setSubmittingOtherPayment] = useState(false);
  const [otherPlatformPayments, setOtherPlatformPayments] = useState<any[]>([]);

  // Expected Dates Modal states
  const [showExpectedDatesModal, setShowExpectedDatesModal] = useState(false);
  const [selectedPurchaseForDates, setSelectedPurchaseForDates] = useState<any | null>(null);
  const [expectedStartDateInput, setExpectedStartDateInput] = useState("");
  const [expectedEndDateInput, setExpectedEndDateInput] = useState("");
  const [savingExpectedDates, setSavingExpectedDates] = useState(false);
  const [clientPurchases, setClientPurchases] = useState<any[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [expectedDateError, setExpectedDateError] = useState<string | null>(null);

  const toIdString = (value: any) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value._id) return String(value._id);
    return String(value);
  };

  const normalizeDateString = (value?: string): string | undefined => {
    if (!value || typeof value !== 'string') return value;

    const match = value.match(/^(\d{5})(-.+)$/);
    if (!match) return value;

    const [, year, rest] = match;
    if (year.startsWith('20') && year[3] === '0') {
      return `${year.slice(0, 3)}${year.slice(4)}${rest}`;
    }

    return value;
  };

  const findLinkedPurchaseByPaymentLinkId = useCallback((paymentLinkId: any) => {
    const targetId = toIdString(paymentLinkId);
    if (!targetId) return null;

    const matches = clientPurchases.filter((purchase: any) =>
      toIdString(purchase.paymentLink) === targetId
    );

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // Prefer the freshest purchase with expected dates when duplicate records exist.
    return matches.sort((a: any, b: any) => {
      const aHasExpected = a.expectedStartDate || a.expectedEndDate ? 1 : 0;
      const bHasExpected = b.expectedStartDate || b.expectedEndDate ? 1 : 0;
      if (aHasExpected !== bHasExpected) {
        return bHasExpected - aHasExpected;
      }

      const aUpdated = new Date(a.updatedAt || a.purchaseDate || a.createdAt || 0).getTime();
      const bUpdated = new Date(b.updatedAt || b.purchaseDate || b.createdAt || 0).getTime();
      return bUpdated - aUpdated;
    })[0] || null;
  }, [clientPurchases]);

  const getTransactionIdForPayment = (payment: PaymentItem): string => {
    const directTransactionId = payment.transactionId?.trim();
    if (directTransactionId) return directTransactionId;

    const directRazorpayPaymentId = payment.razorpayPaymentId?.trim();
    if (directRazorpayPaymentId) return directRazorpayPaymentId;

    const linkedPurchase = findLinkedPurchaseByPaymentLinkId(payment._id);

    const purchaseTransactionId = linkedPurchase?.transactionId;
    if (typeof purchaseTransactionId === 'string' && purchaseTransactionId.trim()) {
      return purchaseTransactionId.trim();
    }

    const purchaseRazorpayPaymentId = linkedPurchase?.razorpayPaymentId;
    if (typeof purchaseRazorpayPaymentId === 'string' && purchaseRazorpayPaymentId.trim()) {
      return purchaseRazorpayPaymentId.trim();
    }

    return '—';
  };

  // Platform options
  const platformOptions = [
    { value: 'upi', label: 'UPI' },
    { value: 'gpay', label: 'Google Pay' },
    { value: 'phonepe', label: 'PhonePe' },
    { value: 'paytm', label: 'Paytm' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'cash', label: 'Cash' },
    { value: 'other', label: 'Other' },
  ];

  // Fetch other platform payments
  const fetchOtherPlatformPayments = useCallback(async () => {
    if (!client?._id) return;
    try {
      const response = await fetch(`/api/other-platform-payments?clientId=${client._id}`, { cache: 'no-store' });
      const data = await response.json();
      if (data.payments) {
        setOtherPlatformPayments(data.payments);
      }
    } catch (error) {
      console.error('Error fetching other platform payments:', error);
    }
  }, [client?._id]);

  // Fetch client purchases
  const fetchClientPurchases = useCallback(async () => {
    if (!client?._id) return;
    setLoadingPurchases(true);
    try {
      const response = await fetch(`/api/client-purchases?clientId=${client._id}`, { cache: 'no-store' });
      const data = await response.json();
      if (data.success) {
        const normalizedPurchases = (data.purchases || []).map((purchase: any) => ({
          ...purchase,
          startDate: normalizeDateString(purchase?.startDate) || purchase?.startDate,
          endDate: normalizeDateString(purchase?.endDate) || purchase?.endDate,
          expectedStartDate: normalizeDateString(purchase?.expectedStartDate) || purchase?.expectedStartDate,
          expectedEndDate: normalizeDateString(purchase?.expectedEndDate) || purchase?.expectedEndDate,
        }));
        setClientPurchases(normalizedPurchases);
      }
    } catch (error) {
      console.error('Error fetching client purchases:', error);
    } finally {
      setLoadingPurchases(false);
    }
  }, [client?._id]);

  // Load other platform payments
  useEffect(() => {
    fetchOtherPlatformPayments();
  }, [fetchOtherPlatformPayments]);

  // Load client purchases when payments are loaded
  useEffect(() => {
    fetchClientPurchases();
  }, [fetchClientPurchases]);

  useRealtime({
    onMessage: (event) => {
      if (event.type === 'payment_link_updated' || event.type === 'payment_updated') {
        fetchPaymentLinks();
        fetchClientPurchases();
      }
    },
  });

  useDataRefresh(
    [
      DataEventTypes.MEAL_PLAN_EXTENDED,
      DataEventTypes.MEAL_PLAN_FROZEN,
      DataEventTypes.MEAL_PLAN_UNFROZEN,
      DataEventTypes.PURCHASE_UPDATED,
      DataEventTypes.PAYMENT_UPDATED,
    ],
    () => {
      fetchPaymentLinks();
      fetchClientPurchases();
    },
    [fetchPaymentLinks, fetchClientPurchases]
  );

  // Keep purchase state synchronized whenever payment rows change.
  const paymentStateFingerprint = useMemo(() =>
    paymentsState
      .map((payment) => `${payment._id}:${payment.status || ''}:${payment.paidAt || ''}`)
      .join('|'),
    [paymentsState]);

  useEffect(() => {
    if (!client?._id || paymentsState.length === 0) return;
    fetchClientPurchases();
  }, [client?._id, paymentsState.length, paymentStateFingerprint, fetchClientPurchases]);

  useEffect(() => {
    if (!openRowMenuId) return;

    const payment = paymentsState.find((p) => p._id === openRowMenuId);
    const importedPurchase = clientPurchases.find((p: any) =>
      toIdString(p._id) === toIdString(openRowMenuId) &&
      (!p.paymentLink || !paymentsState.some((pl) => toIdString(pl._id) === toIdString(p.paymentLink)))
    );

    const activeItem = payment || importedPurchase;
    if (!activeItem) return;

    const linkedPurchase = payment
      ? findLinkedPurchaseByPaymentLinkId(payment._id)
      : importedPurchase;

    const resolvedStatus = resolveDisplayStatus(activeItem as PaymentItem, linkedPurchase);
    const isPaid = resolvedStatus === 'paid';

    console.info('[MEAL_PLAN_ACCESS_DEBUG]', {
      clientId: client?._id,
      role: normalizedRole,
      roleCanCreateMealPlan: isDietitian,
      paymentId: toIdString((activeItem as any)._id),
      paymentStatus: (activeItem as any).status || null,
      resolvedStatus,
      linkedPurchaseId: linkedPurchase?._id ? toIdString(linkedPurchase._id) : null,
      linkedPurchaseStatus: linkedPurchase?.status || null,
      linkedPurchasePaymentStatus: linkedPurchase?.paymentStatus || null,
      canCreateMealPlan: isDietitian && isPaid,
    });
  }, [
    openRowMenuId,
    paymentsState,
    clientPurchases,
    findLinkedPurchaseByPaymentLinkId,
    isDietitian,
    normalizedRole,
    client?._id,
  ]);

  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => {
        fetchPaymentLinks();
        fetchClientPurchases();
      });
    }
  }, [onRegisterReset]);

  // Helper function to check if a purchase/plan ends within X days
  const isPlanEndingWithinDays = (purchase: any, days: number): boolean => {
    if (!purchase?.endDate && !purchase?.expectedEndDate) return false;
    const endDate = new Date(purchase.expectedEndDate || purchase.endDate);
    const today = new Date();
    endDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const daysUntilEnd = Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilEnd >= 0 && daysUntilEnd <= days;
  };

  // NOTE: Auto-show of expected dates modal is DISABLED per user request.
  // Dietitians should manually click the button to set expected dates.
  // The modal will NOT auto-open anymore.

  // Open expected dates modal
  const openExpectedDatesModal = (purchase: any) => {
    // Check if user has permission (admin and dietitian can edit expected dates)
    if (!isAdmin && !isDietitian) {
      toast.error('Only admins and dietitians are permitted to modify expected dates');
      return;
    }

    // Dietitian: Check if expected end date already exists and validate edit window
    if (isDietitian && purchase.expectedEndDate) {
      const existingEndDate = new Date(purchase.expectedEndDate);
      existingEndDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate one day before the expected end date
      const oneDayBeforeEnd = new Date(existingEndDate);
      oneDayBeforeEnd.setDate(oneDayBeforeEnd.getDate() - 1);

      // Check if today is on or after the expected end date
      if (today >= existingEndDate) {
        toast.error('Cannot modify expected dates: The expected end date has already passed or is today.');
        return;
      }

      // Check if today is after one day before the expected end date
      if (today > oneDayBeforeEnd) {
        toast.error('Cannot modify expected dates: Changes are only allowed up to one day before the expected end date.');
        return;
      }
    }

    setSelectedPurchaseForDates(purchase);
    setExpectedStartDateInput(purchase.expectedStartDate ? new Date(purchase.expectedStartDate).toISOString().split('T')[0] : '');
    setExpectedEndDateInput(purchase.expectedEndDate ? new Date(purchase.expectedEndDate).toISOString().split('T')[0] : '');
    setExpectedDateError(null);
    setShowExpectedDatesModal(true);
  };

  // Reset expected dates modal
  const resetExpectedDatesModal = () => {
    setShowExpectedDatesModal(false);
    setSelectedPurchaseForDates(null);
    setExpectedStartDateInput('');
    setExpectedEndDateInput('');
    setExpectedDateError(null);
  };

  // Open expected dates modal from payment three-dots menu
  const openExpectedDatesModalForPayment = async (payment: PaymentItem) => {
    setOpenRowMenuId(null); // Close the dropdown

    // Find the corresponding ClientPurchase for this payment
    const purchase = clientPurchases.find(p =>
      toIdString(p.paymentLink) === toIdString(payment._id)
    );

    if (purchase) {
      openExpectedDatesModal(purchase);
    } else {
      // If no purchase found, try a forced sync + fresh purchase fetch
      try {
        await fetch(`/api/client-purchases/check?clientId=${client._id}&forceSync=true`);

        const response = await fetch(`/api/client-purchases?clientId=${client._id}`, { cache: 'no-store' });
        const data = await response.json();
        if (data.success && data.purchases?.length > 0) {
          const matchingPurchase = data.purchases.find((p: any) =>
            toIdString(p.paymentLink) === toIdString(payment._id)
          ) || data.purchases.find((p: any) =>
            p.planName === payment.planName &&
            Number(p.durationDays || 0) === Number(payment.durationDays || 0)
          );

          if (matchingPurchase) {
            setClientPurchases(data.purchases);
            openExpectedDatesModal(matchingPurchase);
            return;
          }
        }

        toast.error('No purchase record found for this payment yet. Please sync payment status and try again.');
      } catch (error) {
        console.error('Error fetching purchases:', error);
        toast.error('Failed to load purchase details');
      }
    }
  };

  // Calculate expected end date based on start date and duration
  const calculateExpectedEndDate = (startDate: string, durationDays: number) => {
    if (!startDate) return '';
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + durationDays - 1); // -1 because start day counts as day 1
    return end.toISOString().split('T')[0];
  };

  // Check if expected dates can be edited (for UI display)
  const canEditExpectedEndDateForPurchase = (purchase: any): { allowed: boolean; reason?: string } => {
    // Only admin and dietitian can edit
    if (!isDietitian && !isAdmin) {
      return { allowed: false, reason: 'Only admins and dietitians can modify expected dates' };
    }

    // Admin can edit expected dates at any time
    if (isAdmin) {
      return { allowed: true };
    }

    // If no existing expected end date, editing is allowed
    if (!purchase?.expectedEndDate) {
      return { allowed: true };
    }

    const existingEndDate = new Date(purchase.expectedEndDate);
    existingEndDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const oneDayBeforeEnd = new Date(existingEndDate);
    oneDayBeforeEnd.setDate(oneDayBeforeEnd.getDate() - 1);

    if (today >= existingEndDate) {
      return { allowed: false, reason: 'Expected end date has passed' };
    }

    if (today > oneDayBeforeEnd) {
      return { allowed: false, reason: 'Changes only allowed up to 1 day before end date' };
    }

    return { allowed: true };
  };

  // NOTE: Expected end date is NOT auto-calculated anymore.
  // Dietitian must manually select both start and end dates.

  // Save expected dates
  const saveExpectedDates = async () => {
    if (!selectedPurchaseForDates?._id) {
      toast.error('No purchase selected');
      return;
    }
    if (!expectedStartDateInput) {
      toast.error('Please select expected start date');
      return;
    }

    // Frontend validation: Only admin and dietitian can save expected dates
    if (!isAdmin && !isDietitian) {
      toast.error('Only admins and dietitians are permitted to modify expected dates');
      setExpectedDateError('Only admins and dietitians are permitted to modify expected dates');
      return;
    }

    // Frontend validation: Check edit window for existing expected end date (only for dietitians)
    if (!isAdmin && isDietitian && selectedPurchaseForDates.expectedEndDate && expectedEndDateInput) {
      const existingEndDate = new Date(selectedPurchaseForDates.expectedEndDate);
      existingEndDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const oneDayBeforeEnd = new Date(existingEndDate);
      oneDayBeforeEnd.setDate(oneDayBeforeEnd.getDate() - 1);

      if (today >= existingEndDate) {
        toast.error('Cannot modify: Expected end date has already passed or is today');
        setExpectedDateError('Cannot modify: Expected end date has already passed or is today');
        return;
      }

      if (today > oneDayBeforeEnd) {
        toast.error('Cannot modify: Changes only allowed up to one day before expected end date');
        setExpectedDateError('Changes only allowed up to one day before expected end date');
        return;
      }
    }

    setSavingExpectedDates(true);
    setExpectedDateError(null);
    try {
      const response = await fetch('/api/client-purchases', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseId: selectedPurchaseForDates._id,
          expectedStartDate: expectedStartDateInput,
          expectedEndDate: expectedEndDateInput || undefined, // Don't auto-calculate, require manual selection
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Expected dates saved successfully');
        resetExpectedDatesModal();
        fetchClientPurchases(); // Refresh the purchases list
      } else {
        // Handle specific error codes from backend
        if (data.code === 'ROLE_UNAUTHORIZED') {
          toast.error('Only admins and dietitians are permitted to modify expected dates');
          setExpectedDateError('Only admins and dietitians are permitted to modify expected dates');
        } else if (data.code === 'DATE_EXPIRED') {
          toast.error('Cannot modify: Expected end date has passed');
          setExpectedDateError('Expected end date has passed. No modifications allowed.');
        } else if (data.code === 'DATE_TOO_CLOSE') {
          toast.error('Cannot modify: Too close to expected end date');
          setExpectedDateError('Changes only allowed up to one day before expected end date.');
        } else {
          toast.error(data.error || 'Failed to save expected dates');
          setExpectedDateError(data.error || 'Failed to save expected dates');
        }
      }
    } catch (error) {
      console.error('Error saving expected dates:', error);
      toast.error('Failed to save expected dates');
      setExpectedDateError('Network error. Please try again.');
    } finally {
      setSavingExpectedDates(false);
    }
  };

  // Submit other platform payment
  const submitOtherPlatformPayment = async () => {
    if (!selectedPaymentForOther) {
      toast.error('Please select a payment link');
      return;
    }
    if (!otherPaymentPlatform) {
      toast.error('Please select a payment platform');
      return;
    }
    if (otherPaymentPlatform === 'other' && !otherPaymentCustomPlatform.trim()) {
      toast.error('Please enter the platform name');
      return;
    }
    if (!otherPaymentTransactionId.trim()) {
      toast.error('Please enter the transaction ID');
      return;
    }
    if (!otherPaymentDate) {
      toast.error('Please select payment date');
      return;
    }

    setSubmittingOtherPayment(true);
    try {
      const formData = new FormData();
      formData.append('clientId', client._id);
      formData.append('paymentLinkId', selectedPaymentForOther._id);
      formData.append('platform', otherPaymentPlatform);
      if (otherPaymentPlatform === 'other') {
        formData.append('customPlatform', otherPaymentCustomPlatform);
      }
      formData.append('transactionId', otherPaymentTransactionId);
      formData.append('amount', String(selectedPaymentForOther.finalAmount));
      formData.append('paymentDate', otherPaymentDate);
      formData.append('planName', selectedPaymentForOther.planName || '');
      formData.append('planCategory', selectedPaymentForOther.planCategory || '');
      formData.append('durationDays', String(selectedPaymentForOther.durationDays || 0));
      formData.append('durationLabel', selectedPaymentForOther.duration || '');
      if (otherPaymentNotes) {
        formData.append('notes', otherPaymentNotes);
      }
      if (otherPaymentReceipt) {
        formData.append('receiptImage', otherPaymentReceipt);
      }

      const response = await fetch('/api/other-platform-payments', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Payment submitted for admin approval');
        resetOtherPaymentModal();
        fetchOtherPlatformPayments();
      } else {
        toast.error(data.error || 'Failed to submit payment');
      }
    } catch (error) {
      console.error('Error submitting other platform payment:', error);
      toast.error('Failed to submit payment');
    } finally {
      setSubmittingOtherPayment(false);
    }
  };

  const resetOtherPaymentModal = () => {
    setShowOtherPaymentModal(false);
    setSelectedPaymentForOther(null);
    setOtherPaymentPlatform("");
    setOtherPaymentCustomPlatform("");
    setOtherPaymentTransactionId("");
    setOtherPaymentDate(new Date().toISOString().split('T')[0]);
    setOtherPaymentNotes("");
    setOtherPaymentReceipt(null);
  };

  const openOtherPaymentModal = (payment: PaymentItem) => {
    setSelectedPaymentForOther(payment);
    setShowOtherPaymentModal(true);
    setOpenRowMenuId(null);
  };

  // Sync payment status from Razorpay
  const syncPaymentStatus = async (payment: PaymentItem) => {
    const linkedPurchase = findLinkedPurchaseByPaymentLinkId(payment._id);
    const resolvedStatus = resolveDisplayStatus(payment, linkedPurchase);

    if (resolvedStatus === 'paid') {
      toast.info('Payment is already marked as paid');
      setOpenRowMenuId(null);
      return;
    }

    setSyncingPayment(payment._id);
    try {
      const response = await fetch('/api/payment-links/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentLinkId: payment._id }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.razorpayStatus === 'paid') {
          toast.success('Payment found! Status updated to PAID');
        } else {
          toast.info(`Payment status: ${data.razorpayStatus || data.message}`);
        }
        fetchPaymentLinks();
      } else {
        toast.error(data.error || 'Failed to sync payment status');
      }
    } catch (error) {
      console.error('Error syncing payment status:', error);
      toast.error('Failed to sync payment status');
    } finally {
      setSyncingPayment(null);
    }
    setOpenRowMenuId(null);
  };

  const sendReminder = async (payment: PaymentItem) => {
    const linkedPurchase = findLinkedPurchaseByPaymentLinkId(payment._id);
    const resolvedStatus = resolveDisplayStatus(payment, linkedPurchase);

    if (resolvedStatus === 'paid') {
      toast.error('Cannot send reminder for paid payment');
      setOpenRowMenuId(null);
      return;
    }

    if (resolvedStatus === 'expired' || resolvedStatus === 'cancelled') {
      toast.error(`Cannot send reminder for ${resolvedStatus} payment`);
      setOpenRowMenuId(null);
      return;
    }

    setSendingReminder(true);
    try {
      const response = await fetch('/api/payment-links/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentLinkId: payment._id }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Reminder sent to ${data.sentTo}`);
      } else {
        toast.error(data.error || 'Failed to send reminder');
      }
    } catch (error) {
      console.error('Error sending reminder:', error);
      toast.error('Failed to send reminder');
    } finally {
      setSendingReminder(false);
    }
    setOpenRowMenuId(null);
  };

  const isPaidLikeStatus = (status?: string) => {
    const normalized = (status || '').toLowerCase();
    return normalized === 'paid' || normalized === 'completed' || normalized === 'active';
  };

  const resolveDisplayStatus = (payment: PaymentItem, linkedPurchase?: any): ResolvedPaymentStatus => {
    const resolved = resolvePaymentStatus({
      status: payment.status,
      paymentStatus: linkedPurchase?.paymentStatus || linkedPurchase?.status,
      paidAt: payment.paidAt || linkedPurchase?.paidAt || null,
      expiryDate: payment.expireDate || null,
    });

    if (
      resolved === 'pending' &&
      (
        isPaidLikeStatus(payment.status) ||
        isPaidLikeStatus(linkedPurchase?.paymentStatus) ||
        isPaidLikeStatus(linkedPurchase?.status)
      )
    ) {
      return 'paid';
    }

    return resolved;
  };

  const getStatusBadge = (status?: string) => {
    const statusLower = status?.toLowerCase() || '';
    switch (statusLower) {
      case 'paid':
      case 'completed':
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'pending':
      case 'created':
        return 'bg-yellow-100 text-yellow-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCustomerName = (payment: PaymentItem): string => {
    if (payment.client) {
      return `${payment.client.firstName || ''} ${payment.client.lastName || ''}`.trim() || '—';
    }
    return '—';
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payments</CardTitle>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => fetchPaymentLinks()} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>

          <Button onClick={() => setShowModal(true)}>
            <Plus size={14} /> Generate Link
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading || loadingPurchases ? (
          <TableSkeleton rows={6} columns={5} />
        ) : (() => {
          // Combine payment links and imported purchases (without payment links) into unified view
          const importedPurchases = clientPurchases.filter(purchase => {
            if (!purchase.paymentLink) return true;
            const linkId = toIdString(purchase.paymentLink);
            return !paymentsState.some(p => toIdString(p._id) === linkId);
          });

          // Convert imported purchases to PaymentItem format for unified display
          const convertedImports: PaymentItem[] = importedPurchases.map(purchase => ({
            _id: purchase._id,
            amount: purchase.amount || 0,
            finalAmount: purchase.finalAmount || purchase.amount || 0,
            tax: purchase.tax,
            discount: purchase.discount,
            planCategory: purchase.planCategory,
            planName: purchase.planName,
            catalogue: purchase.catalogue,
            duration: purchase.durationLabel || (purchase.durationDays ? `${purchase.durationDays} Days` : undefined),
            durationDays: purchase.durationDays,
            createdAt: purchase.purchaseDate || purchase.createdAt,
            status: purchase.status || purchase.paymentStatus || 'paid',
            paidAt: purchase.paidAt || purchase.purchaseDate,
            transactionId: purchase.transactionId,
            razorpayPaymentId: purchase.razorpayPaymentId,
            notes: purchase.notes,
            client: purchase.client,
            dietitian: purchase.dietitian,
            // Mark as imported purchase (no Razorpay link)
            _isImportedPurchase: true,
            _purchaseData: purchase, // Keep original purchase data for actions
          } as PaymentItem & { _isImportedPurchase?: boolean; _purchaseData?: any }));

          const allPayments = [...paymentsState, ...convertedImports].sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          if (allPayments.length === 0) {
            return <div className="py-6 text-center text-sm text-gray-600">No payments yet.</div>;
          }

          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50">
                  <tr className="text-left">
                    {visibleColumns.created && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Created</th>}
                    {visibleColumns.customerName && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Customer</th>}
                    {visibleColumns.phone && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Phone</th>}
                    {visibleColumns.email && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Email</th>}
                    {visibleColumns.catalogue && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Catalogue</th>}
                    {visibleColumns.duration && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Duration</th>}
                    {visibleColumns.expireDate && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Expire</th>}
                    {visibleColumns.plan && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Plan</th>}
                    {visibleColumns.amount && <th className="p-3 font-medium text-gray-700 whitespace-nowrap text-right">Amount</th>}
                    {visibleColumns.final && <th className="p-3 font-medium text-gray-700 whitespace-nowrap text-right">Final</th>}
                    {visibleColumns.status && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Status</th>}
                    {visibleColumns.transactionId && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Transaction ID</th>}
                    {visibleColumns.expectedDates && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Expected Dates</th>}
                    {visibleColumns.link && <th className="p-3 font-medium text-gray-700 whitespace-nowrap">Link</th>}
                    <th className="p-3 font-medium text-gray-700 whitespace-nowrap text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allPayments.map((p) => {
                    const isImported = (p as any)._isImportedPurchase;
                    const purchaseData = (p as any)._purchaseData;
                    const linkedPurchase = isImported
                      ? purchaseData
                      : findLinkedPurchaseByPaymentLinkId(p._id);
                    const resolvedStatus = resolveDisplayStatus(p, linkedPurchase);

                    return (
                      <tr key={p._id} className="border-t hover:bg-gray-50">
                        {visibleColumns.created && (
                          <td className="p-3 whitespace-nowrap">
                            {formatDate ? formatDate(p.createdAt) : formatDateIST(p.createdAt)}
                            {isImported && (
                              <span className="ml-1 text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">Import</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.customerName && (
                          <td className="p-3 whitespace-nowrap font-medium">{getCustomerName(p)}</td>
                        )}
                        {visibleColumns.phone && (
                          <td className="p-3 whitespace-nowrap">{p.client?.phone || "—"}</td>
                        )}
                        {visibleColumns.email && (
                          <td className="p-3">{p.client?.email || "—"}</td>
                        )}
                        {visibleColumns.catalogue && (
                          <td className="p-3 whitespace-nowrap">{p.catalogue || "—"}</td>
                        )}
                        {visibleColumns.duration && (
                          <td className="p-3 whitespace-nowrap">{p.duration || "—"}</td>
                        )}
                        {visibleColumns.expireDate && (
                          <td className="p-3 whitespace-nowrap">
                            {p.expireDate ? (formatDate ? formatDate(p.expireDate) : formatDateIST(p.expireDate)) : "—"}
                          </td>
                        )}
                        {visibleColumns.plan && (
                          <td className="p-3">
                            <div className="font-medium">{p.planName || "—"}</div>
                            {p.planCategory && <div className="text-xs text-gray-500">{p.planCategory}</div>}
                          </td>
                        )}
                        {visibleColumns.amount && (
                          <td className="p-3 whitespace-nowrap text-right">₹{p.amount?.toLocaleString()}</td>
                        )}
                        {visibleColumns.final && (
                          <td className="p-3 whitespace-nowrap text-right font-semibold text-blue-600">₹{p.finalAmount?.toLocaleString()}</td>
                        )}
                        {visibleColumns.status && (
                          <td className="p-3 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full capitalize ${getStatusBadge(resolvedStatus)}`}>
                              {resolvedStatus || "—"}
                            </span>
                          </td>
                        )}
                        {visibleColumns.transactionId && (
                          <td className="p-3">
                            <span className="text-xs font-mono text-gray-700 break-all max-w-44 block">
                              {isImported
                                ? (purchaseData?.transactionId || purchaseData?.razorpayPaymentId || "—")
                                : getTransactionIdForPayment(p)
                              }
                            </span>
                          </td>
                        )}
                        {visibleColumns.expectedDates && (
                          <td className="p-3 whitespace-nowrap">
                            {(() => {
                              const purchase = linkedPurchase;

                              // Show expected dates for paid-like statuses and linked paid purchases.
                              const paymentIsPaid = resolvedStatus === 'paid';

                              if (!paymentIsPaid) {
                                return "—";
                              }

                              if (purchase?.expectedStartDate) {
                                const startDate = new Date(purchase.expectedStartDate);
                                const endDate = purchase.expectedEndDate ? new Date(purchase.expectedEndDate) : null;
                                return (
                                  <div className="text-xs">
                                    <div className="text-green-600 font-medium">
                                      {startDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}
                                      {endDate && ` - ${endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}`}
                                    </div>
                                  </div>
                                );
                              }

                              if (canEditExpectedDates) {
                                return (
                                  <button
                                    type="button"
                                    className="text-xs text-orange-600 hover:text-orange-700 hover:underline"
                                    onClick={() => {
                                      if (isImported && purchaseData) {
                                        openExpectedDatesModal(purchaseData);
                                      } else {
                                        openExpectedDatesModalForPayment(p);
                                      }
                                    }}
                                  >
                                    Not set
                                  </button>
                                );
                              }

                              return <span className="text-xs text-orange-500">Not set</span>;
                            })()}
                          </td>
                        )}
                        {visibleColumns.link && (
                          <td className="p-3 whitespace-nowrap">
                            {isImported ? (
                              <span className="text-xs text-gray-400">Direct Import</span>
                            ) : getPaymentLink(p) ? (
                              <button
                                className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                onClick={() => window.open(getPaymentLink(p), "_blank")}
                              >
                                <ExternalLink className="h-3 w-3" />
                                Open
                              </button>
                            ) : "—"}
                          </td>
                        )}
                        <td className="p-3 text-center">
                          <button
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const dropdownHeight = 280;
                              const spaceBelow = window.innerHeight - rect.bottom;
                              const spaceAbove = rect.top;

                              let top = rect.bottom + 4;
                              if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
                                top = rect.top - dropdownHeight - 4;
                              }

                              let left = rect.left - 150;
                              if (left < 10) left = 10;

                              setDropdownPosition({ top, left });
                              setOpenRowMenuId(openRowMenuId === p._id ? null : p._id);
                            }}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                          >
                            <MoreVertical className="h-4 w-4 text-gray-600" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
      </CardContent>

      {/* Action Dropdown - Fixed position portal */}
      {openRowMenuId && dropdownPosition && (
        <>
          <div
            className="fixed inset-0 z-9998"
            onClick={() => setOpenRowMenuId(null)}
          />
          <div
            className="fixed w-52 bg-white rounded-lg shadow-2xl border border-gray-200 py-1 z-9999"
            style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
          >
            {(() => {
              // Check if this is a payment link or an imported purchase
              const payment = paymentsState.find(p => p._id === openRowMenuId);
              const importedPurchase = clientPurchases.find(p =>
                toIdString(p._id) === toIdString(openRowMenuId) &&
                (!p.paymentLink || !paymentsState.some(pl => toIdString(pl._id) === toIdString(p.paymentLink)))
              );

              const isImported = !payment && importedPurchase;
              const activeItem = payment || (importedPurchase ? {
                _id: importedPurchase._id,
                status: importedPurchase.status || importedPurchase.paymentStatus || 'paid',
                amount: importedPurchase.amount,
                finalAmount: importedPurchase.finalAmount || importedPurchase.amount,
              } : null);

              if (!activeItem) return null;

              const linkedPurchase = isImported
                ? importedPurchase
                : findLinkedPurchaseByPaymentLinkId(payment?._id);

              const resolvedStatus = resolveDisplayStatus(activeItem as PaymentItem, linkedPurchase);
              const isPaid = resolvedStatus === 'paid';
              const isPending = resolvedStatus === 'pending';

              return (
                <>

                  {/* Only show payment link options if NOT imported and NOT paid */}
                  {!isImported && !isPaid && (
                    <>
                      <button
                        onClick={() => viewPayment(payment!)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open Payment Link
                      </button>
                      <button
                        onClick={() => copyLink(payment!)}
                        className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <Copy className="h-4 w-4" />
                        Copy Link
                      </button>

                      <div className="border-t border-gray-100 my-1"></div>
                    </>
                  )}

                  {/* Invoice options - available for both payment links and imported purchases */}
                  <button
                    onClick={() => {
                      if (isImported && importedPurchase) {
                        // Direct invoice for imported purchase
                        window.open(`/api/invoices/${importedPurchase._id}`, '_blank');
                        setOpenRowMenuId(null);
                      } else {
                        generateInvoice(payment!);
                      }
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Printer className="h-4 w-4" />
                    View/Print Invoice
                  </button>

                  {isPaid && canEmailInvoice && (
                    <button
                      onClick={async () => {
                        if (isImported && importedPurchase) {
                          // Send invoice email for imported purchase
                          try {
                            const response = await fetch(`/api/invoices/${importedPurchase._id}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                            });
                            const data = await response.json();
                            if (data.success) {
                              toast.success(`Invoice sent to ${data.sentTo}`);
                            } else {
                              toast.error(data.error || 'Failed to send invoice');
                            }
                          } catch (error) {
                            console.error('Error sending invoice:', error);
                            toast.error('Failed to send invoice');
                          }
                          setOpenRowMenuId(null);
                        } else {
                          sendInvoiceEmail(payment!);
                        }
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Mail className="h-4 w-4" />
                      Email Invoice
                    </button>
                  )}

                  {/* Set Expected Dates - only for paid payments */}
                  {isPaid && (() => {
                    // For imported purchases, use the purchase directly; for payment links, use linked purchase
                    const purchase = linkedPurchase;
                    const hasExpectedDates = purchase?.expectedStartDate && purchase?.expectedEndDate;

                    // If dates are already set, only admin and dietitian can edit
                    if (hasExpectedDates && !canEditExpectedDates) {
                      return (
                        <div className="w-full px-4 py-2 text-left text-sm text-gray-400 flex items-center gap-2 cursor-not-allowed">
                          <Calendar className="h-4 w-4" />
                          <span>Expected dates set (Admin/Dietitian only)</span>
                        </div>
                      );
                    }

                    return (
                      <button
                        onClick={() => {
                          if (isImported && importedPurchase) {
                            // For imported purchases, directly open with the purchase
                            setOpenRowMenuId(null);
                            openExpectedDatesModal(importedPurchase);
                          } else {
                            openExpectedDatesModalForPayment(payment!);
                          }
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2"
                      >
                        <Calendar className="h-4 w-4" />
                        {hasExpectedDates ? 'Edit Expected Dates' : 'Set Expected Dates'}
                      </button>
                    );
                  })()}

                  {/* Pending payment link options - NOT for imported purchases */}
                  {!isImported && isPending && (
                    <button
                      onClick={() => sendReminder(payment!)}
                      disabled={sendingReminder}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
                    >
                      {sendingReminder ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Bell className="h-4 w-4" />
                      )}
                      Send Reminder Email
                    </button>
                  )}

                  {/* Sync Status - for pending/created payment links only, NOT imported */}
                  {!isImported && isPending && (
                    <button
                      onClick={() => syncPaymentStatus(payment!)}
                      disabled={syncingPayment === payment!._id}
                      className="w-full px-4 py-2 text-left text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2 disabled:opacity-50"
                    >
                      {syncingPayment === payment!._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      Sync from Razorpay
                    </button>
                  )}

                  <div className="border-t border-gray-100 my-1"></div>

                  <button
                    onClick={() => refreshPayment()}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </button>

                  {/* Cancel options - for payment links only, NOT imported */}
                  {!isImported && !isPaid && (
                    <>
                      <div className="border-t border-gray-100 my-1"></div>
                      <button
                        onClick={() => openOtherPaymentModal(payment!)}
                        className="w-full px-4 py-2 text-left text-sm text-purple-600 hover:bg-purple-50 flex items-center gap-2"
                      >
                        <Wallet className="h-4 w-4" />
                        Add Other Platform Payment
                      </button>
                      <button
                        onClick={() => deletePayment(openRowMenuId)}
                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Cancel Payment
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Generate Payment Link</h2>

            {/* Client info display */}
            {client && (
              <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">Generating payment link for:</p>
                <p className="font-medium">{client.firstName} {client.lastName}</p>
                {client.email && <p className="text-sm text-gray-600">{client.email}</p>}
                {client.phone && <p className="text-sm text-gray-600">{client.phone}</p>}
              </div>
            )}

            {loadingPlans ? (
              <div className="flex items-center gap-2 mb-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-gray-500">Loading plans...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Plan Category Dropdown */}
                <div>
                  <label className="text-xs font-medium text-gray-700">Plan Category *</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategorySelect(e.target.value)}
                    className="w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">-- Select Category --</option>
                    {getUniqueCategories().map((category) => (
                      <option key={category} value={category}>
                        {category.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Plan Name Dropdown */}
                <div>
                  <label className="text-xs font-medium text-gray-700">Plan Name *</label>
                  <select
                    value={selectedServicePlan?._id || ""}
                    onChange={(e) => handleServicePlanSelect(e.target.value)}
                    disabled={!selectedCategory}
                    className="w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">{selectedCategory ? '-- Select Plan --' : 'Select category first'}</option>
                    {getPlansForCategory().map((plan) => (
                      <option key={plan._id} value={plan._id}>
                        {plan.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Duration Dropdown */}
                <div>
                  <label className="text-xs font-medium text-gray-700">Duration *</label>
                  <select
                    value={selectedPricingTier?._id || ""}
                    onChange={(e) => handlePricingTierSelect(e.target.value)}
                    disabled={!selectedServicePlan}
                    className="w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">{selectedServicePlan ? '-- Select Duration --' : 'Select plan first'}</option>
                    {selectedServicePlan?.pricingTiers
                      .filter(tier => tier.isActive)
                      .map((tier) => (
                        <option key={tier._id} value={tier._id}>
                          {tier.durationLabel} ({tier.durationDays} days) - ₹{tier.amount.toLocaleString()}
                        </option>
                      ))}
                  </select>
                  {selectedPricingTier && (
                    <p className="text-xs text-gray-500 mt-1">{selectedPricingTier.durationDays} days plan</p>
                  )}
                </div>

                {/* Link Expire Date - Required */}
                <div>
                  <label className="text-xs font-medium text-gray-700">Link Expire Date *</label>
                  <input
                    type="date"
                    value={expireDate}
                    onChange={(e) => setExpireDate(e.target.value)}
                    className="w-full border p-2 rounded-lg mt-1"
                    required
                    min={(() => {
                      const tomorrow = new Date();
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      return tomorrow.toISOString().split('T')[0];
                    })()}
                  />
                </div>

                {/* Base Amount */}
                <div>
                  <label className="text-xs font-medium text-gray-700">Base Amount *</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">₹</span>
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      placeholder="Auto-filled from plan"
                      className="w-full border p-2 pl-8 rounded-lg bg-gray-50"
                      readOnly={!!selectedPricingTier}
                    />
                  </div>
                  {selectedPricingTier && (
                    <p className="text-xs text-green-600 mt-1">✓ Auto-filled from selected plan</p>
                  )}
                </div>

                {/* Tax */}
                <div>
                  <label className="text-xs font-medium text-gray-700">Tax %</label>
                  <input
                    type="number"
                    min="0"
                    value={tax}
                    onChange={(e) => setTax(Number(e.target.value))}
                    className="w-full border p-2 rounded-lg mt-1"
                    placeholder="Enter tax percentage"
                  />
                </div>

                {/* Discount */}
                <div>
                  <label className="text-xs font-medium text-gray-700">
                    Discount % <span className="text-gray-400">(Max {maxDiscount}%)</span>
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={discount}
                    onChange={(e) => handleDiscountChange(e.target.value)}
                    onBlur={handleDiscountBlur}
                    className="w-full border p-2 rounded-lg mt-1"
                    placeholder={`Max ${maxDiscount}%`}
                  />
                </div>

                {/* Final Amount */}
                <div>
                  <label className="text-xs font-medium text-gray-700">Final Amount (Editable)</label>
                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600 font-semibold">₹</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={finalAmount}
                      onChange={(e) => handleFinalAmountChange(e.target.value)}
                      onBlur={handleFinalAmountBlur}
                      className="w-full border border-green-300 p-2 pl-8 rounded-lg bg-green-50 font-bold text-green-700 text-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      placeholder="Enter final amount"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Edit to auto-calculate discount %</p>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-700">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    className="w-full border p-2 rounded-lg mt-1"
                    rows={2}
                  />
                </div>

                {/* Show to Client */}
                <div className="md:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showToClient}
                      onChange={(e) => setShowToClient(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Show this payment to client</span>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={resetModal} disabled={creating}>
                Cancel
              </Button>
              <Button
                onClick={generateLink}
                disabled={creating || !selectedServicePlan || !selectedPricingTier}
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  'Generate Link'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Other Platform Payment Modal */}
      {showOtherPaymentModal && selectedPaymentForOther && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Wallet className="h-5 w-5 text-purple-600" />
              Other Platform Payment
            </h2>

            {/* Plan Details - Locked */}
            <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-100">
              <p className="text-sm font-medium text-purple-800 mb-2">Plan Details (Locked)</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Plan:</span>
                  <p className="font-medium">{selectedPaymentForOther.planName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Category:</span>
                  <p className="font-medium">{selectedPaymentForOther.planCategory || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Duration:</span>
                  <p className="font-medium">{selectedPaymentForOther.duration || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Amount:</span>
                  <p className="font-bold text-lg text-purple-700">₹{selectedPaymentForOther.finalAmount?.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Payment Platform */}
              <div>
                <label className="text-sm font-medium text-gray-700">Payment Platform *</label>
                <select
                  value={otherPaymentPlatform}
                  onChange={(e) => setOtherPaymentPlatform(e.target.value)}
                  className="w-full border rounded-lg p-2.5 mt-1 focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="">-- Select Platform --</option>
                  {platformOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Custom Platform Name */}
              {otherPaymentPlatform === 'other' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Platform Name *</label>
                  <input
                    type="text"
                    value={otherPaymentCustomPlatform}
                    onChange={(e) => setOtherPaymentCustomPlatform(e.target.value)}
                    placeholder="Enter platform name"
                    className="w-full border rounded-lg p-2.5 mt-1"
                  />
                </div>
              )}

              {/* Transaction ID */}
              <div>
                <label className="text-sm font-medium text-gray-700">Transaction ID / Reference Number *</label>
                <input
                  type="text"
                  value={otherPaymentTransactionId}
                  onChange={(e) => setOtherPaymentTransactionId(e.target.value)}
                  placeholder="Enter transaction ID"
                  className="w-full border rounded-lg p-2.5 mt-1"
                />
              </div>

              {/* Payment Date */}
              <div>
                <label className="text-sm font-medium text-gray-700">Payment Date *</label>
                <input
                  type="date"
                  value={otherPaymentDate}
                  onChange={(e) => setOtherPaymentDate(e.target.value)}
                  className="w-full border rounded-lg p-2.5 mt-1"
                />
              </div>

              {/* Receipt Image */}
              <div>
                <label className="text-sm font-medium text-gray-700">Receipt / Screenshot</label>
                <div className="mt-1">
                  <label className="flex items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                    {otherPaymentReceipt ? (
                      <div className="text-center">
                        <p className="text-sm font-medium text-green-600">✓ File selected</p>
                        <p className="text-xs text-gray-500 mt-1">{otherPaymentReceipt.name}</p>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); setOtherPaymentReceipt(null); }}
                          className="text-xs text-red-500 hover:underline mt-2"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Upload className="h-8 w-8 mx-auto text-gray-400" />
                        <p className="text-sm text-gray-500 mt-2">Click to upload receipt</p>
                        <p className="text-xs text-gray-400">PNG, JPG up to 5MB</p>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => setOtherPaymentReceipt(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-gray-700">Notes (Optional)</label>
                <textarea
                  value={otherPaymentNotes}
                  onChange={(e) => setOtherPaymentNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  className="w-full border rounded-lg p-2.5 mt-1"
                  rows={2}
                />
              </div>
            </div>

            <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> This payment will be submitted for admin approval. Once verified, your plan will be activated.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={resetOtherPaymentModal} disabled={submittingOtherPayment}>
                Cancel
              </Button>
              <Button
                onClick={submitOtherPlatformPayment}
                disabled={submittingOtherPayment}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {submittingOtherPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  'Submit for Approval'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Other Platform Payments Table */}
      {otherPlatformPayments.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-5 w-5 text-purple-600" />
              Other Platform Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-medium text-gray-700">Plan Name</th>
                    <th className="text-left p-3 font-medium text-gray-700">Platform</th>
                    <th className="text-left p-3 font-medium text-gray-700">Amount</th>
                    <th className="text-left p-3 font-medium text-gray-700">Transaction ID</th>
                    <th className="text-left p-3 font-medium text-gray-700">Date</th>
                    <th className="text-left p-3 font-medium text-gray-700">Status</th>
                    <th className="text-left p-3 font-medium text-gray-700">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {otherPlatformPayments.map((payment) => (
                    <tr key={payment._id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium">{payment.planName || 'N/A'}</div>
                        {payment.durationLabel && (
                          <div className="text-xs text-gray-500">{payment.durationLabel}</div>
                        )}
                      </td>
                      <td className="p-3">
                        {payment.platform === 'other'
                          ? payment.customPlatform
                          : platformOptions.find(p => p.value === payment.platform)?.label || payment.platform}
                      </td>
                      <td className="p-3 font-medium">₹{payment.amount?.toLocaleString()}</td>
                      <td className="p-3">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">{payment.transactionId}</code>
                      </td>
                      <td className="p-3 text-gray-600">
                        {formatDateIST(payment.paymentDate || payment.createdAt)}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-1 rounded-full capitalize ${payment.status === 'approved' ? 'bg-green-100 text-green-800' :
                          payment.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                          {payment.status}
                        </span>
                        {payment.status === 'rejected' && payment.reviewNotes && (
                          <div className="text-xs text-red-600 mt-1">{payment.reviewNotes}</div>
                        )}
                      </td>
                      <td className="p-3">
                        {payment.receiptImageUrl ? (
                          <button
                            onClick={() => openReceiptLightbox(payment.receiptImageUrl)}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">No receipt</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expected Dates Modal */}
      {showExpectedDatesModal && selectedPurchaseForDates && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Set Expected Dates
              {isDietitian && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-2">Dietitian Only</span>
              )}
            </h2>

            {/* Validation Error Display */}
            {expectedDateError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  {expectedDateError}
                </p>
              </div>
            )}

            {/* Role Access Check */}
            {!isDietitian && !isAdmin && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-700">
                  ⚠️ Only admins and dietitians have permission to modify expected dates. You can view but not edit.
                </p>
              </div>
            )}

            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="font-medium">{selectedPurchaseForDates.planName}</p>
              <p className="text-sm text-gray-500">Total Duration: {selectedPurchaseForDates.durationLabel || `${selectedPurchaseForDates.durationDays} Days`}</p>
              <p className="text-sm text-gray-500">Remaining Days: {selectedPurchaseForDates.remainingDays}</p>

              {/* Show plan phases if divided */}
              {selectedPurchaseForDates.daysUsed > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs font-medium text-blue-600 mb-1">Plan Phases:</p>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>Phase 1 (Completed):</span>
                      <span className="font-medium">{selectedPurchaseForDates.daysUsed} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Phase 2 (Remaining):</span>
                      <span className="font-medium text-green-600">{selectedPurchaseForDates.remainingDays} days</span>
                    </div>
                  </div>
                </div>
              )}



              {/* Show existing dates if set */}
              {(selectedPurchaseForDates.expectedStartDate || selectedPurchaseForDates.expectedEndDate) && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs font-medium text-amber-600 mb-1">Current Expected Dates:</p>
                  <div className="text-xs text-gray-600 space-y-1">
                    {selectedPurchaseForDates.expectedStartDate && (
                      <div className="flex justify-between">
                        <span>Start:</span>
                        <span className="font-medium">{new Date(selectedPurchaseForDates.expectedStartDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
                      </div>
                    )}
                    {selectedPurchaseForDates.expectedEndDate && (
                      <div className="flex justify-between">
                        <span>End:</span>
                        <span className="font-medium">{new Date(selectedPurchaseForDates.expectedEndDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Expected Start Date *</label>
                <input
                  type="date"
                  value={expectedStartDateInput}
                  onChange={(e) => {
                    const nextStartDate = e.target.value;
                    const shouldAutoFillEndDate = !expectedEndDateInput;
                    setExpectedStartDateInput(e.target.value);
                    // Keep a smart default for end date, but allow manual overrides.
                    if (nextStartDate && selectedPurchaseForDates?.durationDays && shouldAutoFillEndDate) {
                      const start = new Date(nextStartDate);
                      const end = new Date(start);
                      end.setDate(start.getDate() + selectedPurchaseForDates.durationDays - 1);
                      setExpectedEndDateInput(end.toISOString().split('T')[0]);
                    } else if (!nextStartDate) {
                      setExpectedEndDateInput('');
                    }
                    setExpectedDateError(null); // Clear error on change
                  }}
                  min={isAdmin ? undefined : (() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    return tomorrow.toISOString().split('T')[0];
                  })()}
                  disabled={!isDietitian && !isAdmin}
                  className={`w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-blue-500 ${(!isDietitian && !isAdmin) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {isAdmin
                    ? 'Admins can set historical or future expected start dates.'
                    : 'When the client is expected to start the meal plan (must be a future date)'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Expected End Date *</label>
                <input
                  type="date"
                  value={expectedEndDateInput}
                  onChange={(e) => {
                    setExpectedEndDateInput(e.target.value);
                    setExpectedDateError(null); // Clear error on change
                  }}
                  min={isAdmin ? undefined : (expectedStartDateInput || (() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    return tomorrow.toISOString().split('T')[0];
                  })())}
                  disabled={!isDietitian && !isAdmin}
                  className={`w-full border rounded-lg p-2 mt-1 focus:ring-2 focus:ring-blue-500 ${(!isDietitian && !isAdmin) ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                />
                <p className="text-xs text-green-600 mt-1">Set the expected completion date for this purchase.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button
                onClick={resetExpectedDatesModal}
                variant="outline"
                disabled={savingExpectedDates}
              >
                Cancel
              </Button>
              <Button
                onClick={saveExpectedDates}
                disabled={savingExpectedDates || !expectedStartDateInput || !expectedEndDateInput || (!isDietitian && !isAdmin)}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                title={(!isDietitian && !isAdmin) ? 'Only dietitians and admins can save expected dates' : ''}
              >
                {savingExpectedDates ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Expected Dates'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Image Lightbox */}
      <ImageLightbox
        isOpen={receiptLightboxOpen}
        onClose={() => setReceiptLightboxOpen(false)}
        src={receiptLightboxImage}
        alt="Payment receipt"
      />
    </Card>
  );
}
