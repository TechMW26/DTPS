'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, User, HeartPulse, Utensils, ClipboardList } from 'lucide-react';

// ✅ FIXED IMPORTS — default components
import BasicInfoForm, { type BasicInfoData } from '@/components/clients/BasicInfoForm';
import MedicalForm, { type MedicalData } from '@/components/clients/MedicalForm';
import LifestyleForm, { type LifestyleData } from '@/components/clients/LifestyleForm';
import RecallForm, { type RecallEntry } from '@/components/clients/RecallForm';
import BasicInfoDashboard from '@/components/clients/BasicInfoDashboard';
import MedicalDashboard from '@/components/clients/MedicalDashboard';
import LifestyleDashboard from '@/components/clients/LifestyleDashboard';

interface FormsSectionProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  basicInfo: BasicInfoData;
  medicalData: MedicalData;
  lifestyleData: LifestyleData;
  recallEntries: RecallEntry[];
  setBasicInfo: (data: BasicInfoData | ((prev: BasicInfoData) => BasicInfoData)) => void;
  setMedicalData: (data: MedicalData | ((prev: MedicalData) => MedicalData)) => void;
  setLifestyleData: (data: LifestyleData | ((prev: LifestyleData) => LifestyleData)) => void;
  setRecallEntries: (entries: RecallEntry[]) => void;
  handleSave: () => Promise<void>;
  handleSaveRecallEntry?: (entry: RecallEntry) => Promise<void>;
  handleDeleteRecallEntry?: (entryId: string) => Promise<void>;
  loading: boolean;
  clientId?: string;
  userRole?: 'client' | 'dietitian';
  onRegisterReset?: (fn: () => void) => void;
}

