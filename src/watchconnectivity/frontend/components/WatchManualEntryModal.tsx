'use client';

import { useState } from 'react';
import {
  Activity,
  Brain,
  Droplets,
  Flame,
  Footprints,
  HeartPulse,
  Loader2,
  Moon,
  NotebookText,
  Save,
  Wind,
  X,
} from 'lucide-react';

interface WatchManualEntryModalProps {
  watchIsOpen: boolean;
  onWatchClose: () => void;
  onWatchSave: (data: WatchManualData) => Promise<boolean>;
}

export interface WatchManualData {
  watchSteps?: { count: number; goal: number };
  watchHeartRate?: { current: number };
  watchSleep?: { totalHours: number };
  watchOxygen?: { current: number };
  watchStress?: { current: number; level: string };
  watchBreathing?: { current: number };
  watchActivity?: { activeMinutes: number };
  watchCalories?: { total: number; goal: number };
}

export function WatchManualEntryModal({
  watchIsOpen,
  onWatchClose,
  onWatchSave,
}: WatchManualEntryModalProps) {
  const [watchSaving, setWatchSaving] = useState(false);
  const [watchFormData, setWatchFormData] = useState<WatchManualData>({
    watchSteps: { count: 0, goal: 10000 },
    watchHeartRate: { current: 0 },
    watchSleep: { totalHours: 0 },
    watchOxygen: { current: 0 },
    watchStress: { current: 0, level: 'low' },
    watchBreathing: { current: 0 },
    watchActivity: { activeMinutes: 0 },
    watchCalories: { total: 0, goal: 2000 },
  });

  if (!watchIsOpen) return null;

  const handleWatchSave = async () => {
    setWatchSaving(true);
    try {
      const success = await onWatchSave(watchFormData);
      if (success) {
        onWatchClose();
      }
    } finally {
      setWatchSaving(false);
    }
  };

  const getWatchStressLevel = (value: number): string => {
    if (value < 25) return 'low';
    if (value < 50) return 'moderate';
    if (value < 75) return 'high';
    return 'very_high';
  };

  return (
    <div 
      className="client-popup-above-nav fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onWatchClose();
      }}
    >
      <div className="client-popup-panel flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B]">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <NotebookText aria-hidden="true" className="h-5 w-5" />
            Manual entry
          </h3>
          <button
            onClick={onWatchClose}
            aria-label="Close manual entry"
            className="p-2 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Steps */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label htmlFor="watch-steps" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Footprints aria-hidden="true" className="h-4 w-4" />
              Steps count
            </label>
            <input
              id="watch-steps"
              type="number"
              value={watchFormData.watchSteps?.count || 0}
              onChange={(e) => setWatchFormData({
                ...watchFormData,
                watchSteps: { 
                  count: parseInt(e.target.value) || 0, 
                  goal: watchFormData.watchSteps?.goal || 10000 
                }
              })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
              placeholder="Enter steps count"
            />
          </div>

          {/* Heart Rate */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label htmlFor="watch-heart-rate" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <HeartPulse aria-hidden="true" className="h-4 w-4" />
              Heart rate (bpm)
            </label>
            <input
              id="watch-heart-rate"
              type="number"
              value={watchFormData.watchHeartRate?.current || 0}
              onChange={(e) => setWatchFormData({
                ...watchFormData,
                watchHeartRate: { current: parseInt(e.target.value) || 0 }
              })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
              placeholder="Enter heart rate"
            />
          </div>

          {/* Sleep */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label htmlFor="watch-sleep" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Moon aria-hidden="true" className="h-4 w-4" />
              Sleep hours
            </label>
            <input
              id="watch-sleep"
              type="number"
              step="0.5"
              value={watchFormData.watchSleep?.totalHours || 0}
              onChange={(e) => setWatchFormData({
                ...watchFormData,
                watchSleep: { totalHours: parseFloat(e.target.value) || 0 }
              })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
              placeholder="Enter sleep hours"
            />
          </div>

          {/* SpO2 */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label htmlFor="watch-oxygen" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Droplets aria-hidden="true" className="h-4 w-4" />
              Blood oxygen (SpO2 %)
            </label>
            <input
              id="watch-oxygen"
              type="number"
              min="0"
              max="100"
              value={watchFormData.watchOxygen?.current || 0}
              onChange={(e) => setWatchFormData({
                ...watchFormData,
                watchOxygen: { current: parseInt(e.target.value) || 0 }
              })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
              placeholder="Enter SpO2 percentage"
            />
          </div>

          {/* Stress */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label htmlFor="watch-stress" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Brain aria-hidden="true" className="h-4 w-4" />
              Stress level (0–100)
            </label>
            <input
              id="watch-stress"
              type="range"
              min="0"
              max="100"
              value={watchFormData.watchStress?.current || 0}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                setWatchFormData({
                  ...watchFormData,
                  watchStress: { 
                    current: value,
                    level: getWatchStressLevel(value)
                  }
                });
              }}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Low</span>
              <span className="font-medium">{watchFormData.watchStress?.current || 0}%</span>
              <span>High</span>
            </div>
          </div>

          {/* Breathing */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label htmlFor="watch-breathing" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Wind aria-hidden="true" className="h-4 w-4" />
              Breathing rate (breaths/min)
            </label>
            <input
              id="watch-breathing"
              type="number"
              value={watchFormData.watchBreathing?.current || 0}
              onChange={(e) => setWatchFormData({
                ...watchFormData,
                watchBreathing: { current: parseInt(e.target.value) || 0 }
              })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
              placeholder="Enter breathing rate"
            />
          </div>

          {/* Activity */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label htmlFor="watch-activity" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Activity aria-hidden="true" className="h-4 w-4" />
              Active minutes
            </label>
            <input
              id="watch-activity"
              type="number"
              value={watchFormData.watchActivity?.activeMinutes || 0}
              onChange={(e) => setWatchFormData({
                ...watchFormData,
                watchActivity: { activeMinutes: parseInt(e.target.value) || 0 }
              })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
              placeholder="Enter active minutes"
            />
          </div>

          {/* Calories */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label htmlFor="watch-calories" className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Flame aria-hidden="true" className="h-4 w-4" />
              Calories burned
            </label>
            <input
              id="watch-calories"
              type="number"
              value={watchFormData.watchCalories?.total || 0}
              onChange={(e) => setWatchFormData({
                ...watchFormData,
                watchCalories: { 
                  total: parseInt(e.target.value) || 0,
                  goal: watchFormData.watchCalories?.goal || 2000
                }
              })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0]"
              placeholder="Enter calories burned"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={handleWatchSave}
            disabled={watchSaving}
            className="w-full py-3 bg-[#3AB1A0] text-white rounded-xl font-bold hover:bg-[#2A9A8B] transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {watchSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            Save data
          </button>
        </div>
      </div>
    </div>
  );
}

export default WatchManualEntryModal;
