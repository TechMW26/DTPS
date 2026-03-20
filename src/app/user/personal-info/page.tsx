"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import PageTransition from "@/components/animations/PageTransition";
import { useTheme } from "@/contexts/ThemeContext";
import { emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';
import { useGoalCategories } from "@/hooks/useGoalCategories";
import {
  ArrowLeft,
  Save,
  User,
  Users,
  Phone,
  Mail,
  Calendar,
  Camera,
  Loader2,
  Target,
  Scale,
  Activity,
  Gift
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';

interface PersonalData {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  profileImage: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  targetWeightBucket: string;
  activityLevel: string;
  generalGoal: string;
  dietType: string;
  alternativeEmail: string;
  alternativePhone: string;
  anniversary: string;
  source: string;
  referralSource: string;
}

const activityLevels = [
  { value: "sedentary", label: "Sedentary", desc: "Little or no exercise" },
  { value: "lightly_active", label: "Lightly Active", desc: "Light exercise 1-3 days/week" },
  { value: "moderately_active", label: "Moderately Active", desc: "Moderate exercise 3-5 days/week" },
  { value: "very_active", label: "Very Active", desc: "Hard exercise 6-7 days/week" },
  { value: "extremely_active", label: "Extremely Active", desc: "Very hard exercise, physical job" }
];

const dietTypes = [
  { value: "standard", label: "Standard" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "keto", label: "Keto" },
  { value: "paleo", label: "Paleo" }
];

export default function PersonalInfoPage() {
  const { data: session, status, update: updateSession } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const { categories: goalCategories, loading: categoriesLoading } = useGoalCategories();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [data, setData] = useState<PersonalData>({
    firstName: "",
    lastName: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    profileImage: "",
    heightCm: "",
    weightKg: "",
    targetWeightKg: "",
    targetWeightBucket: "",
    activityLevel: "",
    generalGoal: "",
    dietType: "",
    alternativeEmail: "",
    alternativePhone: "",
    anniversary: "",
    source: "",
    referralSource: ""
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/client/profile", { cache: 'no-store' });
        if (res.ok) {
          const result = await res.json();
          const user = result.user || result;
          // Parse name into firstName and lastName if only name exists
          let firstName = user.firstName || "";
          let lastName = user.lastName || "";
          if (!firstName && !lastName && user.name) {
            const nameParts = user.name.split(" ");
            firstName = nameParts[0] || "";
            lastName = nameParts.slice(1).join(" ") || "";
          }
          setData({
            firstName,
            lastName,
            phone: user.phone || "",
            dateOfBirth: user.dateOfBirth ? user.dateOfBirth.split("T")[0] : "",
            gender: user.gender || "",
            profileImage: user.profileImage || user.avatar || "",
            heightCm: user.heightCm || "",
            weightKg: user.weightKg || "",
            targetWeightKg: user.targetWeightKg || "",
            targetWeightBucket: user.targetWeightBucket || "",
            activityLevel: user.activityLevel || "",
            generalGoal: user.generalGoal || "",
            dietType: user.dietType || "",
            alternativeEmail: user.alternativeEmail || "",
            alternativePhone: user.alternativePhone || "",
            anniversary: user.anniversary ? user.anniversary.split("T")[0] : "",
            source: user.source || "",
            referralSource: user.referralSource || ""
          });
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
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
      // Combine firstName and lastName into name for backward compatibility
      const saveData = {
        ...data,
        name: `${data.firstName} ${data.lastName}`.trim()
      };
      const res = await fetch("/api/client/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(saveData)
      });

      const result = await res.json();

      if (res.ok) {
        // Update session with new avatar if profileImage was changed
        if (data.profileImage) {
          await updateSession({
            avatar: data.profileImage,
            firstName: data.firstName,
            lastName: data.lastName
          });
        }

        toast.success("Personal information saved successfully");

        // Emit real-time sync event for dietitian panel
        emitDataChange(DataEventTypes.BASIC_INFO_UPDATED, {
          clientId: session?.user?.id
        });

        router.push("/user/profile");
      } else {
        toast.error(result.error || "Failed to save personal information");
      }
    } catch (error) {
      console.error("Error saving profile:", error);
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a JPEG, PNG, or WebP image");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'avatar');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const result = await res.json();
        setData({ ...data, profileImage: result.url });
        toast.success("Profile image uploaded");
      } else {
        toast.error("Failed to upload image");
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";
  };

  // Convert cm to feet/inches for display
  const cmToFeetInches = (cm: string) => {
    const cmNum = parseFloat(cm);
    if (isNaN(cmNum) || cmNum <= 0) return { feet: 0, inches: 0 };
    const totalInches = cmNum / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return { feet, inches };
  };

  if (loading) {
    return (
      <div className={`fixed inset-0 ${isDarkMode ? 'bg-gray-950' : 'bg-white'} flex items-center justify-center z-100`}>
        <SpoonGifLoader size="lg" />
      </div>
    );
  }

  const heightDisplay = cmToFeetInches(data.heightCm);
  const labelClassName = isDarkMode ? "text-sm font-medium text-gray-300" : "text-sm font-medium text-gray-700";
  const fieldClassName = isDarkMode
    ? "w-full px-4 py-3 bg-[#111] border border-[#2a2a2a] text-white placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ff9500] focus:border-transparent transition-all"
    : "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0] focus:border-transparent transition-all";

  return (
    <div className={isDarkMode ? "min-h-screen bg-[#0a0a0a]" : "min-h-screen bg-linear-to-br from-[#3AB1A0]/10 via-white to-[#3AB1A0]/10"}>
      {/* Header */}
      <div className={isDarkMode ? "sticky top-0 z-10 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#1f1f1f]" : "sticky top-0 z-10 bg-white border-b border-gray-100"}>
        <div className="relative flex items-center justify-center px-4 py-4">
          <Link
            href="/user/profile"
            className={isDarkMode ? "absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-white/10 transition-colors" : "absolute left-4 flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#3AB1A0]/10 transition-colors"}
          >
            <ArrowLeft className={isDarkMode ? "w-5 h-5 text-gray-200" : "w-5 h-5 text-gray-700"} />
          </Link>
          <h1 className={isDarkMode ? "text-lg font-bold text-white" : "text-lg font-bold text-black"}>Personal Information</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className={isDarkMode
              ? "absolute right-4 flex items-center gap-2 px-4 py-2 bg-[#ff9500] text-white rounded-xl text-sm font-semibold hover:bg-[#ff9500]/90 transition-colors disabled:opacity-50 shadow-lg shadow-[#ff9500]/25"
              : "absolute right-4 flex items-center gap-2 px-4 py-2 bg-[#3AB1A0] text-white rounded-xl text-sm font-semibold hover:bg-[#2a9989] transition-colors disabled:opacity-50 shadow-lg shadow-[#3AB1A0]/25"}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      <div className="px-4 py-6 pb-24 space-y-6">
        {/* Profile Image */}
        <div className="flex justify-center">
          <div className="relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
            />
            {data.profileImage ? (
              <img
                src={data.profileImage}
                alt="Profile"
                loading="lazy"
                className={isDarkMode ? "w-28 h-28 rounded-2xl border-4 border-white/10 object-cover shadow-xl" : "w-28 h-28 rounded-2xl border-4 border-[#3AB1A0]/20 object-cover shadow-xl"}
              />
            ) : (
              <div className={isDarkMode ? "w-28 h-28 rounded-2xl bg-linear-to-br from-[#ff9500] to-[#E06A26] flex items-center justify-center border-4 border-white/10 shadow-xl" : "w-28 h-28 rounded-2xl bg-linear-to-br from-[#3AB1A0] to-[#2a9989] flex items-center justify-center border-4 border-[#3AB1A0]/20 shadow-xl"}>
                <span className="text-3xl font-bold text-white">
                  {getInitials(data.firstName, data.lastName)}
                </span>
              </div>
            )}
            <button
              onClick={handleImageClick}
              disabled={uploading}
              className={isDarkMode
                ? "absolute -bottom-2 -right-2 w-10 h-10 bg-[#ff9500] rounded-xl flex items-center justify-center shadow-lg hover:bg-[#ff9500]/90 transition-colors"
                : "absolute -bottom-2 -right-2 w-10 h-10 bg-[#3AB1A0] rounded-xl flex items-center justify-center shadow-lg hover:bg-[#2a9989] transition-colors"}
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>

        {/* Basic Details */}
        <Section title="Basic Details" icon={User}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="First Name"
                value={data.firstName}
                onChange={(v) => setData({ ...data, firstName: v })}
                placeholder="First name"
              />
              <InputField
                label="Last Name"
                value={data.lastName}
                onChange={(v) => setData({ ...data, lastName: v })}
                placeholder="Last name"
              />
            </div>

            <InputField
              label="Phone Number"
              value={data.phone}
              onChange={(v) => setData({ ...data, phone: v })}
              placeholder="Enter phone number"
              type="tel"
            />

            <InputField
              label="Alternative Phone"
              value={data.alternativePhone}
              onChange={(v) => setData({ ...data, alternativePhone: v })}
              placeholder="Alternative phone number"
              type="tel"
            />

            <InputField
              label="Alternative Email"
              value={data.alternativeEmail}
              onChange={(v) => setData({ ...data, alternativeEmail: v })}
              placeholder="Alternative email address"
              type="email"
            />

            <div className="space-y-2">
              <label className={labelClassName}>Date of Birth</label>
              <input
                type="date"
                value={data.dateOfBirth}
                onChange={(e) => setData({ ...data, dateOfBirth: e.target.value })}
                className={fieldClassName}
              />
            </div>

            <div className="space-y-2">
              <label className={labelClassName}>Gender</label>
              <div className="flex gap-2 flex-wrap">
                {["male", "female", "other"].map((gender) => (
                  <button
                    key={gender}
                    onClick={() => setData({ ...data, gender })}
                    className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.gender === gender
                      ? (isDarkMode ? "bg-[#ff9500] text-white shadow-lg shadow-[#ff9500]/25" : "bg-[#3AB1A0] text-white shadow-lg shadow-[#3AB1A0]/25")
                      : (isDarkMode ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]" : "bg-gray-50 text-gray-600 hover:bg-[#3AB1A0]/10")
                      }`}
                  >
                    {gender.charAt(0).toUpperCase() + gender.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClassName}>Anniversary</label>
              <input
                type="date"
                value={data.anniversary}
                onChange={(e) => setData({ ...data, anniversary: e.target.value })}
                className={fieldClassName}
              />
            </div>
          </div>
        </Section>

        {/* Referral Source */}
        <Section title="How did you hear about us?" icon={Users}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={labelClassName}>Source</label>
              <select
                value={data.source}
                onChange={(e) => setData({ ...data, source: e.target.value, referralSource: e.target.value !== 'other' ? '' : data.referralSource })}
                className={fieldClassName}
              >
                <option value="">Select source</option>
                <option value="google_ads">Google Ads</option>
                <option value="facebook_ads">Facebook Ads</option>
                <option value="instagram">Instagram</option>
                <option value="referral">Referral</option>
                <option value="other">Other</option>
              </select>
            </div>
            {data.source === 'other' && (
              <InputField
                label="Please specify"
                value={data.referralSource}
                onChange={(v) => setData({ ...data, referralSource: v })}
                placeholder="Which platform?"
              />
            )}
          </div>
        </Section>

        {/* Body Metrics */}
        <Section title="Body Metrics" icon={Scale}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className={labelClassName}>Height (CM)</label>
              <input
                type="number"
                value={data.heightCm}
                onChange={(e) => setData({ ...data, heightCm: e.target.value })}
                placeholder="Height in CM"
                className={fieldClassName}
              />
              {data.heightCm && (
                <p className={isDarkMode ? "text-xs text-gray-400" : "text-xs text-gray-500"}>
                  {heightDisplay.feet} ft {heightDisplay.inches} in
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className={labelClassName}>Current Weight (KG)</label>
                <input
                  type="number"
                  value={data.weightKg}
                  onChange={(e) => setData({ ...data, weightKg: e.target.value })}
                  placeholder="Weight"
                  className={fieldClassName}
                />
              </div>
              <div className="space-y-2">
                <label className={labelClassName}>Target Weight (KG)</label>
                <input
                  type="number"
                  value={data.targetWeightKg}
                  onChange={(e) => setData({ ...data, targetWeightKg: e.target.value })}
                  placeholder="Target"
                  className={fieldClassName}
                />
              </div>

              <div className="space-y-2">
                <label className={labelClassName}>What is Your Target Weight?</label>
                <select
                  value={data.targetWeightBucket}
                  onChange={(e) => setData({ ...data, targetWeightBucket: e.target.value })}
                  className={fieldClassName}
                >
                  <option value="">Select range</option>
                  <option value="none">None</option>
                  <option value="below-5">Below 5 Kgs</option>
                  <option value="5-10">5 to 10 Kgs</option>
                  <option value="10-15">10 to 15 Kgs</option>
                  <option value="15-20">15 to 20 Kgs</option>
                  <option value="20-25">20 to 25 Kgs</option>
                  <option value="25-30">25 to 30 Kgs</option>
                  <option value="more-30">More than 30 Kgs</option>
                </select>
              </div>
            </div>
          </div>
        </Section>

        {/* Activity Level */}
        <Section title="Activity Level" icon={Activity}>
          <div className="space-y-2">
            {activityLevels.map(level => (
              <button
                key={level.value}
                onClick={() => setData({ ...data, activityLevel: level.value })}
                className={`w-full p-3 rounded-xl text-left transition-all border ${data.activityLevel === level.value
                  ? (isDarkMode ? "bg-white/5 border-[#ff9500] ring-2 ring-[#ff9500]" : "bg-[#3AB1A0]/10 border-[#3AB1A0] ring-2 ring-[#3AB1A0]")
                  : (isDarkMode ? "bg-[#111] border-[#2a2a2a] hover:border-[#ff9500]/60" : "bg-gray-50 border-gray-200 hover:border-green-300")
                  }`}
              >
                <p className={`font-medium ${data.activityLevel === level.value ? (isDarkMode ? 'text-[#ff9500]' : 'text-green-700') : (isDarkMode ? 'text-white' : 'text-gray-900')}`}>
                  {level.label}
                </p>
                <p className={isDarkMode ? "text-xs text-gray-400" : "text-xs text-gray-500"}>{level.desc}</p>
              </button>
            ))}
          </div>
        </Section>

        {/* Health Goal */}
        <Section title="Health Goal" icon={Target}>
          <div className="flex flex-wrap gap-2">
            {goalCategories.map(goal => (
              <button
                key={goal.value}
                onClick={() => setData({ ...data, generalGoal: goal.value })}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.generalGoal === goal.value
                  ? (isDarkMode ? "bg-[#ff9500] text-white shadow-lg shadow-[#ff9500]/25" : "bg-[#3AB1A0] text-white shadow-lg shadow-[#3AB1A0]/25")
                  : (isDarkMode ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]" : "bg-gray-50 text-gray-600 hover:bg-[#3AB1A0]/10")
                  }`}
              >
                {goal.name}
              </button>
            ))}
          </div>
        </Section>

        {/* Diet Type */}
        <Section title="Diet Type" icon={Target}>
          <div className="flex flex-wrap gap-2">
            {dietTypes.map(diet => (
              <button
                key={diet.value}
                onClick={() => setData({ ...data, dietType: diet.value })}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.dietType === diet.value
                  ? (isDarkMode ? "bg-[#ff9500] text-white shadow-lg shadow-[#ff9500]/25" : "bg-[#3AB1A0] text-white shadow-lg shadow-[#3AB1A0]/25")
                  : (isDarkMode ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]" : "bg-gray-50 text-gray-600 hover:bg-[#3AB1A0]/10")
                  }`}
              >
                {diet.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Email Display (Read-only) */}
        <Section title="Account" icon={Mail}>
          <div className="space-y-2">
            <label className={labelClassName}>Email Address</label>
            <div className={isDarkMode ? "px-4 py-3 bg-[#111] border border-[#2a2a2a] rounded-xl text-gray-200" : "px-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-gray-600"}>
              {session?.user?.email || "Not available"}
            </div>
            <p className={isDarkMode ? "text-xs text-gray-400" : "text-xs text-gray-500"}>Email cannot be changed</p>
          </div>
        </Section>
      </div>
    </div>
  );
}

// Section Component
function Section({
  title,
  icon: Icon,
  children
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const { isDarkMode } = useTheme();
  return (
    <div className={isDarkMode ? "bg-[#1a1a1a] rounded-2xl p-5 shadow-sm border border-[#2a2a2a]" : "bg-white rounded-2xl p-5 shadow-sm border border-gray-100"}>
      <div className="flex items-center gap-3 mb-4">
        <div className={isDarkMode ? "w-10 h-10 bg-[#ff9500] rounded-xl flex items-center justify-center shadow-lg shadow-[#ff9500]/25" : "w-10 h-10 bg-[#3AB1A0] rounded-xl flex items-center justify-center shadow-lg shadow-[#3AB1A0]/25"}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <h3 className={isDarkMode ? "font-bold text-white" : "font-bold text-gray-900"}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

// Input Field Component
function InputField({
  label,
  value,
  onChange,
  placeholder,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const { isDarkMode } = useTheme();
  return (
    <div className="space-y-2">
      <label className={isDarkMode ? "text-sm font-medium text-gray-300" : "text-sm font-medium text-gray-700"}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={isDarkMode
          ? "w-full px-4 py-3 bg-[#111] border border-[#2a2a2a] text-white placeholder-gray-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#ff9500] focus:border-transparent transition-all"
          : "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3AB1A0] focus:border-transparent transition-all"}
      />
    </div>
  );
}
