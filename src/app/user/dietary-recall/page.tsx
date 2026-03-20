"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';
import {
  ArrowLeft,
  Save,
  Clock,
  Utensils,
  Plus,
  Trash2,
  Loader2,
  Sun,
  Coffee,
  Apple,
  Sandwich,
  Moon,
  Sunrise,
  RotateCcw
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';

interface MealEntry {
  mealType: string;
  hour: string;
  minute: string;
  meridian: "AM" | "PM";
  food: string;
}

const DRAFT_KEY = 'dtps-dietary-recall-draft';

const mealTypes = [
  { value: "Early Morning", label: "Early Morning", icon: Sunrise },
  { value: "Breakfast", label: "Breakfast", icon: Coffee },
  { value: "Mid Morning", label: "Mid Morning", icon: Apple },
  { value: "Lunch", label: "Lunch", icon: Sandwich },
  { value: "Mid Evening", label: "Mid Evening", icon: Sun },
  { value: "Evening", label: "Evening", icon: Coffee },
  { value: "Dinner", label: "Dinner", icon: Utensils },
  { value: "Past Dinner", label: "Past Dinner", icon: Moon }
];

const hours = Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

// Helper functions for local storage draft management
const saveDraftToLocalStorage = (meals: MealEntry[], userId: string) => {
  try {
    const draftData = {
      meals,
      userId,
      timestamp: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours expiry
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
  } catch (error) {
    console.error('Error saving draft to localStorage:', error);
  }
};

const loadDraftFromLocalStorage = (userId: string): MealEntry[] | null => {
  try {
    const draftStr = localStorage.getItem(DRAFT_KEY);
    if (!draftStr) return null;

    const draft = JSON.parse(draftStr);

    // Check if draft belongs to current user and hasn't expired
    if (draft.userId !== userId) return null;
    if (draft.expiresAt && Date.now() > draft.expiresAt) {
      localStorage.removeItem(DRAFT_KEY);
      return null;
    }

    return draft.meals;
  } catch (error) {
    console.error('Error loading draft from localStorage:', error);
    return null;
  }
};

const clearDraftFromLocalStorage = () => {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    console.error('Error clearing draft from localStorage:', error);
  }
};

export default function DietaryRecallPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/client-auth/signin");
    }
  }, [status, router]);

  // Auto-save to draft when meals change (debounced)
  useEffect(() => {
    if (!session?.user?.id || loading || !draftRestored) return;

    // Check if any meals have content
    const hasContent = meals.some(m => m.food.trim() !== '' || m.hour !== '' || m.minute !== '');
    if (!hasContent) return;

    const timeoutId = setTimeout(() => {
      saveDraftToLocalStorage(meals, session.user.id);
      setHasDraft(true);
    }, 1000); // Debounce 1 second

    return () => clearTimeout(timeoutId);
  }, [meals, session?.user?.id, loading, draftRestored]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        // First, check for local draft
        if (session?.user?.id) {
          const draftMeals = loadDraftFromLocalStorage(session.user.id);
          if (draftMeals && draftMeals.length > 0) {
            // Check if draft has meaningful content
            const draftHasContent = draftMeals.some(m => m.food.trim() !== '');
            if (draftHasContent) {
              setMeals(draftMeals);
              setHasDraft(true);
              setDraftRestored(true);
              setLoading(false);
              toast.info('Restored your unsaved draft', { duration: 3000 });
              return;
            }
          }
        }

        // If no draft, fetch from server
        const res = await fetch("/api/client/dietary-recall", { cache: 'no-store' });
        if (res.ok) {
          const result = await res.json();
          if (result.recalls && result.recalls.length > 0) {
            const latestRecall = result.recalls[0];
            if (latestRecall.meals && latestRecall.meals.length > 0) {
              setMeals(latestRecall.meals);
            } else {
              setMeals(mealTypes.map(type => ({
                mealType: type.value,
                hour: "",
                minute: "",
                meridian: "AM" as "AM" | "PM",
                food: ""
              })));
            }
          } else {
            setMeals(mealTypes.map(type => ({
              mealType: type.value,
              hour: "",
              minute: "",
              meridian: "AM" as "AM" | "PM",
              food: ""
            })));
          }
        }
        setDraftRestored(true);
      } catch (error) {
        console.error("Error fetching dietary recall:", error);
        // If fetch fails, try to load from draft
        if (session?.user?.id) {
          const draftMeals = loadDraftFromLocalStorage(session.user.id);
          if (draftMeals && draftMeals.length > 0) {
            setMeals(draftMeals);
            setHasDraft(true);
            toast.info('Loaded from local draft (offline mode)', { duration: 3000 });
          } else {
            setMeals(mealTypes.map(type => ({
              mealType: type.value,
              hour: "",
              minute: "",
              meridian: "AM" as "AM" | "PM",
              food: ""
            })));
          }
        }
        setDraftRestored(true);
      } finally {
        setLoading(false);
      }
    };

    if (session?.user) {
      fetchData();
    }
  }, [session]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await fetch("/api/client/dietary-recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meals: meals.filter(m => m.food.trim() !== "")
        })
      });

      if (res.ok) {
        // Clear the draft after successful save
        clearDraftFromLocalStorage();
        setHasDraft(false);
        toast.success("Dietary recall saved successfully");

        // Emit real-time sync event for dietitian panel
        emitDataChange(DataEventTypes.DIETARY_RECALL_UPDATED, {
          clientId: session?.user?.id
        });

        router.push("/user/profile");
      } else {
        toast.error("Failed to save dietary recall");
      }
    } catch (error) {
      console.error("Error saving dietary recall:", error);
      toast.error("Something went wrong. Your data is saved locally.");
    } finally {
      setSaving(false);
    }
  };

  // Function to clear draft and reset
  const handleClearDraft = useCallback(() => {
    clearDraftFromLocalStorage();
    setHasDraft(false);
    setMeals(mealTypes.map(type => ({
      mealType: type.value,
      hour: "",
      minute: "",
      meridian: "AM" as "AM" | "PM",
      food: ""
    })));
    toast.success("Draft cleared");
  }, []);

  const updateMeal = (index: number, field: keyof MealEntry, value: string) => {
    const newMeals = [...meals];
    newMeals[index] = { ...newMeals[index], [field]: value };
    setMeals(newMeals);
  };

  const addCustomMeal = () => {
    setMeals([...meals, {
      mealType: "Other",
      hour: "12",
      minute: "00",
      meridian: "PM",
      food: ""
    }]);
  };

  const removeMeal = (index: number) => {
    setMeals(meals.filter((_, i) => i !== index));
  };

  const getMealInfo = (mealType: string) => {
    return mealTypes.find(t => t.value === mealType) || {
      value: mealType,
      label: mealType,
      icon: Utensils
    };
  };

  if (loading) {
    return (
      <div className={`fixed inset-0 ${isDarkMode ? 'bg-gray-950' : 'bg-white'} flex items-center justify-center z-100`}>
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  return (
    <div className={isDarkMode ? "min-h-screen bg-[#0a0a0a]" : "min-h-screen bg-linear-to-br from-green-50 via-white to-green-50"}>
      {/* Header */}
      <div className={isDarkMode ? "sticky top-0 z-10 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#1f1f1f]" : "sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100"}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/user/profile" className={isDarkMode ? "p-2 -ml-2 rounded-xl hover:bg-white/10 transition-colors" : "p-2 -ml-2 rounded-xl hover:bg-green-50 transition-colors"}>
              <ArrowLeft className={isDarkMode ? "w-5 h-5 text-gray-200" : "w-5 h-5 text-gray-600"} />
            </Link>
            <div>
              <h1 className={isDarkMode ? "text-lg font-bold text-white" : "text-lg font-bold text-gray-900"}>Dietary Recall</h1>
              {hasDraft && (
                <span className="text-xs text-orange-500">Draft saved locally</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasDraft && (
              <button
                onClick={handleClearDraft}
                className={isDarkMode
                  ? "p-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-white/10 transition-colors"
                  : "p-2 rounded-xl text-gray-500 hover:text-red-500 hover:bg-gray-100 transition-colors"}
                title="Clear draft"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition-colors disabled:opacity-50 shadow-lg shadow-green-500/25"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 pb-24 space-y-4">
        {/* Meal Cards */}
        {meals.map((meal, index) => {
          const mealInfo = getMealInfo(meal.mealType);
          const MealIcon = mealInfo.icon;

          return (
            <div
              key={index}
              className={isDarkMode ? "bg-[#1a1a1a] rounded-2xl p-5 shadow-sm border border-[#2a2a2a]" : "bg-white rounded-2xl p-5 shadow-sm border border-gray-100"}
            >
              {/* Meal Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/25">
                    <MealIcon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className={isDarkMode ? "font-bold text-white" : "font-bold text-gray-900"}>{mealInfo.label}</h3>
                    {meal.hour && meal.minute && (
                      <p className={isDarkMode ? "text-xs text-gray-400 flex items-center gap-1" : "text-xs text-gray-500 flex items-center gap-1"}>
                        <Clock className="w-3 h-3" />
                        {meal.hour}:{meal.minute} {meal.meridian}
                      </p>
                    )}
                  </div>
                </div>
                {!mealTypes.find(t => t.value === meal.mealType) && (
                  <button
                    onClick={() => removeMeal(index)}
                    className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'text-red-400 hover:bg-red-500/10' : 'text-red-500 hover:bg-red-50'}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Time Selector */}
              <div className="flex gap-2 mb-3">
                <select
                  value={meal.hour}
                  onChange={(e) => updateMeal(index, "hour", e.target.value)}
                  className={isDarkMode
                    ? "flex-1 px-3 py-2.5 bg-[#111] border border-[#2a2a2a] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    : "flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"}
                >
                  <option value="">Hour</option>
                  {hours.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select
                  value={meal.minute}
                  onChange={(e) => updateMeal(index, "minute", e.target.value)}
                  className={isDarkMode
                    ? "flex-1 px-3 py-2.5 bg-[#111] border border-[#2a2a2a] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    : "flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"}
                >
                  <option value="">Min</option>
                  {minutes.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  value={meal.meridian}
                  onChange={(e) => updateMeal(index, "meridian", e.target.value)}
                  className={isDarkMode
                    ? "w-20 px-3 py-2.5 bg-[#111] border border-[#2a2a2a] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                    : "w-20 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>

              {/* Food Input */}
              <textarea
                value={meal.food}
                onChange={(e) => updateMeal(index, "food", e.target.value)}
                placeholder={`What did you have for ${mealInfo.label.toLowerCase()}?`}
                rows={2}
                className={isDarkMode
                  ? "w-full px-4 py-3 bg-[#111] border border-[#2a2a2a] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  : "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"}
              />
            </div>
          );
        })}

        {/* Add Custom Meal */}
        <button
          onClick={addCustomMeal}
          className={isDarkMode
            ? "w-full py-4 border-2 border-dashed border-[#2a2a2a] rounded-2xl text-gray-300 hover:border-green-500 hover:text-green-400 hover:bg-white/5 transition-all flex items-center justify-center gap-2"
            : "w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 hover:border-green-500 hover:text-green-600 hover:bg-green-50 transition-all flex items-center justify-center gap-2"}
        >
          <Plus className="w-5 h-5" />
          Add Another Meal
        </button>

        {/* Tips */}
        <div className={isDarkMode ? "bg-white/5 border border-[#2a2a2a] rounded-2xl p-4" : "bg-green-50 border border-green-200 rounded-2xl p-4"}>
          <h4 className={isDarkMode ? "text-green-300 font-semibold text-sm mb-2" : "text-green-700 font-semibold text-sm mb-2"}>💡 Tips for Accurate Recall</h4>
          <ul className={isDarkMode ? "text-xs text-gray-300 space-y-1" : "text-xs text-gray-600 space-y-1"}>
            <li>• Include portion sizes (e.g., 1 cup, 2 chapatis)</li>
            <li>• Mention cooking method (fried, boiled, grilled)</li>
            <li>• Don&apos;t forget beverages and snacks</li>
            <li>• Note any condiments or sauces used</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
