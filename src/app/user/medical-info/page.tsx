"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import PageTransition from "@/components/animations/PageTransition";
import { useTheme } from "@/contexts/ThemeContext";
import { emitDataChange, DataEventTypes } from '@/lib/events/useDataRefresh';
import {
  ArrowLeft,
  Save,
  Heart,
  Droplets,
  AlertCircle,
  FileText,
  Baby,
  Plus,
  X,
  Loader2,
  Upload,
  Trash2,
  Eye,
  ZoomIn,
  ZoomOut,
  Utensils
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';
import { getMediaProxyUrl } from '@/lib/media';

interface MedicalReport {
  id?: string;
  _id?: string;
  name?: string;
  fileName?: string;
  url?: string;
  type?: string;
  fileType?: string;
  category?: string;
  uploadedAt?: string;
  uploadedOn?: string;
}

interface MedicalData {
  medicalConditions: string[];
  allergies: string[];
  dietaryRestrictions: string[];
  bloodGroup: string;
  gutIssues: string[];
  isPregnant: boolean;
  isLactating: boolean;
  menstrualCycle: string;
  bloodFlow: string;
  medicalHistory: string;
  familyHistory: string;
  medication: string;
  notes: string;
  reports: MedicalReport[];
}

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const reportCategories = [
  "Medical Report",
  "Blood Test",
  "X-Ray",
  "MRI/CT Scan",
  "Prescription",
  "Vaccination",
  "Insurance",
  "Other"
];
const commonConditions = [
  "Diabetes", "Hypertension", "Heart Disease", "Thyroid", "PCOS/PCOD",
  "Asthma", "Arthritis", "High Cholesterol", "Kidney Disease", "Liver Disease",
  "IBS", "Celiac Disease", "Lactose Intolerance", "Osteoporosis", "Anemia"
];
const commonAllergies = ["Peanuts", "Tree Nuts", "Milk", "Eggs", "Wheat", "Soy", "Fish", "Shellfish", "Sesame", "Gluten"];
const commonDietaryRestrictions = ["Vegetarian", "Vegan", "Eggitarian", "Gluten-Free", "Non-Vegetarian", "Dairy-Free", "Keto", "Low-Carb", "Low-Fat", "High-Protein", "Paleo", "Mediterranean", "Jain", "Halal", "Kosher"];
const gutIssueOptions = ["Bloating", "Constipation", "Diarrhea", "Acidity", "IBS", "Acid Reflux", "Indigestion", "Gas"];

export default function MedicalInfoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { isDarkMode } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<MedicalReport | null>(null);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [reportName, setReportName] = useState("");
  const [reportCategory, setReportCategory] = useState("Medical Report");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [userGender, setUserGender] = useState<string>("");
  const [data, setData] = useState<MedicalData>({
    medicalConditions: [],
    allergies: [],
    dietaryRestrictions: [],
    bloodGroup: "",
    gutIssues: [],
    isPregnant: false,
    isLactating: false,
    menstrualCycle: "",
    bloodFlow: "",
    medicalHistory: "",
    familyHistory: "",
    medication: "",
    notes: "",
    reports: []
  });

  const [customCondition, setCustomCondition] = useState("");
  const [customAllergy, setCustomAllergy] = useState("");
  const [customDietaryRestriction, setCustomDietaryRestriction] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/client/medical-info", { cache: 'no-store' });
        if (res.ok) {
          const result = await res.json();
          setUserGender(result.gender || "");
          setData({
            medicalConditions: result.medicalConditions || [],
            allergies: result.allergies || [],
            dietaryRestrictions: result.dietaryRestrictions || [],
            bloodGroup: result.bloodGroup || "",
            gutIssues: result.gutIssues || [],
            isPregnant: result.isPregnant || false,
            isLactating: result.isLactating || false,
            menstrualCycle: result.menstrualCycle || "",
            bloodFlow: result.bloodFlow || "",
            medicalHistory: result.medicalHistory || "",
            familyHistory: result.familyHistory || "",
            medication: result.medication || "",
            notes: result.notes || "",
            reports: result.reports || []
          });
        }
      } catch (error) {
        console.error("Error fetching medical info:", error);
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
      const res = await fetch("/api/client/medical-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (res.ok) {
        toast.success("Medical information saved successfully");

        // Emit real-time sync event for dietitian panel
        emitDataChange(DataEventTypes.MEDICAL_INFO_UPDATED, {
          clientId: session?.user?.id
        });

        router.push("/user/profile");
      } else {
        toast.error(result.error || "Failed to save medical information");
      }
    } catch (error) {
      console.error("Error saving medical info:", error);
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const toggleArrayItem = (field: keyof MedicalData, item: string) => {
    const currentArray = data[field] as string[];

    if (currentArray.includes(item)) {
      setData({ ...data, [field]: currentArray.filter(i => i !== item) });
    } else {
      setData({ ...data, [field]: [...currentArray, item] });
    }
  };

  const addCustomCondition = () => {
    if (customCondition.trim() && !data.medicalConditions.includes(customCondition.trim())) {
      setData({ ...data, medicalConditions: [...data.medicalConditions, customCondition.trim()] });
      setCustomCondition("");
    }
  };

  const addCustomAllergy = () => {
    if (customAllergy.trim()) {
      const newItems = customAllergy
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0 && !data.allergies.includes(s));
      if (newItems.length > 0) {
        setData({ ...data, allergies: [...data.allergies, ...newItems] });
      }
      setCustomAllergy("");
    }
  };

  const addCustomDietaryRestriction = () => {
    if (customDietaryRestriction.trim() && !data.dietaryRestrictions.includes(customDietaryRestriction.trim())) {
      setData({ ...data, dietaryRestrictions: [...data.dietaryRestrictions, customDietaryRestriction.trim()] });
      setCustomDietaryRestriction("");
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload an image (JPEG, PNG, WebP) or PDF file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setPendingFile(file);
    setReportName(file.name.replace(/\.[^/.]+$/, "")); // Set default name without extension
  };

  const handleUploadReport = async () => {
    if (!pendingFile) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('type', 'medical-report'); // Use medical-report type for ImageKit upload

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const result = await res.json();
        const newReport: MedicalReport = {
          id: result.fileId || result._id || Date.now().toString(),
          fileName: reportName || pendingFile.name,
          name: reportName || pendingFile.name,
          url: result.url || `/api/files/${result.fileId || result._id}`,
          fileType: pendingFile.type,
          type: pendingFile.type,
          category: reportCategory,
          uploadedOn: new Date().toISOString(),
          uploadedAt: new Date().toISOString()
        };
        setData({ ...data, reports: [...data.reports, newReport] });
        toast.success("Report uploaded successfully");
        setPendingFile(null);
        setReportName("");
        setReportCategory("Medical Report");
      } else {
        toast.error("Failed to upload report");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Failed to upload report");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setReportName("");
    setReportCategory("Medical Report");
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteReport = (index: number) => {
    const newReports = [...data.reports];
    newReports.splice(index, 1);
    setData({ ...data, reports: newReports });
    toast.success("Report removed");
  };

  const openLightbox = (report: MedicalReport) => {
    setLightboxImage(report);
    setLightboxZoom(1);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setLightboxImage(null);
    setLightboxZoom(1);
  };

  const isImageFile = (report: MedicalReport) => {
    const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (report.type || report.fileType) {
      return imageTypes.includes(report.type || report.fileType || '');
    }
    const fileName = report.name || report.fileName || report.url || '';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
  };

  const getReportName = (report: MedicalReport) => {
    return report.name || report.fileName || 'Uploaded Report';
  };

  const getReportDate = (report: MedicalReport) => {
    const dateStr = report.uploadedAt || report.uploadedOn;
    return dateStr ? new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    }) : '-';
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
            <h1 className={isDarkMode ? "text-lg font-bold text-white" : "text-lg font-bold text-gray-900"}>Medical Information</h1>
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

      <div className="px-4 py-6 pb-24 space-y-6">
        {/* Blood Group */}
        <Section title="Blood Group" icon={Droplets}>
          <div className="flex flex-wrap gap-2">
            {bloodGroups.map(group => (
              <button
                key={group}
                onClick={() => setData({ ...data, bloodGroup: group })}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.bloodGroup === group
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : isDarkMode
                    ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                    : "bg-gray-50 text-gray-600 hover:bg-green-50"
                  }`}
              >
                {group}
              </button>
            ))}
          </div>
        </Section>

        {/* Medical Conditions */}
        <Section title="Medical Conditions" icon={Heart}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {commonConditions.map(condition => (
                <button
                  key={condition}
                  onClick={() => toggleArrayItem("medicalConditions", condition)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.medicalConditions.includes(condition)
                    ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                    : isDarkMode
                      ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                      : "bg-gray-50 text-gray-600 hover:bg-green-50"
                    }`}
                >
                  {condition}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customCondition}
                onChange={(e) => setCustomCondition(e.target.value)}
                placeholder="Add other condition..."
                className={isDarkMode
                  ? "flex-1 px-4 py-2.5 bg-[#111] border border-[#2a2a2a] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  : "flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"}
                onKeyDown={(e) => e.key === 'Enter' && addCustomCondition()}
              />
              <button
                onClick={addCustomCondition}
                className="px-4 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Section>

        {/* Allergies */}
        <Section title="Allergies" icon={AlertCircle}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {commonAllergies.map(allergy => (
                <button
                  key={allergy}
                  onClick={() => toggleArrayItem("allergies", allergy)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.allergies.includes(allergy)
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
            <div className="flex gap-2">
              <input
                type="text"
                value={customAllergy}
                onChange={(e) => setCustomAllergy(e.target.value)}
                placeholder="Add allergy or multiple e.g. Soy, Gluten, Corn"
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

        {/* Dietary Restrictions */}
        <Section title="Dietary Restrictions" icon={Utensils}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {commonDietaryRestrictions.map(restriction => (
                <button
                  key={restriction}
                  onClick={() => toggleArrayItem("dietaryRestrictions", restriction)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.dietaryRestrictions.includes(restriction)
                    ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                    : isDarkMode
                      ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                      : "bg-gray-50 text-gray-600 hover:bg-green-50"
                    }`}
                >
                  {restriction}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={customDietaryRestriction}
                onChange={(e) => setCustomDietaryRestriction(e.target.value)}
                placeholder="Add other dietary restriction..."
                className={isDarkMode
                  ? "flex-1 px-4 py-2.5 bg-[#111] border border-[#2a2a2a] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  : "flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"}
                onKeyDown={(e) => e.key === 'Enter' && addCustomDietaryRestriction()}
              />
              <button
                onClick={addCustomDietaryRestriction}
                className="px-4 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </Section>

        {/* Gut Issues */}
        <Section title="Gut Issues" icon={AlertCircle}>
          <div className="flex flex-wrap gap-2">
            {gutIssueOptions.map(issue => (
              <button
                key={issue}
                onClick={() => toggleArrayItem("gutIssues", issue)}
                className={`px-3 py-2 rounded-xl text-sm font-medium transition-all ${data.gutIssues.includes(issue)
                  ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                  : isDarkMode
                    ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                    : "bg-gray-50 text-gray-600 hover:bg-green-50"
                  }`}
              >
                {issue}
              </button>
            ))}
          </div>
        </Section>

        {/* Women's Health - Only show for females */}
        {userGender?.toLowerCase() === 'female' && (
          <Section title="Women's Health" icon={Baby}>
            <div className="space-y-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.isPregnant}
                    onChange={(e) => setData({ ...data, isPregnant: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">Pregnant</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.isLactating}
                    onChange={(e) => setData({ ...data, isLactating: e.target.checked })}
                    className="w-5 h-5 rounded border-gray-300 text-green-500 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">Lactating</span>
                </label>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Menstrual Cycle</label>
                <div className="flex gap-2">
                  {["regular", "irregular"].map(cycle => (
                    <button
                      key={cycle}
                      onClick={() => setData({ ...data, menstrualCycle: cycle })}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.menstrualCycle === cycle
                        ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                        : isDarkMode
                          ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                          : "bg-gray-50 text-gray-600 hover:bg-green-50"
                        }`}
                    >
                      {cycle.charAt(0).toUpperCase() + cycle.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Blood Flow</label>
                <div className="flex gap-2">
                  {["light", "normal", "heavy"].map(flow => (
                    <button
                      key={flow}
                      onClick={() => setData({ ...data, bloodFlow: flow })}
                      className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${data.bloodFlow === flow
                        ? "bg-green-500 text-white shadow-lg shadow-green-500/25"
                        : isDarkMode
                          ? "bg-[#111] text-gray-300 hover:bg-white/10 border border-[#2a2a2a]"
                          : "bg-gray-50 text-gray-600 hover:bg-green-50"
                        }`}
                    >
                      {flow.charAt(0).toUpperCase() + flow.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* Additional Notes */}
        <Section title="Additional Information" icon={FileText}>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Current Medications</label>
              <textarea
                value={data.medication}
                onChange={(e) => setData({ ...data, medication: e.target.value })}
                placeholder="List any medications you are currently taking..."
                rows={2}
                className={isDarkMode
                  ? "w-full px-4 py-3 bg-[#111] border border-[#2a2a2a] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  : "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Medical History</label>
              <textarea
                value={data.medicalHistory}
                onChange={(e) => setData({ ...data, medicalHistory: e.target.value })}
                placeholder="Any past surgeries, hospitalizations, or major health events..."
                rows={2}
                className={isDarkMode
                  ? "w-full px-4 py-3 bg-[#111] border border-[#2a2a2a] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  : "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Family History</label>
              <textarea
                value={data.familyHistory}
                onChange={(e) => setData({ ...data, familyHistory: e.target.value })}
                placeholder="Any family history of diseases or conditions..."
                rows={2}
                className={isDarkMode
                  ? "w-full px-4 py-3 bg-[#111] border border-[#2a2a2a] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                  : "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"}
              />
            </div>
          </div>
        </Section>

        {/* Medical Reports */}
        <Section title="Medical Reports" icon={FileText}>
          <div className="space-y-4">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              className="hidden"
            />

            {/* Upload Area */}
            {!pendingFile ? (
              <button
                onClick={handleFileSelect}
                disabled={uploading}
                className={isDarkMode
                  ? "w-full py-8 border-2 border-dashed border-[#2a2a2a] rounded-xl hover:border-green-500 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-2"
                  : "w-full py-8 border-2 border-dashed border-gray-300 rounded-xl hover:border-green-500 hover:bg-green-50/50 transition-all flex flex-col items-center justify-center gap-2"}
              >
                <Upload className={isDarkMode ? "w-8 h-8 text-gray-500" : "w-8 h-8 text-gray-400"} />
                <span className={isDarkMode ? "text-sm text-gray-300" : "text-sm text-gray-500"}>Click to upload report</span>
                <span className={isDarkMode ? "text-xs text-gray-500" : "text-xs text-gray-400"}>JPEG, PNG, WebP or PDF (Max 10MB)</span>
              </button>
            ) : (
              <div className={isDarkMode ? "p-4 bg-[#111] rounded-xl border border-[#2a2a2a] space-y-3" : "p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3"}>
                <div className="flex items-center gap-3">
                  <FileText className="w-8 h-8 text-green-500" />
                  <div className="flex-1">
                    <p className={isDarkMode ? "text-sm font-medium text-gray-200" : "text-sm font-medium text-gray-700"}>{pendingFile.name}</p>
                    <p className={isDarkMode ? "text-xs text-gray-400" : "text-xs text-gray-500"}>{(pendingFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Report Name</label>
                  <input
                    type="text"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    placeholder="Enter report name..."
                    className={isDarkMode
                      ? "w-full px-4 py-2.5 bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                      : "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value)}
                    className={isDarkMode
                      ? "w-full px-4 py-2.5 bg-[#0f0f0f] border border-[#2a2a2a] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                      : "w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"}
                  >
                    {reportCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={cancelUpload}
                    className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUploadReport}
                    disabled={uploading}
                    className="flex-1 py-2.5 bg-green-500 text-white rounded-xl text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Upload
                  </button>
                </div>
              </div>
            )}

            {/* Uploaded Reports - Table Format */}
            {data.reports.length > 0 && (
              <div className="space-y-3">
                <p className={isDarkMode ? "text-sm font-medium text-gray-300" : "text-sm font-medium text-gray-600"}>Uploaded Reports ({data.reports.length})</p>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className={isDarkMode ? "border-b border-[#2a2a2a] bg-[#111]" : "border-b border-gray-200 bg-gray-50"}>
                        <th className={isDarkMode ? "text-left py-2.5 px-3 text-gray-300 font-semibold text-xs" : "text-left py-2.5 px-3 text-gray-600 font-semibold text-xs"}>S.No</th>
                        <th className={isDarkMode ? "text-left py-2.5 px-3 text-gray-300 font-semibold text-xs" : "text-left py-2.5 px-3 text-gray-600 font-semibold text-xs"}>Name</th>
                        <th className={isDarkMode ? "text-left py-2.5 px-3 text-gray-300 font-semibold text-xs" : "text-left py-2.5 px-3 text-gray-600 font-semibold text-xs"}>Category</th>
                        <th className={isDarkMode ? "text-left py-2.5 px-3 text-gray-300 font-semibold text-xs" : "text-left py-2.5 px-3 text-gray-600 font-semibold text-xs"}>Date</th>
                        <th className={isDarkMode ? "text-center py-2.5 px-3 text-gray-300 font-semibold text-xs" : "text-center py-2.5 px-3 text-gray-600 font-semibold text-xs"}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reports.map((report, index) => (
                        <tr key={index} className={isDarkMode ? "border-b border-[#2a2a2a] hover:bg-white/5" : "border-b border-gray-100 hover:bg-gray-50"}>
                          <td className={isDarkMode ? "py-2.5 px-3 text-gray-400 text-xs" : "py-2.5 px-3 text-gray-500 text-xs"}>{index + 1}</td>
                          <td className="py-2.5 px-3">
                            <p className={isDarkMode ? "text-gray-200 font-medium text-xs truncate max-w-30" : "text-gray-800 font-medium text-xs truncate max-w-30"}>{getReportName(report)}</p>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-medium">
                              {report.category || 'Medical Report'}
                            </span>
                          </td>
                          <td className={isDarkMode ? "py-2.5 px-3 text-gray-400 text-xs" : "py-2.5 px-3 text-gray-500 text-xs"}>
                            {getReportDate(report)}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => openLightbox(report)}
                                className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                                title="View"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteReport(index)}
                                className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Lightbox Modal - View on same screen */}
      {lightboxOpen && lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 flex gap-2 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxZoom(z => Math.max(0.5, z - 0.25)); }}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <ZoomOut className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxZoom(z => Math.min(3, z + 0.25)); }}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <ZoomIn className="w-5 h-5" />
            </button>
            <button
              onClick={closeLightbox}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div
            className="max-w-full max-h-full overflow-auto p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {isImageFile(lightboxImage) ? (
              <img
                src={getMediaProxyUrl(lightboxImage.url)}
                alt={getReportName(lightboxImage)}
                loading="lazy"
                style={{ transform: `scale(${lightboxZoom})` }}
                className="max-w-full max-h-[85vh] object-contain transition-transform"
              />
            ) : (
              <iframe
                src={getMediaProxyUrl(lightboxImage.url)}
                className="w-[90vw] h-[85vh] bg-white rounded-lg"
                title={getReportName(lightboxImage)}
              />
            )}
          </div>

          {/* File name */}
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-white/70 text-sm bg-black/50 inline-block px-4 py-2 rounded-full">
              {getReportName(lightboxImage)}
            </p>
          </div>
        </div>
      )}
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
