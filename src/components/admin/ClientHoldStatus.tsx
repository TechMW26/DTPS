'use client';

import { useEffect, useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    PauseCircle,
    PlayCircle,
    Clock,
    History,
    AlertCircle,
    CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export interface HoldStatus {
    isOnHold: boolean;
    holdDate?: string;
    holdTime?: string;
    activatedDate?: string;
    activatedTime?: string;
    totalHoldDurationMs?: number;
    totalHoldDuration?: string;
    currentHoldDurationMs?: number;
    currentHoldDuration?: string;
    holdCount?: number;
    heldBy?: { firstName?: string; lastName?: string };
    activatedBy?: { firstName?: string; lastName?: string };
    history?: Array<{
        action: 'hold' | 'activate';
        performedByName: string;
        performedByRole: string;
        timestamp: string;
        reason?: string;
        holdDuration?: string;
    }>;
}

interface ClientHoldStatusProps {
    clientId: string;
    clientName: string;
    holdStatus?: HoldStatus;
    onStatusChange?: () => void;
    compact?: boolean;
}

export function ClientHoldStatus({
    clientId,
    clientName,
    holdStatus,
    onStatusChange,
    compact = false
}: ClientHoldStatusProps) {
    const [showHoldDialog, setShowHoldDialog] = useState(false);
    const [showActivateDialog, setShowActivateDialog] = useState(false);
    const [showHistoryDialog, setShowHistoryDialog] = useState(false);
    const [reason, setReason] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [selectedStatus, setSelectedStatus] = useState<'active' | 'hold'>(
        holdStatus?.isOnHold ? 'hold' : 'active'
    );

    const isOnHold = holdStatus?.isOnHold || false;

    // Keep the dropdown selection in sync with the latest hold status so the
    // control reflects real-time changes without requiring a page refresh.
    useEffect(() => {
        setSelectedStatus(holdStatus?.isOnHold ? 'hold' : 'active');
    }, [holdStatus?.isOnHold]);

    const handleStatusSelect = (value: string) => {
        if (value === 'hold' && !isOnHold) {
            setShowHoldDialog(true);
        } else if (value === 'active' && isOnHold) {
            setShowActivateDialog(true);
        }
        setSelectedStatus(value as 'active' | 'hold');
    };

    const handleHold = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/admin/clients/${clientId}/hold`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason.trim() || undefined })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to put client on hold');
            }

            toast.success(`Client "${clientName}" has been put on hold`);
            setReason('');
            setShowHoldDialog(false);
            onStatusChange?.();
        } catch (error: any) {
            toast.error(error.message || 'Failed to put client on hold');
            setSelectedStatus('active');
        } finally {
            setIsLoading(false);
        }
    };

    const handleActivate = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/admin/clients/${clientId}/hold`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason.trim() || undefined })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to activate client');
            }

            const data = await response.json();
            toast.success(`Client "${clientName}" has been activated. Hold duration: ${data.holdDuration}`);
            setReason('');
            setShowActivateDialog(false);
            onStatusChange?.();
        } catch (error: any) {
            toast.error(error.message || 'Failed to activate client');
            setSelectedStatus('hold');
        } finally {
            setIsLoading(false);
        }
    };

    // Status Badge
    const StatusBadge = () => (
        <Badge
            variant={isOnHold ? 'secondary' : 'default'}
            className={isOnHold
                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            }
        >
            {isOnHold ? (
                <>
                    <PauseCircle className="h-3 w-3 mr-1" />
                    On Hold
                </>
            ) : (
                <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                </>
            )}
        </Badge>
    );

    if (compact) {
        return (
            <div className="flex items-center gap-3">
                <Select value={selectedStatus} onValueChange={handleStatusSelect}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue>
                            <StatusBadge />
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="active">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                Unhold
                            </div>
                        </SelectItem>
                        <SelectItem value="hold">
                            <div className="flex items-center gap-2">
                                <PauseCircle className="h-4 w-4 text-yellow-600" />
                                Hold
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>

                {holdStatus?.holdCount && holdStatus.holdCount > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowHistoryDialog(true)}
                        className="text-muted-foreground"
                    >
                        <History className="h-4 w-4 mr-1" />
                        History ({holdStatus.holdCount})
                    </Button>
                )}

                {/* Dialogs */}
                <HoldConfirmDialog
                    open={showHoldDialog}
                    onOpenChange={setShowHoldDialog}
                    clientName={clientName}
                    reason={reason}
                    onReasonChange={setReason}
                    onConfirm={handleHold}
                    isLoading={isLoading}
                />

                <ActivateConfirmDialog
                    open={showActivateDialog}
                    onOpenChange={setShowActivateDialog}
                    clientName={clientName}
                    reason={reason}
                    onReasonChange={setReason}
                    onConfirm={handleActivate}
                    isLoading={isLoading}
                    holdDuration={holdStatus?.currentHoldDuration}
                />

                <HistoryDialog
                    open={showHistoryDialog}
                    onOpenChange={setShowHistoryDialog}
                    history={holdStatus?.history || []}
                    clientName={clientName}
                />
            </div>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <PauseCircle className="h-5 w-5" />
                        Client Status
                    </span>
                    <StatusBadge />
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Status Dropdown */}
                <div>
                    <Label className="text-muted-foreground text-sm">Change Status</Label>
                    <Select value={selectedStatus} onValueChange={handleStatusSelect}>
                        <SelectTrigger className="w-full mt-1">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    Unhold
                                </div>
                            </SelectItem>
                            <SelectItem value="hold">
                                <div className="flex items-center gap-2">
                                    <PauseCircle className="h-4 w-4 text-yellow-600" />
                                    Hold
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Current Status Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                    {isOnHold ? (
                        <>
                            <div>
                                <Label className="text-muted-foreground">Hold Since</Label>
                                <p className="font-medium">
                                    {holdStatus?.holdDate
                                        ? format(new Date(holdStatus.holdDate), 'MMM dd, yyyy')
                                        : '-'}
                                    {holdStatus?.holdTime && ` at ${holdStatus.holdTime}`}
                                </p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Current Duration</Label>
                                <p className="font-medium text-yellow-600">
                                    <Clock className="h-3 w-3 inline mr-1" />
                                    {holdStatus?.currentHoldDuration || '0 minutes'}
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div>
                                <Label className="text-muted-foreground">Last Activated</Label>
                                <p className="font-medium">
                                    {holdStatus?.activatedDate
                                        ? format(new Date(holdStatus.activatedDate), 'MMM dd, yyyy')
                                        : 'Never held'}
                                    {holdStatus?.activatedTime && ` at ${holdStatus.activatedTime}`}
                                </p>
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Total Hold Duration</Label>
                                <p className="font-medium">
                                    {holdStatus?.totalHoldDuration || '0 minutes'}
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Hold Count */}
                <div className="flex items-center justify-between pt-2 border-t">
                    <div>
                        <Label className="text-muted-foreground">Hold Count</Label>
                        <p className="font-medium">{holdStatus?.holdCount || 0} times</p>
                    </div>
                    {holdStatus?.holdCount && holdStatus.holdCount > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowHistoryDialog(true)}
                        >
                            <History className="h-4 w-4 mr-1" />
                            View History
                        </Button>
                    )}
                </div>

                {/* Warning when on hold */}
                {isOnHold && (
                    <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md text-yellow-800 dark:text-yellow-200 text-sm">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="font-medium">Client is on hold</p>
                            <p className="text-xs mt-0.5">Meal plans are hidden from the client. No new plans can be published.</p>
                        </div>
                    </div>
                )}

                {/* Dialogs */}
                <HoldConfirmDialog
                    open={showHoldDialog}
                    onOpenChange={setShowHoldDialog}
                    clientName={clientName}
                    reason={reason}
                    onReasonChange={setReason}
                    onConfirm={handleHold}
                    isLoading={isLoading}
                />

                <ActivateConfirmDialog
                    open={showActivateDialog}
                    onOpenChange={setShowActivateDialog}
                    clientName={clientName}
                    reason={reason}
                    onReasonChange={setReason}
                    onConfirm={handleActivate}
                    isLoading={isLoading}
                    holdDuration={holdStatus?.currentHoldDuration}
                />

                <HistoryDialog
                    open={showHistoryDialog}
                    onOpenChange={setShowHistoryDialog}
                    history={holdStatus?.history || []}
                    clientName={clientName}
                />
            </CardContent>
        </Card>
    );
}

