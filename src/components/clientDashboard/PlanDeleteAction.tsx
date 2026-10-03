"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { UserRole } from "@/types";

export function PlanDeleteAction({ role, planName, isDraft = false, compact = false, onDelete }: {
  role?: string;
  planName: string;
  isDraft?: boolean;
  compact?: boolean;
  onDelete: () => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const normalizedRole = role?.trim().toLowerCase();
  const isStaff = [UserRole.DIETITIAN, UserRole.HEALTH_COUNSELOR, "dietician"].includes(normalizedRole || "");
  if (normalizedRole !== UserRole.ADMIN && !(isDraft && isStaff)) return null;

  const confirm = async () => {
    if (pending) return;
    setPending(true);
    try {
      if (await onDelete()) setOpen(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button size={compact ? "sm" : "default"} variant="outline"
        title="Delete plan" aria-label={`Delete plan ${planName}`}
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
        onClick={() => setOpen(true)}>
        <Trash2 className={compact ? "h-4 w-4" : "h-4 w-4 mr-2"} />
        {!compact && "Delete plan"}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => { if (!pending) setOpen(next); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove &quot;{planName}&quot; from this client’s plans? The client will
              no longer see this plan. Its allocated days will be returned to the
              linked program. A record will be kept for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button className="bg-red-600 hover:bg-red-700" onClick={confirm} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {pending ? "Deleting..." : "Delete plan"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
