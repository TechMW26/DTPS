"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import { emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';
import {
  ArrowLeft,
  Save,
  Scale,
  Activity,
  Utensils,
  ChefHat,
  Wine,
  Cigarette,
  Plus,
  X,
  Loader2,
  Calendar
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { ClientPageSkeleton } from '@/components/ui/skeleton';

interface LifestyleData {
  heightFeet: string;
  heightInch: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  foodPreference: string;
  preferredCuisine: string[];
  allergiesFood: string[];
  fastDays: string[];
  nonVegExemptDays: string[];
  foodLikes: string;
  foodDislikes: string;
  eatOutFrequency: string;
  smokingFrequency: string;
  alcoholFrequency: string;
  activityLevel: string;
  cookingOil: string[];
  cravingType: string;
  sleepPattern: string;
  stressLevel: string;
}

const foodPreferences = ["None", "Veg", "Non-Veg", "Eggetarian", "Vegan", "Pescatarian", "Flexitarian"];
const cuisines = ["None", "Indian", "South Indian", "North Indian", "Chinese", "Italian", "Mexican", "Thai", "Continental", "Mediterranean", "Japanese", "Korean", "Middle Eastern"];
const commonFoodAllergies = ["None", "Peanuts", "Tree Nuts", "Milk", "Eggs", "Wheat", "Soy", "Fish", "Shellfish", "Sesame", "Gluten"];
const oils = ["None", "Ghee", "Mustard Oil", "Sunflower Oil", "Olive Oil", "Coconut Oil", "Groundnut Oil", "Rice Bran Oil", "Sesame Oil", "Butter", "Other"];
const days = ["None", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const activityLevels = [
  { value: "none", label: "None", desc: "Not specified" },
  { value: "sedentary", label: "Sedentary", desc: "Little or no exercise" },
  { value: "lightly_active", label: "Lightly Active", desc: "Light exercise 1-3 days/week" },
  { value: "moderately_active", label: "Moderately Active", desc: "Moderate exercise 3-5 days/week" },
  { value: "very_active", label: "Very Active", desc: "Hard exercise 6-7 days/week" },
  { value: "extremely_active", label: "Extremely Active", desc: "Very hard exercise & physical job" }
];
const frequencies = ["None", "Never", "Rarely", "Occasionally", "Sometimes", "Frequently", "Daily"];
const cravings = ["None", "Sweet", "Salty", "Spicy", "Sour", "Fried", "Crunchy"];

export default function LifestyleInfoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<LifestyleData>({
    heightFeet: "",
    heightInch: "",
    heightCm: "",
    weightKg: "",
    targetWeightKg: "",
    foodPreference: "",
    preferredCuisine: [],
    allergiesFood: [],
    fastDays: [],
    nonVegExemptDays: [],
    foodLikes: "",
    foodDislikes: "",
    eatOutFrequency: "",
    smokingFrequency: "",
    alcoholFrequency: "",
    activityLevel: "",
    cookingOil: [],
    cravingType: "",
    sleepPattern: "",
    stressLevel: ""
  });

  const [customAllergy, setCustomAllergy] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/client/lifestyle-info", { cache: 'no-store' });
        if (res.ok) {
          const result = await res.json();

          // Map backend food preference to display format
          const mapFoodPreference = (pref: string): string => {
            const prefMap: Record<string, string> = {
              'veg': 'Veg',
              'non-veg': 'Non-Veg',
              'eggetarian': 'Eggetarian',
              'vegan': 'Vegan'
            };
            return prefMap[pref] || pref || '';
          };

          setData({
            heightFeet: result.heightFeet || "",
            heightInch: result.heightInch || "",
            heightCm: result.heightCm || "",
            weightKg: result.weightKg || "",
            targetWeightKg: result.targetWeightKg || "",
            foodPreference: mapFoodPreference(result.foodPreference),
            preferredCuisine: result.preferredCuisine || [],
            allergiesFood: result.allergiesFood || [],
            fastDays: result.fastDays || [],
            nonVegExemptDays: result.nonVegExemptDays || [],
            foodLikes: result.foodLikes || "",
            foodDislikes: result.foodDislikes || "",
            eatOutFrequency: result.eatOutFrequency || "",
            smokingFrequency: result.smokingFrequency || "",
            alcoholFrequency: result.alcoholFrequency || "",
            activityLevel: result.activityLevel || "",
            cookingOil: result.cookingOil || [],
            cravingType: result.cravingType || "",
            sleepPattern: result.sleepPattern || "",
            stressLevel: result.stressLevel || ""
          });
        }
      } catch (error) {
        console.error("Error fetching lifestyle info:", error);
      } finally {
        setLoading(false);
      }
    };

    if (session?.user) {
      fetchData();
    }
  }, [session]);

  // Helper function to convert CM to feet/inches
  const cmToFeetInches = (cm: string) => {
    const cmNum = parseFloat(cm);
    if (isNaN(cmNum) || cmNum <= 0) return { feet: '', inch: '' };
    const totalInches = cmNum / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return { feet: feet.toString(), inch: inches.toString() };
  };

  // Handle height CM change and auto-calculate feet/inches
  const handleHeightCmChange = (cm: string) => {
    const { feet, inch } = cmToFeetInches(cm);
    setData(prev => ({ ...prev, heightCm: cm, heightFeet: feet, heightInch: inch }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Transform data to match backend schema
      const transformedData = {
        ...data,
        // Convert food preference to lowercase for backend enum validation
        foodPreference: data.foodPreference ? data.foodPreference.toLowerCase().replace(' ', '-') : '',
      };

      const res = await fetch("/api/client/lifestyle-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transformedData)
      });

      if (res.ok) {
        toast.success("Lifestyle information saved successfully");

        // Emit real-time sync event for dietitian panel
        emitDataChange(DataEventTypes.LIFESTYLE_INFO_UPDATED, {
          clientId: session?.user?.id
        });

        router.push("/user/profile");
      } else {
        const errorData = await res.json();
        console.error("API Error:", errorData);
        toast.error("Failed to save lifestyle information");
      }
    } catch (error) {
      console.error("Error saving lifestyle info:", error);
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayItem = (field: keyof LifestyleData, item: string) => {
    const currentArray = data[field] as string[];

    // Handle "None" selection - clears other selections
    if (item === 'None') {
      if (currentArray.includes('None')) {
        setData({ ...data, [field]: [] });
      } else {
        setData({ ...data, [field]: ['None'] });
      }
      return;
    }

    // Remove "None" if selecting another option
    if (currentArray.includes(item)) {
      setData({ ...data, [field]: currentArray.filter(i => i !== item) });
    } else {
      setData({ ...data, [field]: [...currentArray.filter(i => i !== 'None'), item] });
    }
  };

  const addCustomAllergy = () => {
    if (customAllergy.trim() && !data.allergiesFood.includes(customAllergy.trim())) {
      setData({ ...data, allergiesFood: [...data.allergiesFood, customAllergy.trim()] });
      setCustomAllergy("");
    }
  };

  if (loading) {
    return <ClientPageSkeleton variant="form" showHeader={false} />;
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
            <h1 className={isDarkMode ? "text-lg font-bold text-white" : "text-lg font-bold text-gray-900"}>Lifestyle Information</h1>
          </div>
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

      <div className="space-y-6 px-4 py-6">
        {/* Activity Level */}
        <Section title="Activity Level" icon={Activity}>
          <div className="space-y-2">
            {activityLevels.map(level => (
              <button
                key={level.value}
                onClick={() => setData({ ...data, activityLevel: level.value })}
                className={`w-full p-3 rounded-xl text-left transition-all border ${data.activityLevel === level.value
                  ? "bg-green-50 border-green-500 ring-2 ring-green-500"
                  : isDarkMode
                    ? "bg-[#111] border-[#2a2a2a] hover:border-green-500/60"
                    : "bg-gray-50 border-gray-200 hover:border-green-300"
                  }`}
              >
                <p className={`font-medium ${data.activityLevel === level.value ? 'text-green-700' : (isDarkMode ? 'text-white' : 'text-gray-900')}`}>
                  {level.label}
                </p>
                <p className={isDarkMode ? "text-xs text-gray-400" : "text-xs text-gray-500"}>{level.desc}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* Food Preference */}
        <Section title="Food Preference" icon={Utensils}>
          <div className="flex flex-wrap gap-2">
            {foodPreferences.map(pref => (
              <button
                key={pref}
                onClick={() => setData({ ...data, foodPreference: pref })}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.foodPreference === pref
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : isDarkMode
                    ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                    : "bg-gray-50 text-gray-600 hover:bg-green-50"
                  }`}
              >
                {pref}
              </button>
            ))}
          </div>
        </Section>

        {/* Preferred Cuisines */}
        <Section title="Preferred Cuisines" icon={ChefHat}>
          <div className="flex flex-wrap gap-2">
            {cuisines.map(cuisine => (
              <button
                key={cuisine}
                onClick={() => toggleArrayItem("preferredCuisine", cuisine)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.preferredCuisine.includes(cuisine)
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : isDarkMode
                    ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                    : "bg-gray-50 text-gray-600 hover:bg-green-50"
                  }`}
              >
                {cuisine}
              </button>
            ))}
          </div>
        </Section>

        {/* Cooking Oil */}
        <Section title="Cooking Oil Used" icon={ChefHat}>
          <div className="flex flex-wrap gap-2">
            {oils.map(oil => (
              <button
                key={oil}
                onClick={() => toggleArrayItem("cookingOil", oil)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.cookingOil.includes(oil)
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : isDarkMode
                    ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                    : "bg-gray-50 text-gray-600 hover:bg-green-50"
                  }`}
              >
                {oil}
              </button>
            ))}
          </div>
        </Section>

        {/* Food Allergies */}
        <Section title="Food Allergies" icon={Utensils}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {commonFoodAllergies.map(allergy => (
                <button
                  key={allergy}
                  onClick={() => toggleArrayItem("allergiesFood", allergy)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.allergiesFood.includes(allergy)
                    ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                    : isDarkMode
                      ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                      : "bg-gray-50 text-gray-600 hover:bg-green-50"
                    }`}
                >
                  {allergy}
                </button>
              ))}
            </div>
            {/* Show custom allergies that are not in the common list */}
            {data.allergiesFood.filter(a => !commonFoodAllergies.includes(a)).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.allergiesFood.filter(a => !commonFoodAllergies.includes(a)).map(allergy => (
                  <span
                    key={allergy}
                    className={isDarkMode
                      ? "px-3 py-1.5 bg-green-500/20 text-green-400 rounded-full text-sm flex items-center gap-1"
                      : "px-3 py-1.5 bg-green-100 text-green-700 rounded-full text-sm flex items-center gap-1"}
                  >
                    {allergy}
                    <button
                      onClick={() => toggleArrayItem("allergiesFood", allergy)}
                      className="hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={customAllergy}
                onChange={(e) => setCustomAllergy(e.target.value)}
                placeholder="Add other food allergy..."
                className={isDarkMode
                  ? "flex-1 px-4 py-2.5 bg-[#111] border border-[#2a2a2a] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  : "flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"}
                onKeyDown={(e) => e.key === 'Enter' && addCustomAllergy()}
              />
              <button
                onClick={addCustomAllergy}
                className="px-4 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Section>

        {/* Cravings */}
        <Section title="Food Cravings" icon={Utensils}>
          <div className="flex flex-wrap gap-2">
            {cravings.map(craving => (
              <button
                key={craving}
                onClick={() => setData({ ...data, cravingType: craving })}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.cravingType === craving
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : isDarkMode
                    ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                    : "bg-gray-50 text-gray-600 hover:bg-green-50"
                  }`}
              >
                {craving}
              </button>
            ))}
          </div>
        </Section>

        {/* Fast Days */}
        <Section title="Fasting Days" icon={Calendar}>
          <div className="flex flex-wrap gap-2">
            {days.map(day => (
              <button
                key={day}
                onClick={() => toggleArrayItem("fastDays", day)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.fastDays.includes(day)
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : isDarkMode
                    ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                    : "bg-gray-50 text-gray-600 hover:bg-green-50"
                  }`}
              >
                {day.slice(0, 3)}
              </button>
            ))}
          </div>
        </Section>

        {/* Non-Veg Exempt Days */}
        {data.foodPreference !== "Veg" && data.foodPreference !== "Vegan" && (
          <Section title="Non-Veg Exempt Days" icon={Calendar}>
            <div className="flex flex-wrap gap-2">
              {days.map(day => (
                <button
                  key={day}
                  onClick={() => toggleArrayItem("nonVegExemptDays", day)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.nonVegExemptDays.includes(day)
                    ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                    : isDarkMode
                      ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                      : "bg-gray-50 text-gray-600 hover:bg-green-50"
                    }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Food Likes & Dislikes */}
        <Section title="Food Preferences" icon={Utensils}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={isDarkMode ? "text-sm font-medium text-gray-300" : "text-sm font-medium text-gray-700"}>Foods You Like</label>
              <textarea
                value={data.foodLikes}
                onChange={(e) => setData({ ...data, foodLikes: e.target.value })}
                placeholder="E.g., Dal, Rice, Paneer, Chicken..."
                rows={2}
                className={isDarkMode
                  ? "w-full px-4 py-3 bg-[#111] border border-[#2a2a2a] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  : "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"}
              />
            </div>
            <div className="space-y-2">
              <label className={isDarkMode ? "text-sm font-medium text-gray-300" : "text-sm font-medium text-gray-700"}>Foods You Dislike</label>
              <textarea
                value={data.foodDislikes}
                onChange={(e) => setData({ ...data, foodDislikes: e.target.value })}
                placeholder="E.g., Bitter gourd, Broccoli..."
                rows={2}
                className={isDarkMode
                  ? "w-full px-4 py-3 bg-[#111] border border-[#2a2a2a] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  : "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"}
              />
            </div>
          </div>
        </Section>

        {/* Eating Out Frequency */}
        <Section title="Eating Out Frequency" icon={Utensils}>
          <div className="flex flex-wrap gap-2">
            {frequencies.map(freq => (
              <button
                key={freq}
                onClick={() => setData({ ...data, eatOutFrequency: freq })}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.eatOutFrequency === freq
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : isDarkMode
                    ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                    : "bg-gray-50 text-gray-600 hover:bg-green-50"
                  }`}
              >
                {freq}
              </button>
            ))}
          </div>
        </Section>

        {/* Habits */}
        <Section title="Lifestyle Habits" icon={Wine}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={isDarkMode ? "text-sm font-medium text-gray-300 flex items-center gap-2" : "text-sm font-medium text-gray-700 flex items-center gap-2"}>
                <Cigarette className="w-4 h-4" /> Smoking
              </label>
              <div className="flex flex-wrap gap-2">
                {frequencies.map(freq => (
                  <button
                    key={freq}
                    onClick={() => setData({ ...data, smokingFrequency: freq })}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.smokingFrequency === freq
                      ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                      : isDarkMode
                        ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                        : "bg-gray-50 text-gray-600 hover:bg-green-50"
                      }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className={isDarkMode ? "text-sm font-medium text-gray-300 flex items-center gap-2" : "text-sm font-medium text-gray-700 flex items-center gap-2"}>
                <Wine className="w-4 h-4" /> Alcohol
              </label>
              <div className="flex flex-wrap gap-2">
                {frequencies.map(freq => (
                  <button
                    key={freq}
                    onClick={() => setData({ ...data, alcoholFrequency: freq })}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.alcoholFrequency === freq
                      ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                      : isDarkMode
                        ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                        : "bg-gray-50 text-gray-600 hover:bg-green-50"
                      }`}
                  >
                    {freq}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  const { isDarkMode } = useTheme();
  return (
    <div className={isDarkMode ? "bg-[#1a1a1a] rounded-2xl p-5 shadow-sm border border-[#2a2a2a]" : "bg-white rounded-2xl p-5 shadow-sm border border-gray-100"}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center shadow-lg shadow-green-500/25">
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className={isDarkMode ? "font-bold text-white" : "font-bold text-gray-900"}>{title}</h3>
      </div>
      {children}
    </div>
  );
}