export default function FormsSection({
  activeTab,
  setActiveTab,
  basicInfo,
  medicalData,
  lifestyleData,
  recallEntries,
  setBasicInfo,
  setMedicalData,
  setLifestyleData,
  setRecallEntries,
  handleSave,
  handleSaveRecallEntry,
  handleDeleteRecallEntry,
  loading,
  clientId,
  userRole = 'client',
  onRegisterReset
}: FormsSectionProps) {
  const [showUnfilledPopup, setShowUnfilledPopup] = useState(false);
  const [editingTab, setEditingTab] = useState<Record<string, boolean>>({});

  // Register reset callback for floating back button
  useEffect(() => {
    if (onRegisterReset) {
      onRegisterReset(() => {
        setActiveTab('basic-details');
      });
    }
  }, [onRegisterReset, setActiveTab]);

  // Check if each form is filled (updated for new structure)
  const isBasicInfoFilled = !!(basicInfo.firstName && basicInfo.lastName && basicInfo.email && basicInfo.weightKg && basicInfo.heightFeet);
  const isMedicalFilled = !!(medicalData.bloodGroup || medicalData.medicalConditions || medicalData.allergies || medicalData.medicalHistory);
  const isLifestyleFilled = !!(lifestyleData.foodPreference || lifestyleData.preferredCuisine?.length > 0);
  const isRecallFilled = recallEntries.length > 0 && recallEntries.some(e => e.food);

  // Get list of unfilled forms
  const getUnfilledForms = () => {
    const unfilled: { name: string; tab: string }[] = [];
    if (!isBasicInfoFilled) unfilled.push({ name: 'Basic Details', tab: 'basic-details' });
    if (!isMedicalFilled) unfilled.push({ name: 'Medical Info', tab: 'medical-info' });
    if (!isLifestyleFilled) unfilled.push({ name: 'Lifestyle', tab: 'lifestyle' });
    if (!isRecallFilled) unfilled.push({ name: 'Recall', tab: 'recall' });
    return unfilled;
  };

  // Handle save with unfilled form check
  const handleSaveWithCheck = async () => {
    const unfilled = getUnfilledForms();
    if (unfilled.length > 0) {
      setShowUnfilledPopup(true);
    } else {
      await handleSave();
    }
  };

  // Force save despite unfilled forms
  const handleForceSave = async () => {
    setShowUnfilledPopup(false);
    await handleSave();
  };

  return (
    <div className="mt-6">
      {/* Unfilled Forms Popup */}
      <Dialog open={showUnfilledPopup} onOpenChange={setShowUnfilledPopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Incomplete Forms
            </DialogTitle>
            <DialogDescription>
              The following forms are not completely filled. Please fill them for better service:
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 py-4">
            {getUnfilledForms().map(form => (
              <Button 
                key={form.tab}
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setShowUnfilledPopup(false);
                  setActiveTab(form.tab);
                }}
                className="text-amber-700 border-amber-300 hover:bg-amber-100"
              >
                {form.name}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowUnfilledPopup(false)}>
              Cancel
            </Button>
            <Button onClick={handleForceSave} disabled={loading}>
              Save Anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full gap-2 sm:gap-3 bg-slate-100 p-1.5 rounded-xl h-auto flex-wrap sm:flex-nowrap">
          <TabsTrigger 
            value="basic-details"
            className={`flex-1 min-w-30 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium transition-all
              data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md
              data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-white/50
              ${!isBasicInfoFilled ? 'data-[state=inactive]:text-amber-600' : ''}`}
          >
            <User className="h-4 w-4" />
            <span>Basic Details</span>
            {!isBasicInfoFilled && <span className="text-amber-500">⚠️</span>}
          </TabsTrigger>
          <TabsTrigger 
            value="medical-info"
            className={`flex-1 min-w-25 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium transition-all
              data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md
              data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-white/50
              ${!isMedicalFilled ? 'data-[state=inactive]:text-amber-600' : ''}`}
          >
            <HeartPulse className="h-4 w-4" />
            <span>Medical</span>
            {!isMedicalFilled && <span className="text-amber-500">⚠️</span>}
          </TabsTrigger>
          <TabsTrigger 
            value="lifestyle"
            className={`flex-1 min-w-25 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium transition-all
              data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md
              data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-white/50
              ${!isLifestyleFilled ? 'data-[state=inactive]:text-amber-600' : ''}`}
          >
            <Utensils className="h-4 w-4" />
            <span>Lifestyle</span>
            {!isLifestyleFilled && <span className="text-amber-500">⚠️</span>}
          </TabsTrigger>
          <TabsTrigger 
            value="recall"
            className={`flex-1 min-w-20 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs sm:text-sm font-medium transition-all
              data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md
              data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-white/50
              ${!isRecallFilled ? 'data-[state=inactive]:text-amber-600' : ''}`}
          >
            <ClipboardList className="h-4 w-4" />
            <span>Recall</span>
            {!isRecallFilled && <span className="text-amber-500">⚠️</span>}
          </TabsTrigger>
        </TabsList>

        {/* Basic Details - forceMount keeps component alive, hidden via CSS */}
        <TabsContent value="basic-details" className="mt-6" forceMount style={{ display: activeTab === 'basic-details' ? 'block' : 'none' }}>
          {editingTab['basic-details'] ? (
            <BasicInfoForm
              {...basicInfo}
              onChange={(field, value) => setBasicInfo(prev => ({ ...prev, [field]: value }))}
              onSave={async () => {
                await handleSaveWithCheck();
                setEditingTab(prev => ({ ...prev, 'basic-details': false }));
              }}
              loading={loading}
              disableEmail
              disablePhone
            />
          ) : (
            <BasicInfoDashboard data={basicInfo} onEdit={() => setEditingTab(prev => ({ ...prev, 'basic-details': true }))} />
          )}
        </TabsContent>

        {/* Medical Info */}
        <TabsContent value="medical-info" className="mt-6" forceMount style={{ display: activeTab === 'medical-info' ? 'block' : 'none' }}>
          {editingTab['medical-info'] ? (
            <MedicalForm
              {...medicalData}
              onChange={(field, value) => setMedicalData(prev => ({ ...prev, [field]: value }))}
              onSave={async () => {
                await handleSaveWithCheck();
                setEditingTab(prev => ({ ...prev, 'medical-info': false }));
              }}
              loading={loading}
              clientGender={basicInfo.gender}
              clientId={clientId}
            />
          ) : (
            <MedicalDashboard data={medicalData} onEdit={() => setEditingTab(prev => ({ ...prev, 'medical-info': true }))} clientGender={basicInfo.gender} />
          )}
        </TabsContent>

        {/* Lifestyle */}
        <TabsContent value="lifestyle" className="mt-6" forceMount style={{ display: activeTab === 'lifestyle' ? 'block' : 'none' }}>
          {editingTab['lifestyle'] ? (
            <LifestyleForm
              {...lifestyleData}
              onChange={(field, value) => setLifestyleData(prev => ({ ...prev, [field]: value }))}
              onSave={async () => {
                await handleSaveWithCheck();
                setEditingTab(prev => ({ ...prev, 'lifestyle': false }));
              }}
              loading={loading}
            />
          ) : (
            <LifestyleDashboard data={lifestyleData} onEdit={() => setEditingTab(prev => ({ ...prev, 'lifestyle': true }))} />
          )}
        </TabsContent>

        {/* Recall */}
        <TabsContent value="recall" className="mt-6" forceMount style={{ display: activeTab === 'recall' ? 'block' : 'none' }}>
          <RecallForm
            entries={recallEntries}
            onChange={setRecallEntries}
            onSave={handleSaveWithCheck}
            onSaveEntry={handleSaveRecallEntry}
            onDeleteEntry={handleDeleteRecallEntry}
            loading={loading}
            userRole={userRole}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