// Hold Confirmation Dialog
function HoldConfirmDialog({
    open,
    onOpenChange,
    clientName,
    reason,
    onReasonChange,
    onConfirm,
    isLoading
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clientName: string;
    reason: string;
    onReasonChange: (reason: string) => void;
    onConfirm: () => void;
    isLoading: boolean;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <PauseCircle className="h-5 w-5 text-yellow-600" />
                        Put Client on Hold?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3 text-muted-foreground text-sm">
                            <span className="block">Are you sure you want to put <strong>{clientName}</strong> on hold?</span>
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md text-yellow-800 dark:text-yellow-200 text-sm">
                                <span className="font-medium mb-1 block">While on hold:</span>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>Meal plans will be hidden from the client</li>
                                    <li>No new meal plans can be published</li>
                                    <li>The client won't receive meal notifications</li>
                                    <li>All data is preserved (nothing is deleted)</li>
                                </ul>
                            </div>
                            <div className="pt-2">
                                <Label htmlFor="hold-reason" className="text-foreground">
                                    Reason (optional)
                                </Label>
                                <Textarea
                                    id="hold-reason"
                                    placeholder="Enter reason for holding this client..."
                                    value={reason}
                                    onChange={(e) => onReasonChange(e.target.value)}
                                    className="mt-1"
                                    rows={2}
                                />
                            </div>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="bg-yellow-600 hover:bg-yellow-700"
                    >
                        {isLoading ? 'Processing...' : 'Yes, Hold Client'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// Activate Confirmation Dialog
function ActivateConfirmDialog({
    open,
    onOpenChange,
    clientName,
    reason,
    onReasonChange,
    onConfirm,
    isLoading,
    holdDuration
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    clientName: string;
    reason: string;
    onReasonChange: (reason: string) => void;
    onConfirm: () => void;
    isLoading: boolean;
    holdDuration?: string;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <PlayCircle className="h-5 w-5 text-green-600" />
                        Activate Client?
                    </AlertDialogTitle>
                    <AlertDialogDescription asChild>
                        <div className="space-y-3 text-muted-foreground text-sm">
                            <span className="block">Are you sure you want to activate <strong>{clientName}</strong>?</span>
                            {holdDuration && (
                                <span className="block text-sm">
                                    <strong>Hold Duration:</strong> {holdDuration}
                                </span>
                            )}
                            <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-md text-green-800 dark:text-green-200 text-sm">
                                <span className="font-medium mb-1 block">Upon activation:</span>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>Meal plans will become visible again</li>
                                    <li>New meal plans can be published</li>
                                    <li>Normal meal notifications will resume</li>
                                    <li>All existing data is preserved</li>
                                </ul>
                            </div>
                            <div className="pt-2">
                                <Label htmlFor="activate-reason" className="text-foreground">
                                    Reason (optional)
                                </Label>
                                <Textarea
                                    id="activate-reason"
                                    placeholder="Enter reason for activating this client..."
                                    value={reason}
                                    onChange={(e) => onReasonChange(e.target.value)}
                                    className="mt-1"
                                    rows={2}
                                />
                            </div>
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="bg-green-600 hover:bg-green-700"
                    >
                        {isLoading ? 'Processing...' : 'Yes, Activate Client'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

// History Dialog
function HistoryDialog({
    open,
    onOpenChange,
    history,
    clientName
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    history: HoldStatus['history'];
    clientName: string;
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Hold Status History
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Complete history of hold/activate actions for {clientName}
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex-1 overflow-y-auto py-4">
                    {!history || history.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">No history available</p>
                    ) : (
                        <div className="space-y-3">
                            {history.slice().reverse().map((entry, index) => (
                                <div
                                    key={index}
                                    className={`p-3 rounded-md border ${entry.action === 'hold'
                                        ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                                        : 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <Badge
                                            variant="secondary"
                                            className={entry.action === 'hold'
                                                ? 'bg-yellow-100 text-yellow-800'
                                                : 'bg-green-100 text-green-800'
                                            }
                                        >
                                            {entry.action === 'hold' ? (
                                                <><PauseCircle className="h-3 w-3 mr-1" /> Put on Hold</>
                                            ) : (
                                                <><PlayCircle className="h-3 w-3 mr-1" /> Activated</>
                                            )}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {format(new Date(entry.timestamp), 'MMM dd, yyyy HH:mm')}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-sm">
                                        <p><strong>By:</strong> {entry.performedByName} ({entry.performedByRole})</p>
                                        {entry.reason && <p><strong>Reason:</strong> {entry.reason}</p>}
                                        {entry.holdDuration && entry.action === 'activate' && (
                                            <p><strong>Hold Duration:</strong> {entry.holdDuration}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <AlertDialogFooter>
                    <AlertDialogAction>Close</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export default ClientHoldStatus;
