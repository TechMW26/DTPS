'use client';

import { useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Ruler, Target, Scale } from 'lucide-react';
import { format } from 'date-fns';

interface MeasurementData {
  type: string;
  value: number;
  unit: string;
  notes?: string;
  recordedAt: Date;
}

interface MeasurementSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  measurement: MeasurementData;
  previousValue?: number;
}

const measurementConfig = {
  waist: { label: 'Waist', icon: Ruler, color: 'from-blue-400 to-cyan-500' },
  abdomen: { label: 'Abdomen', icon: Ruler, color: 'from-orange-400 to-amber-500' },
  chest: { label: 'Chest', icon: Ruler, color: 'from-purple-400 to-pink-500' },
  hips: { label: 'Hips', icon: Ruler, color: 'from-amber-400 to-orange-500' },
  arms: { label: 'Arms', icon: Ruler, color: 'from-green-400 to-emerald-500' },
  thighs: { label: 'Thighs', icon: Ruler, color: 'from-indigo-400 to-purple-500' },
  body_fat: { label: 'Body Fat', icon: Target, color: 'from-rose-400 to-red-500' },
  muscle_mass: { label: 'Muscle Mass', icon: Scale, color: 'from-teal-400 to-cyan-500' },
};

export function MeasurementSummaryModal({
  isOpen,
  onClose,
  measurement,
  previousValue
}: MeasurementSummaryModalProps) {
  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const config = measurementConfig[measurement.type as keyof typeof measurementConfig];
  const Icon = config?.icon || Ruler;
  const change = previousValue ? measurement.value - previousValue : 0;
  const changePercentage = previousValue ? ((change / previousValue) * 100) : 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-hidden"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="relative p-6 pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>

          <div className="text-center">
            <div className={`h-16 w-16 rounded-2xl bg-linear-to-br ${config?.color || 'from-gray-400 to-gray-500'} flex items-center justify-center text-white mx-auto mb-4`}>
              <Icon className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {config?.label || measurement.type} Updated!
            </h2>
            <p className="text-sm text-gray-500">
              {format(measurement.recordedAt, 'MMMM d, yyyy • h:mm a')}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="px-6 pb-6">
          {/* Current Value */}
          <div className="bg-gray-50 rounded-2xl p-6 mb-4">
            <div className="text-center">
              <p className="text-sm text-gray-600 mb-2">Current Measurement</p>
              <div className="flex items-baseline justify-center space-x-2">
                <span className="text-4xl font-bold text-gray-900">
                  {measurement.value}
                </span>
                <span className="text-lg text-gray-500 font-medium">
                  {measurement.unit}
                </span>
              </div>
            </div>
          </div>

          {/* Change Indicator */}
          {previousValue && change !== 0 && (
            <div className="bg-gray-50 rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {change < 0 ? (
                    <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center">
                      <TrendingDown className="h-4 w-4 text-emerald-600" />
                    </div>
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-red-600" />
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {change > 0 ? 'Increased' : 'Decreased'} by
                    </p>
                    <p className="text-xs text-gray-500">Since last measurement</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${change < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {change > 0 ? '+' : ''}{change.toFixed(1)} {measurement.unit}
                  </p>
                  <p className={`text-xs ${change < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {changePercentage > 0 ? '+' : ''}{changePercentage.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {measurement.notes && (
            <div className="bg-blue-50 rounded-2xl p-4 mb-4">
              <p className="text-sm font-medium text-blue-900 mb-1">Notes</p>
              <p className="text-sm text-blue-700">{measurement.notes}</p>
            </div>
          )}

          {/* Previous Value */}
          {previousValue && (
            <div className="flex items-center justify-between text-sm text-gray-500 mb-6">
              <span>Previous measurement</span>
              <span className="font-medium">{previousValue} {measurement.unit}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-linear-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold shadow-lg active:scale-95 transition-transform"
          >
            Continue Tracking
          </button>
        </div>
      </div>
    </div>
  );
}
