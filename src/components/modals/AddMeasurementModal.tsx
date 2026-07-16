'use client';

import { useState, useEffect } from 'react';
import { X, Ruler, Target, Scale } from 'lucide-react';

interface AddMeasurementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (measurement: { type: string; value: number; unit: string; notes?: string }) => void;
}

const measurementTypes = [
  { value: 'waist', label: 'Waist', unit: 'cm', icon: Ruler, color: 'from-blue-400 to-cyan-500' },
  { value: 'abdomen', label: 'Abdomen', unit: 'cm', icon: Ruler, color: 'from-orange-400 to-amber-500' },
  { value: 'chest', label: 'Chest', unit: 'cm', icon: Ruler, color: 'from-purple-400 to-pink-500' },
  { value: 'hips', label: 'Hips', unit: 'cm', icon: Ruler, color: 'from-amber-400 to-orange-500' },
  { value: 'arms', label: 'Arms', unit: 'cm', icon: Ruler, color: 'from-green-400 to-emerald-500' },
  { value: 'thighs', label: 'Thighs', unit: 'cm', icon: Ruler, color: 'from-indigo-400 to-purple-500' },
  { value: 'body_fat', label: 'Body Fat', unit: '%', icon: Target, color: 'from-rose-400 to-red-500' },
  { value: 'muscle_mass', label: 'Muscle Mass', unit: 'kg', icon: Scale, color: 'from-teal-400 to-cyan-500' },
];

export function AddMeasurementModal({ isOpen, onClose, onAdd }: AddMeasurementModalProps) {
  const [selectedType, setSelectedType] = useState('');
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedMeasurement = measurementTypes.find(m => m.value === selectedType);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${window.scrollY}px`;
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !value) return;

    setLoading(true);
    try {
      await onAdd({
        type: selectedType,
        value: parseFloat(value),
        unit: selectedMeasurement?.unit || 'cm',
        notes: notes.trim() || undefined
      });

      // Reset form
      setSelectedType('');
      setValue('');
      setNotes('');
      onClose();
    } catch (error) {
      console.error('Error adding measurement:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-hidden"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden my-auto">
        {/* Header - Sticky */}
        <div className="shrink-0 flex items-center justify-between p-6 border-b border-gray-100 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Add Measurement</h2>
            <p className="text-sm text-gray-500 mt-1">Track your body measurements</p>
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="p-6 space-y-6">
            {/* Measurement Type Selection */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Measurement Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                {measurementTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setSelectedType(type.value)}
                    className={`p-4 rounded-2xl border-2 transition-all transform hover:scale-105 ${selectedType === type.value
                        ? 'border-emerald-500 bg-emerald-50 shadow-lg'
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                      }`}
                  >
                    <div className={`h-12 w-12 rounded-xl bg-linear-to-br ${type.color} flex items-center justify-center text-white mx-auto mb-3 shadow-lg`}>
                      <type.icon className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-bold text-gray-900">{type.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{type.unit}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Value Input */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Value {selectedMeasurement && `(${selectedMeasurement.unit})`}
              </label>
              <input
                type="number"
                step="0.1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`Enter ${selectedMeasurement?.label.toLowerCase() || 'measurement'}`}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                required
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this measurement..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors resize-none"
              />
            </div>
          </div>

          {/* Action Buttons - Sticky Footer */}
          <div className="shrink-0 flex space-x-3 p-6 border-t border-gray-100 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedType || !value || loading}
              className="flex-1 py-3 px-4 bg-linear-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-emerald-600 hover:to-teal-700 transition-all"
            >
              {loading ? 'Adding...' : 'Add Measurement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
