'use client';

import { useState } from 'react';
import { X, Save, Loader2 } from 'lucide-react';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onWatchClose();
      }}
    >
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 bg-linear-to-r from-[#3AB1A0] to-[#2A9A8B]">
          <h3 className="text-lg font-bold text-white">📝 Manual Entry</h3>
          <button 
            onClick={onWatchClose}
            className="p-2 rounded-full hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Steps */}
          <div className="bg-gray-50 rounded-xl p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              👣 Steps Count
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ❤️ Heart Rate (BPM)
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              😴 Sleep Hours
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🫁 Blood Oxygen (SpO2 %)
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🧠 Stress Level (0-100)
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🌬️ Breathing Rate (breaths/min)
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🏃 Active Minutes
            </label>
            <input
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🔥 Calories Burned
            </label>
            <input
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
            Save Data
          </button>
        </div>
      </div>
    </div>
  );
}

export default WatchManualEntryModal;
