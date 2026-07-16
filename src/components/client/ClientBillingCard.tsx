'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  CreditCard, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  ChevronRight,
  Download,
  IndianRupee
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

type PaymentStatus = 'paid' | 'pending' | 'failed' | 'refunded';

interface BillingCardProps {
  id: string;
  planName: string;
  amount: number;
  currency?: string;
  date: Date;
  dueDate?: Date;
  status: PaymentStatus;
  invoiceUrl?: string;
  onPay?: () => void;
  onDownload?: () => void;
  onViewDetails?: () => void;
  className?: string;
}

export function ClientBillingCard({
  id,
  planName,
  amount,
  currency = 'INR',
  date,
  dueDate,
  status,
  invoiceUrl,
  onPay,
  onDownload,
  onViewDetails,
  className,
}: BillingCardProps) {
  const getStatusBadge = () => {
    switch (status) {
      case 'paid':
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            Paid
          </Badge>
        );
      case 'pending':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case 'failed':
        return (
          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'refunded':
        return (
          <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100">
            Refunded
          </Badge>
        );
    }
  };

  const formatAmount = () => {
    if (currency === 'INR') {
      return `₹${amount.toLocaleString('en-IN')}`;
    }
    return `${currency} ${amount.toLocaleString()}`;
  };

  return (
    <Card className={cn(
      "border-0 shadow-sm transition-all duration-200",
      status === 'pending' && "border-l-4 border-l-yellow-400",
      status === 'failed' && "border-l-4 border-l-red-400",
      className
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "h-10 w-10 rounded-lg flex items-center justify-center",
              status === 'paid' ? "bg-green-100 text-green-600" :
              status === 'pending' ? "bg-yellow-100 text-yellow-600" :
              status === 'failed' ? "bg-red-100 text-red-600" :
              "bg-gray-100 text-gray-600"
            )}>
              <IndianRupee className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">{planName}</p>
              <p className="text-xs text-gray-500">Invoice #{id.slice(-6).toUpperCase()}</p>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* Amount */}
        <div className="flex items-center justify-between mb-3 p-3 bg-gray-50 rounded-lg">
          <div>
            <p className="text-xs text-gray-500">Amount</p>
            <p className="text-xl font-bold text-gray-900">{formatAmount()}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">
              {status === 'paid' ? 'Paid on' : 'Due by'}
            </p>
            <p className="text-sm font-medium text-gray-700">
              {format(status === 'paid' ? date : (dueDate || date), 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {status === 'pending' && onPay && (
            <Button 
              size="sm" 
              onClick={onPay}
              className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700"
            >
              <CreditCard className="h-3 w-3 mr-1" />
              Pay Now
            </Button>
          )}
          {status === 'paid' && onDownload && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onDownload}
              className="flex-1 h-8 text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Download Invoice
            </Button>
          )}
          {onViewDetails && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onViewDetails}
              className="h-8 text-xs"
            >
              Details
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface BillingListProps {
  children: React.ReactNode;
  className?: string;
}

export function ClientBillingList({ children, className }: BillingListProps) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </div>
  );
}

interface BillingSummaryProps {
  totalPaid: number;
  pendingAmount: number;
  nextDueDate?: Date;
  currency?: string;
  className?: string;
}

export function ClientBillingSummary({
  totalPaid,
  pendingAmount,
  nextDueDate,
  currency = 'INR',
  className,
}: BillingSummaryProps) {
  const formatAmount = (amount: number) => {
    if (currency === 'INR') {
      return `₹${amount.toLocaleString('en-IN')}`;
    }
    return `${currency} ${amount.toLocaleString()}`;
  };

  return (
    <div className={cn("grid grid-cols-3 gap-4", className)}>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs text-gray-500 mb-1">Total Paid</p>
          <p className="text-lg font-bold text-green-600">{formatAmount(totalPaid)}</p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs text-gray-500 mb-1">Pending</p>
          <p className="text-lg font-bold text-yellow-600">{formatAmount(pendingAmount)}</p>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <p className="text-xs text-gray-500 mb-1">Next Due</p>
          <p className="text-sm font-bold text-gray-700">
            {nextDueDate ? format(nextDueDate, 'MMM d') : 'N/A'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default ClientBillingCard;
