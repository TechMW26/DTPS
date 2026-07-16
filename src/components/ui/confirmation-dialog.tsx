"use client"

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle, Info, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive' | 'success' | 'warning'
  onConfirm: () => void
  onCancel?: () => void
  loading?: boolean
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false
}: ConfirmationDialogProps) {
  const handleCancel = () => {
    if (onCancel) {
      onCancel()
    } else {
      onOpenChange(false)
    }
  }

  const handleConfirm = () => {
    onConfirm()
  }

  const getIcon = () => {
    switch (variant) {
      case 'destructive':
        return <XCircle className="h-6 w-6 text-red-500" />
      case 'success':
        return <CheckCircle className="h-6 w-6 text-green-500" />
      case 'warning':
        return <AlertTriangle className="h-6 w-6 text-yellow-500" />
      default:
        return <Info className="h-6 w-6 text-blue-500" />
    }
  }

  const getButtonVariant = () => {
    switch (variant) {
      case 'destructive':
        return 'destructive'
      case 'success':
        return 'default'
      case 'warning':
        return 'default'
      default:
        return 'default'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center space-x-3">
            {getIcon()}
            <DialogTitle className={cn(
              "text-lg font-semibold",
              variant === 'destructive' && "text-red-900",
              variant === 'success' && "text-green-900",
              variant === 'warning' && "text-yellow-900"
            )}>
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-sm text-gray-600 mt-2">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 space-y-2 space-y-reverse sm:space-y-0">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant={getButtonVariant()}
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              loading && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-white"></div>
                <span>Processing...</span>
              </div>
            ) : (
              confirmText
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Hook for easier usage
export function useConfirmationDialog() {
  const [dialogState, setDialogState] = React.useState<{
    open: boolean
    title: string
    description: string
    confirmText?: string
    cancelText?: string
    variant?: 'default' | 'destructive' | 'success' | 'warning'
    onConfirm: () => void
    onCancel?: () => void
    loading?: boolean
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {}
  })

  const showConfirmation = React.useCallback((config: Omit<typeof dialogState, 'open'>) => {
    setDialogState({
      ...config,
      open: true
    })
  }, [])

  const hideConfirmation = React.useCallback(() => {
    setDialogState(prev => ({ ...prev, open: false }))
  }, [])

  const setLoading = React.useCallback((loading: boolean) => {
    setDialogState(prev => ({ ...prev, loading }))
  }, [])

  const ConfirmationDialogComponent = React.useCallback(() => (
    <ConfirmationDialog
      {...dialogState}
      onOpenChange={hideConfirmation}
    />
  ), [dialogState, hideConfirmation])

  return {
    showConfirmation,
    hideConfirmation,
    setLoading,
    ConfirmationDialog: ConfirmationDialogComponent
  }
}
