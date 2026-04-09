"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, User, Phone, Mail, Calendar, MapPin, Target, Ruler, Weight, Activity } from 'lucide-react';
import type { BasicInfoData } from './BasicInfoForm';

const fmt = (v: string | undefined | null) => v && v !== 'none' && v !== 'not-specified' ? v : '—';
const fmtLabel = (v: string) => v?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '—';

interface BasicInfoDashboardProps {
  data: BasicInfoData;
  onEdit: () => void;
}

function InfoItem({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {Icon && <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function BasicInfoDashboard({ data, onEdit }: BasicInfoDashboardProps) {
  // Parse height values - ensure they are valid numbers
  const feetNum = Math.floor(parseFloat(data.heightFeet || '0') || 0);
  const inchNum = Math.min(11, Math.max(0, Math.round(parseFloat(data.heightInch || '0') || 0)));

  // Use stored heightCm if available, otherwise compute from ft/inch
  const storedCm = parseFloat(data.heightCm || '0');
  const computedFromFtIn = feetNum > 0 || inchNum > 0 ? (feetNum * 12 + inchNum) * 2.54 : 0;
  const finalCm = storedCm > 0 ? storedCm : computedFromFtIn;
  const displayCm = finalCm > 0 ? finalCm.toFixed(1) : '';

  const hMeters = finalCm / 100;
  const wKg = parseFloat(data.weightKg || '0');

  // Use stored BMI if available, otherwise compute
  const storedBmi = parseFloat(data.bmi || '0');
  const computedBmi = hMeters > 0 && wKg > 0 ? wKg / (hMeters * hMeters) : 0;
  const finalBmi = storedBmi > 0 ? storedBmi : computedBmi;
  const displayBmi = finalBmi > 0 ? finalBmi.toFixed(1) : '';

  // Use stored idealWeightKg if available, otherwise compute (height in cm - 100)
  const storedIdeal = parseFloat(data.idealWeightKg || '0');
  const computedIdeal = finalCm > 0 ? finalCm - 100 : 0;
  const finalIdeal = storedIdeal > 0 ? storedIdeal : computedIdeal;
  const displayIdeal = finalIdeal > 0 ? finalIdeal.toFixed(1) : '';

  // For display, derive feet/inch from stored cm if ft/inch are invalid
  let displayFeet = feetNum;
  let displayInch = inchNum;
  if (storedCm > 0 && (feetNum === 0 && inchNum === 0 || inchNum > 11 || String(data.heightFeet).includes('.'))) {
    const totalInches = storedCm / 2.54;
    displayFeet = Math.floor(totalInches / 12);
    displayInch = Math.round(totalInches % 12);
  }

  const formattedDOB = data.dateOfBirth
    ? new Date(data.dateOfBirth).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : '—';

  const formattedAnniversary = data.anniversary
    ? new Date(data.anniversary).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : '—';

  const phoneDisplay = data.phone || '—';

  return (
    <Card className="border-0 shadow-lg rounded-xl overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-emerald-500 to-emerald-600 py-4 px-4 sm:px-6 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg sm:text-xl font-bold text-white">Basic Information</CardTitle>
          <p className="text-emerald-100 text-sm">Client&apos;s personal details</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onEdit} className="bg-white/20 hover:bg-white/30 text-white border-0">
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Edit
        </Button>
      </CardHeader>
      <CardContent className="px-4 sm:px-6 py-5 space-y-5">
        {/* Personal Information */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Personal</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1">
            <InfoItem icon={User} label="Full Name" value={`${fmt(data.firstName)} ${fmt(data.lastName)}`} />
            <InfoItem icon={Mail} label="Email" value={fmt(data.email)} />
            <InfoItem icon={Phone} label="Phone" value={phoneDisplay} />
            <InfoItem icon={Calendar} label="Date of Birth" value={formattedDOB} />
            <InfoItem label="Gender" value={fmtLabel(data.gender)} />
            <InfoItem label="Marital Status" value={fmtLabel(data.maritalStatus)} />
            <InfoItem label="Occupation" value={fmt(data.occupation)} />
            <InfoItem label="Source" value={fmtLabel(data.source)} />
          </div>
        </div>

        {/* Contact Extras */}
        {(data.altPhone || data.altEmails || data.parentAccount || data.anniversary) && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Additional Contact</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1">
              {data.altPhone && <InfoItem icon={Phone} label="Alt Phone" value={data.altPhone} />}
              {data.altEmails && <InfoItem icon={Mail} label="Alt Emails" value={data.altEmails} />}
              {data.parentAccount && <InfoItem label="Parent Account" value={data.parentAccount} />}
              {data.anniversary && <InfoItem icon={Calendar} label="Anniversary" value={formattedAnniversary} />}
              {data.referralSource && <InfoItem label="Referral Source" value={data.referralSource} />}
            </div>
          </div>
        )}

        {/* Physical Measurements */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Physical Measurements</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <Ruler className="h-4 w-4 mx-auto text-blue-500 mb-1" />
              <p className="text-xs text-gray-500">Height</p>
              <p className="text-sm font-bold text-gray-900">
                {displayFeet > 0 || displayInch > 0 ? `${displayFeet}'${displayInch}"` : '—'}
              </p>
              {displayCm && (
                <p className="text-xs text-gray-400">{displayCm} cm</p>
              )}
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <Weight className="h-4 w-4 mx-auto text-green-500 mb-1" />
              <p className="text-xs text-gray-500">Weight</p>
              <p className="text-sm font-bold text-gray-900">{wKg > 0 ? `${wKg} kg` : '—'}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <Target className="h-4 w-4 mx-auto text-orange-500 mb-1" />
              <p className="text-xs text-gray-500">Target</p>
              <p className="text-sm font-bold text-gray-900">{data.targetWeightKg ? `${data.targetWeightKg} kg` : '—'}</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">BMI</p>
              <p className="text-sm font-bold text-gray-900">{displayBmi || '—'}</p>
            </div>
            <div className="bg-cyan-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">Ideal Weight</p>
              <p className="text-sm font-bold text-gray-900">{displayIdeal ? `${displayIdeal} kg` : '—'}</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center">
              <Activity className="h-4 w-4 mx-auto text-amber-500 mb-1" />
              <p className="text-xs text-gray-500">Activity</p>
              <p className="text-sm font-bold text-gray-900">{fmtLabel(data.activityLevel)}</p>
            </div>
          </div>
        </div>

        {/* Goals */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Goals</h4>
          <div className="flex flex-wrap items-center gap-2">
            {data.generalGoal && data.generalGoal !== 'none' && data.generalGoal !== 'not-specified' && (
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">{fmtLabel(data.generalGoal)}</Badge>
            )}
            {data.goalsList?.filter(g => g).map(g => (
              <Badge key={g} variant="outline" className="border-orange-300 text-orange-700">{fmtLabel(g)}</Badge>
            ))}
            {data.targetWeightBucket && data.targetWeightBucket !== 'none' && (
              <Badge variant="outline" className="border-blue-300 text-blue-700">Target: {fmtLabel(data.targetWeightBucket)} Kgs</Badge>
            )}
            {(!data.generalGoal || data.generalGoal === 'none' || data.generalGoal === 'not-specified') && (!data.goalsList || data.goalsList.length === 0) && (
              <span className="text-sm text-gray-400">No goals set</span>
            )}
          </div>
          {data.sharePhotoConsent && (
            <p className="text-xs text-green-600 mt-2">✓ Consented to share photos for analysis</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
