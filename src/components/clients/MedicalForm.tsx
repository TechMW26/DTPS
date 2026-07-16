"use client";
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Save, Eye, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage, validateImageFile } from '@/lib/imageCompression';

export interface MedicalData {
  medicalConditions: string;
  allergies: string;
  dietaryRestrictions: string;
  notes: string;
  diseaseHistory: DiseaseEntry[];
  medicalHistory: string;
  familyHistory: string;
  medication: string;
  bloodGroup: string;
  gutIssues: string[]; // acidity, bloating, constipation, none
  reports: UploadedReport[];
  isPregnant: boolean;
  // Female-specific fields
  isLactating: boolean;
  menstrualCycle: string; // 'regular' | 'irregular'
  bloodFlow: string; // 'light' | 'normal' | 'heavy'
}

export interface DiseaseEntry {
  id: string;
  disease: string;
  since: string; // date or year
  frequency: string;
  severity: string;
  grading: string;
  action: string;
}

export interface UploadedReport {
  id: string;
  fileName: string;
  uploadedOn: string;
  fileType: string;
  url?: string;
  category?: 'medical-report' | 'transformation' | 'other';
}

interface MedicalFormProps extends MedicalData {
  onChange: (field: keyof MedicalData, value: any) => void;
  onSave: () => void;
  loading?: boolean;
  clientGender?: string;
  clientId?: string;
  onDeleteReport?: (reportId: string) => Promise<void>;
}

// Report category options
const REPORT_CATEGORIES = [
  { value: 'medical-report', label: 'Medical Report' },
  { value: 'other', label: 'Other' },
] as const;

export function MedicalForm({ medicalConditions, allergies, dietaryRestrictions, notes, diseaseHistory, medicalHistory, familyHistory, medication, bloodGroup, gutIssues, reports, isPregnant, isLactating, menstrualCycle, bloodFlow, onChange, onSave, loading, clientGender, clientId, onDeleteReport }: MedicalFormProps) {
  const [deletingReportId, setDeletingReportId] = React.useState<string | null>(null);
  const [selectedDietary, setSelectedDietary] = React.useState<string[]>(() => (dietaryRestrictions ? dietaryRestrictions.split(',').map(s => s.trim()).filter(Boolean) : []));
  const [reportCategory, setReportCategory] = React.useState<'medical-report' | 'other'>('medical-report');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all');
  React.useEffect(() => {
    setSelectedDietary(dietaryRestrictions ? dietaryRestrictions.split(',').map(s => s.trim()).filter(Boolean) : []);
  }, [dietaryRestrictions]);
  const [dietaryOpen, setDietaryOpen] = React.useState(false);
  const dietaryOptions = [
    'Vegetarian', 'Vegan', 'Eggitarian', 'Gluten-Free', 'Non-Vegetarian', 'Dairy-Free', 'Keto', 'Low-Carb', 'Low-Fat', 'High-Protein', 'Paleo', 'Mediterranean', 'Jain', 'Halal', 'Kosher'
  ];

  // Medical conditions multi-select
  const [selectedMedical, setSelectedMedical] = React.useState<string[]>(() => (medicalConditions ? medicalConditions.split(',').map(s => s.trim()).filter(Boolean) : []));
  const [otherMedicalCondition, setOtherMedicalCondition] = React.useState(() => {
    // Initialize from existing "Other: xxx" value if present
    if (medicalConditions) {
      const otherEntry = medicalConditions.split(',').map(s => s.trim()).find(s => s.startsWith('Other: '));
      if (otherEntry) {
        return otherEntry.replace('Other: ', '');
      }
    }
    return '';
  });
  React.useEffect(() => {
    const parsed = medicalConditions ? medicalConditions.split(',').map(s => s.trim()).filter(Boolean) : [];
    setSelectedMedical(parsed);
    // Also update otherMedicalCondition if "Other: xxx" is present
    const otherEntry = parsed.find(s => s.startsWith('Other: '));
    if (otherEntry) {
      setOtherMedicalCondition(otherEntry.replace('Other: ', ''));
      // Replace "Other: xxx" with just "Other" in selectedMedical for button state
      setSelectedMedical(parsed.map(s => s.startsWith('Other: ') ? 'Other' : s));
    } else if (parsed.includes('Other')) {
      // Keep otherMedicalCondition empty if just "Other" is selected
    } else {
      setOtherMedicalCondition('');
    }
  }, [medicalConditions]);
  const medicalConditionOptions = [
    'None', 'Diabetes', 'Type 1 Diabetes', 'Type 2 Diabetes', 'Prediabetes', 'Gestational Diabetes',
    'High Blood Pressure', 'Low Blood Pressure', 'Heart Disease', 'Coronary Artery Disease', 'Heart Failure',
    'Kidney Disease', 'Chronic Kidney Disease', 'Kidney Stones', 'Liver Disease', 'Fatty Liver', 'Hepatitis',
    'High Cholesterol', 'High Triglycerides', 'Thyroid Disorders', 'Hypothyroidism', 'Hyperthyroidism', 'PCOS',
    'Gout', 'Acid Reflux/GERD', 'IBS (Irritable Bowel Syndrome)', 'IBD', 'Crohns Disease', 'Ulcerative Colitis',
    'Celiac Disease', 'Lactose Intolerance', 'Gluten Sensitivity', 'Gallbladder Disease', 'Pancreatitis',
    'Osteoporosis', 'Osteoarthritis', 'Rheumatoid Arthritis', 'Anemia', 'Iron Deficiency', 'B12 Deficiency',
    'Food Allergies', 'Nut Allergy', 'Seafood Allergy', 'Egg Allergy', 'Milk Allergy',
    'Pregnancy', 'Breastfeeding', 'Menopause', 'Endometriosis',
    'Obesity', 'Underweight', 'Eating Disorder', 'Anorexia', 'Bulimia',
    'Anxiety', 'Depression', 'Insomnia', 'Sleep Apnea',
    'Cancer', 'Autoimmune Disease', 'HIV/AIDS', 'Tuberculosis',
    'Asthma', 'COPD', 'Other'
  ];


  const addDiseaseRow = () => {
    const newRow: DiseaseEntry = { id: Math.random().toString(36).slice(2), disease: '', since: '', frequency: '', severity: '', grading: '', action: '' };
    onChange('diseaseHistory', [...diseaseHistory, newRow]);
  };
  const updateDiseaseRow = (id: string, field: keyof DiseaseEntry, value: string) => {
    onChange('diseaseHistory', diseaseHistory.map(r => r.id === id ? { ...r, [field]: value } : r));
  };
  const removeDiseaseRow = (id: string) => {
    onChange('diseaseHistory', diseaseHistory.filter(r => r.id !== id));
  };
  const toggleGutIssue = (issue: string) => {
    if (issue === 'none') {
      onChange('gutIssues', ['none']);
    } else {
      const next = gutIssues.includes(issue) ? gutIssues.filter(i => i !== issue && i !== 'none') : [...gutIssues.filter(i => i !== 'none'), issue];
      onChange('gutIssues', next);
    }
  };
  const addReport = async (file: File, customName: string, category: 'medical-report' | 'transformation' | 'other') => {
    // If we have a clientId, upload to server
    if (clientId) {
      try {
        let fileToUpload = file;

        // Compress image files before upload (reduces size significantly)
        if (file.type.startsWith('image/')) {
          try {
            // Validate the image file
            const validation = validateImageFile(file);
            if (!validation.valid) {
              toast.error(validation.error || 'Invalid image file');
              return;
            }

            // Compress the image (max 1200x1200, 80% quality)
            const compressedResult = await compressImage(file, {
              maxWidth: 1200,
              maxHeight: 1200,
              quality: 0.8
            });

            // Convert blob to File object
            fileToUpload = new File([compressedResult.blob], file.name, {
              type: compressedResult.blob.type,
              lastModified: Date.now()
            });

            // Show compression stats
            const originalSizeKB = Math.round(file.size / 1024);
            const compressedSizeKB = Math.round(compressedResult.compressedSize / 1024);
            if (compressedSizeKB < originalSizeKB) {
              console.log(`Image compressed: ${originalSizeKB}KB → ${compressedSizeKB}KB`);
            }
          } catch (compressionError) {
            console.warn('Image compression failed, uploading original:', compressionError);
            // Continue with original file if compression fails
          }
        }

        const formData = new FormData();
        formData.append('file', fileToUpload);
        formData.append('fileName', customName || file.name);
        formData.append('category', category);

        const response = await fetch(`/api/users/${clientId}/medical/upload`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          if (data.report) {
            onChange('reports', [...reports, data.report]);
            toast.success('Report uploaded successfully');
          }
        } else {
          const errorData = await response.json();
          console.error('Upload failed:', errorData);
          toast.error(errorData.error || 'Failed to upload report');
        }
      } catch (error) {
        console.error('Error uploading report:', error);
        toast.error('Error uploading report');
      }
    } else {
      // Fallback: just add to local state (for new clients)
      const newReport: UploadedReport = {
        id: Math.random().toString(36).slice(2),
        fileName: customName || file.name,
        uploadedOn: new Date().toISOString().split('T')[0],
        fileType: file.type || 'unknown',
        category: category,
      };
      onChange('reports', [...reports, newReport]);
    }
  };
  const removeReport = (id: string) => onChange('reports', reports.filter(r => r.id !== id));

  const handleViewReport = (report: UploadedReport) => {
    if (!report.url) {
      toast.error('File URL not available. Please save the form first.');
      return;
    }

    // Open file in new tab - let the browser handle errors
    const url = report.url.startsWith('/') ? window.location.origin + report.url : report.url;
    window.open(url, '_blank');
  };

  const handleDeleteReport = async (report: UploadedReport) => {
    if (!report.url) {
      // If no URL, just remove from local state
      removeReport(report.id);
      return;
    }

    try {
      setDeletingReportId(report.id);

      // Extract fileId from URL (e.g., /api/reports/12345 -> 12345)
      const fileId = report.url.split('/').pop();

      if (fileId && onDeleteReport) {
        await onDeleteReport(fileId);
      } else if (fileId) {
        // Fallback: call API directly
        const response = await fetch(`/api/reports/${fileId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          removeReport(report.id);
          toast.success('Report deleted successfully');
        } else {
          toast.error('Failed to delete report');
        }
      }
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error('Error deleting report');
    } finally {
      setDeletingReportId(null);
    }
  };
  const [uploadingFile, setUploadingFile] = React.useState(false);

  const handleReportInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFile(true);
    for (const f of Array.from(files)) {
      await addReport(f, pendingReportName, reportCategory);
    }
    setUploadingFile(false);
    setPendingReportName('');
    setReportCategory('medical-report');
    e.target.value = '';
  };
  const [pendingReportName, setPendingReportName] = React.useState('');

  // Filter reports by category
  const filteredReports = categoryFilter === 'all'
    ? reports
    : reports.filter(r => r.category === categoryFilter);

  return (
    <Card className="border-0 shadow-lg rounded-xl overflow-hidden">
      <CardHeader className="bg-linear-to-r from-emerald-500 to-emerald-600 py-4 px-4 sm:px-6">
        <CardTitle className="text-lg sm:text-xl font-bold text-white">Medical Information</CardTitle>
        <CardDescription className="text-blue-100 text-sm">Health conditions and dietary restrictions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 px-4 sm:px-6">
        <div>
          <Label htmlFor="medicalConditions">Medical Conditions</Label>
          <div className="mt-2 border rounded-md p-3 bg-gray-50">
            <div className="flex flex-wrap gap-2">
              {medicalConditionOptions.map(opt => {
                const isSelected = selectedMedical.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      // Handle "None" selection - clears other selections
                      if (opt === 'None') {
                        setSelectedMedical(['None']);
                        onChange('medicalConditions', 'None');
                        return;
                      }
                      // Remove "None" if selecting another option
                      let next = isSelected
                        ? selectedMedical.filter(s => s !== opt)
                        : [...selectedMedical.filter(s => s !== 'None'), opt];
                      setSelectedMedical(next);
                      onChange('medicalConditions', next.join(', '));
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isSelected ? 'bg-red-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:border-red-400 hover:bg-red-50'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {/* Other medical condition input */}
            {selectedMedical.includes('Other') && (
              <div className="mt-3 pt-2 border-t">
                <Input
                  placeholder="Please specify other medical condition..."
                  value={otherMedicalCondition}
                  onChange={e => {
                    setOtherMedicalCondition(e.target.value);
                    const otherConditions = selectedMedical.filter(s => s !== 'Other' && !s.startsWith('Other: '));
                    if (e.target.value.trim()) {
                      onChange('medicalConditions', [...otherConditions, `Other: ${e.target.value}`].join(', '));
                    } else {
                      onChange('medicalConditions', [...otherConditions, 'Other'].join(', '));
                    }
                  }}
                  className="mt-2"
                />
              </div>
            )}
            {selectedMedical.length > 0 && (
              <div className="mt-3 pt-2 border-t text-xs text-gray-500">
                Selected: <span className="font-medium text-gray-700">{selectedMedical.join(', ')}{otherMedicalCondition && selectedMedical.includes('Other') ? ` (${otherMedicalCondition})` : ''}</span>
              </div>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="allergies">Allergies</Label>
          <Input id="allergies" value={allergies} onChange={e => onChange('allergies', e.target.value)} placeholder="Nuts, dairy, shellfish, etc. (comma separated)" />
        </div>
        <div>
          <Label htmlFor="dietaryRestrictions">Dietary Restrictions</Label>
          <div className="mt-2 border rounded-md p-3 bg-gray-50">
            <div className="flex flex-wrap gap-2">
              {dietaryOptions.map(opt => {
                const isSelected = selectedDietary.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const next = isSelected ? selectedDietary.filter(s => s !== opt) : [...selectedDietary, opt];
                      setSelectedDietary(next);
                      onChange('dietaryRestrictions', next.join(', '));
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isSelected ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:border-emerald-400 hover:bg-emerald-50'}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {selectedDietary.length > 0 && (
              <div className="mt-3 pt-2 border-t text-xs text-gray-500">
                Selected: <span className="font-medium text-gray-700">{selectedDietary.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
        {/* Disease History Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Disease History</Label>
            <Button type="button" variant="outline" size="sm" onClick={addDiseaseRow}>Add</Button>
          </div>
          <div className="overflow-auto border rounded-md">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="p-2">Disease</th>
                  <th className="p-2">Since</th>
                  <th className="p-2">Frequency</th>
                  <th className="p-2">Severity</th>
                  <th className="p-2">Grading</th>
                  <th className="p-2">Action</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {diseaseHistory.map(row => (
                  <tr key={row.id} className="border-t">
                    <td className="p-1"><Input value={row.disease} onChange={e => updateDiseaseRow(row.id, 'disease', e.target.value)} placeholder="Disease" className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={row.since} onChange={e => updateDiseaseRow(row.id, 'since', e.target.value)} placeholder="YYYY" className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={row.frequency} onChange={e => updateDiseaseRow(row.id, 'frequency', e.target.value)} placeholder="Freq" className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={row.severity} onChange={e => updateDiseaseRow(row.id, 'severity', e.target.value)} placeholder="Severity" className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={row.grading} onChange={e => updateDiseaseRow(row.id, 'grading', e.target.value)} placeholder="Grade" className="h-8 text-xs" /></td>
                    <td className="p-1"><Input value={row.action} onChange={e => updateDiseaseRow(row.id, 'action', e.target.value)} placeholder="Action" className="h-8 text-xs" /></td>
                    <td className="p-1"><Button type="button" variant="ghost" size="sm" onClick={() => removeDiseaseRow(row.id)}>✕</Button></td>
                  </tr>
                ))}
                {diseaseHistory.length === 0 && (
                  <tr><td colSpan={7} className="p-3 text-center text-gray-500">No disease history added.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Any Medical History</Label>
            <Textarea value={medicalHistory} onChange={e => onChange('medicalHistory', e.target.value)} rows={2} placeholder="Past surgeries, hospitalizations..." />
          </div>
          <div>
            <Label>Family History</Label>
            <Textarea value={familyHistory} onChange={e => onChange('familyHistory', e.target.value)} rows={2} placeholder="Family diseases..." />
          </div>
        </div>
        <div>
          <Label>Any Medication</Label>
          <Textarea value={medication} onChange={e => onChange('medication', e.target.value)} rows={2} placeholder="Current medications..." />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <Label>Blood Group</Label>
            <Input value={bloodGroup} onChange={e => onChange('bloodGroup', e.target.value)} placeholder="A+" />
          </div>
          <div className="sm:col-span-2">
            <Label>Gut Issues *</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {['Acidity', 'Bloating', 'Constipation', 'None'].map(issue => {
                const val = issue.toLowerCase();
                const selected = gutIssues.includes(val);
                return (
                  <Button key={val} type="button" size="sm" variant={selected ? 'default' : 'outline'} onClick={() => toggleGutIssue(val)}>{issue}</Button>
                );
              })}
            </div>
          </div>
        </div>
        {clientGender === 'female' && (
          <div className="space-y-4 border-t pt-4">
            <h4 className="font-semibold text-gray-900">Assessment Questions (Female Only)</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isPregnant" checked={isPregnant} onChange={e => onChange('isPregnant', e.target.checked)} className="h-4 w-4" />
                <Label htmlFor="isPregnant">Are you pregnant?</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isLactating" checked={isLactating} onChange={e => onChange('isLactating', e.target.checked)} className="h-4 w-4" />
                <Label htmlFor="isLactating">Are you lactating?</Label>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>How Is Your Menstrual Cycle? *</Label>
                <Select value={menstrualCycle} onValueChange={val => onChange('menstrualCycle', val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="irregular">Irregular</SelectItem>
                    <SelectItem value="not-applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>How Is The Flow Of Blood? *</Label>
                <Select value={bloodFlow} onValueChange={val => onChange('bloodFlow', val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="heavy">Heavy</SelectItem>
                    <SelectItem value="not-applicable">Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}
        {/* Reports Upload */}
        <div className="space-y-3">
          <Label>Upload Documents</Label>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Input placeholder="File Name (Optional)" value={pendingReportName} onChange={e => setPendingReportName(e.target.value)} className="flex-1" disabled={uploadingFile} />
              <Select value={reportCategory} onValueChange={(v: 'medical-report' | 'other') => setReportCategory(v)}>
                <SelectTrigger className="w-45">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="file" multiple onChange={handleReportInput} className="flex-1" disabled={uploadingFile} />
              {uploadingFile && <span className="text-sm text-gray-500">Uploading...</span>}
            </div>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Filter:</span>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-45 h-8">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Documents</SelectItem>
                {REPORT_CATEGORIES.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-md overflow-hidden">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="p-2">File Name</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Uploaded On</th>
                  <th className="p-2">File Type</th>
                  <th className="p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.fileName}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.category === 'other'
                        ? 'bg-gray-100 text-gray-700'
                        : 'bg-blue-100 text-blue-700'
                        }`}>
                        {r.category === 'other' ? 'Other' : 'Medical Report'}
                      </span>
                    </td>
                    <td className="p-2">{r.uploadedOn}</td>
                    <td className="p-2">{r.fileType}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleViewReport(r)}
                          disabled={!r.url}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteReport(r)}
                          disabled={deletingReportId === r.id}
                          className="text-red-600 hover:text-red-800 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          {deletingReportId === r.id ? 'Deleting...' : 'Remove'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr><td colSpan={5} className="p-3 text-center text-gray-500">No documents uploaded.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <Label htmlFor="notes">Additional Notes</Label>
          <Textarea id="notes" value={notes} onChange={e => onChange('notes', e.target.value)} rows={3} placeholder="Any additional information about the client..." />
        </div>
        <div className="flex justify-end pt-6 border-t border-gray-200 mt-6">
          <Button type="button" onClick={onSave} disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-md hover:shadow-lg transition-all">    <Save className="mr-2 h-4 w-4" />
            Save Medical
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
export default MedicalForm;





