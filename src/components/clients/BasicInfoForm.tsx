// Updated BasicInfoForm where generalGoal is NOT saved and NOT shown as selected
"use client";
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Save } from 'lucide-react';

// Goal category interface for dynamic loading
interface GoalCategory {
  _id: string;
  name: string;
  value: string;
  isActive: boolean;
}

// Default fallback goals if API fails
const defaultGoals: GoalCategory[] = [
  { _id: '1', name: 'Weight Loss', value: 'weight-loss', isActive: true },
  { _id: '2', name: 'Weight Gain', value: 'weight-gain', isActive: true },
  { _id: '3', name: 'Muscle Gain', value: 'muscle-gain', isActive: true },
  { _id: '4', name: 'Maintain Weight', value: 'maintain-weight', isActive: true },
  { _id: '5', name: 'Disease Management', value: 'disease-management', isActive: true },
];

export interface BasicInfoData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  parentAccount: string;
  altPhone: string;
  altEmails: string;
  anniversary: string;
  source: string;
  referralSource: string;
  generalGoal: string; // Goal text or enum
  maritalStatus: string;
  occupation: string;
  goalsList: string[];
  targetWeightBucket: string;
  sharePhotoConsent: boolean;
  // Physical measurements (moved from lifestyle)
  heightFeet: string;
  heightInch: string;
  heightCm: string;
  weightKg: string;
  targetWeightKg: string;
  idealWeightKg: string;
  bmi: string;
  activityLevel: string;
}

interface BasicInfoFormProps extends BasicInfoData {
  onChange: (field: keyof BasicInfoData, value: any) => void;
  onSave: () => void;
  loading?: boolean;
  disableEmail?: boolean;
  disablePhone?: boolean;
  disableFirstWeight?: boolean;
  hideFirstWeightField?: boolean;
  currentWeightKg?: number | null;
  userRole?: 'client' | 'dietitian' | 'health_counselor' | 'admin';
}

export function BasicInfoForm({ firstName, lastName, email, phone, dateOfBirth, gender, parentAccount, altPhone, altEmails, anniversary, source, referralSource, generalGoal, maritalStatus, occupation, goalsList, targetWeightBucket, sharePhotoConsent, heightFeet, heightInch, heightCm, weightKg, targetWeightKg, idealWeightKg, bmi, activityLevel, onChange, onSave, loading, disableEmail = false, disablePhone = false, disableFirstWeight = false, hideFirstWeightField = false, currentWeightKg = null, userRole = 'client' }: BasicInfoFormProps) {
  const [goalCategories, setGoalCategories] = useState<GoalCategory[]>(defaultGoals);

  // Fetch dynamic goal categories with better error handling
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchGoalCategories = async () => {
      try {
        const response = await fetch('/api/admin/goal-categories?active=true', {
          signal: controller.signal,
          credentials: 'same-origin',
        });
        if (response.ok && isMounted) {
          const data = await response.json();
          if (data && data.length > 0) {
            setGoalCategories(data);
          }
        }
      } catch (error: any) {
        // Ignore abort errors and network errors silently - we have default fallback
        if (error?.name !== 'AbortError') {
          console.warn('Using default goal categories');
        }
      }
    };

    // Small delay to ensure session is ready
    const timeoutId = setTimeout(fetchGoalCategories, 100);

    return () => {
      isMounted = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, []);

  const formattedDOB = dateOfBirth ? new Date(dateOfBirth).toISOString().split("T")[0] : "";

  const formattedAN = anniversary ? new Date(anniversary).toISOString().split("T")[0] : "";

  // Height field values - show empty when no value (never show 0 as default)
  const isEmptyValue = (val: any) => val === '' || val === null || val === undefined || val === '0' || val === 0;
  const displayHeightFeet = isEmptyValue(heightFeet) ? '' : String(heightFeet);
  const displayHeightInch = isEmptyValue(heightInch) ? '' : String(heightInch);
  const displayHeightCm = isEmptyValue(heightCm) ? '' : String(heightCm);

  // BMI calculation - auto-calculate from weight and height
  const calculateBMI = (weightKgVal: string, heightCmVal: string): string => {
    const w = parseFloat(weightKgVal || '0');
    const h = parseFloat(heightCmVal || '0');
    if (!w || !h || h === 0) return '';
    const heightM = h / 100;
    const bmiVal = w / (heightM * heightM);
    return bmiVal.toFixed(1);
  };

  // Ideal weight calculation (height in cm - 100)
  const calculateIdealWeight = (heightCmVal: string): string => {
    const h = parseFloat(heightCmVal || '0');
    if (!h || h === 0) return '';
    return (h - 100).toFixed(1);
  };

  const hCmNum = parseFloat(displayHeightCm || '0');
  const wKg = parseFloat(weightKg || '0');
  const computedBmi = calculateBMI(weightKg, displayHeightCm || heightCm);
  const computedIdeal = hCmNum > 0 ? (hCmNum - 100).toFixed(1) : idealWeightKg;

  // Update BMI and ideal weight when height or weight changes
  const updateDerivedValues = (newHeightCm: string, newWeightKg?: string) => {
    const w = newWeightKg !== undefined ? newWeightKg : weightKg;
    const newBmi = calculateBMI(w, newHeightCm);
    const newIdeal = calculateIdealWeight(newHeightCm);
    if (newBmi) onChange('bmi', newBmi);
    if (newIdeal) onChange('idealWeightKg', newIdeal);
  };

  const handleHeightFeetChange = (value: string) => {
    // Parse as integer for feet - only accept whole numbers
    const ft = Math.floor(Math.abs(parseFloat(value) || 0));
    const inch = Math.min(11, Math.max(0, Math.round(parseFloat(String(heightInch)) || 0)));
    const totalInches = (ft * 12) + inch;
    const cm = Math.round(totalInches * 2.54);

    // Always store as integer string
    onChange('heightFeet', ft > 0 ? String(ft) : '');
    // Set cm - only show value if conversion produces non-zero result
    const newCm = cm > 0 ? String(cm) : '';
    onChange('heightCm', newCm);
    // Update BMI and ideal weight
    if (newCm) updateDerivedValues(newCm);
  };

  const handleHeightInchChange = (value: string) => {
    // Parse and clamp inches to 0-11 as integer
    const ft = Math.floor(Math.abs(parseFloat(String(heightFeet)) || 0));
    let inch = Math.round(Math.abs(parseFloat(value) || 0));
    inch = Math.min(11, Math.max(0, inch));
    const totalInches = (ft * 12) + inch;
    const cm = Math.round(totalInches * 2.54);

    // Always store as clamped integer string
    onChange('heightInch', String(inch));
    // Set cm - only show value if conversion produces non-zero result
    const newCm = cm > 0 ? String(cm) : '';
    onChange('heightCm', newCm);
    // Update BMI and ideal weight
    if (newCm) updateDerivedValues(newCm);
  };

  const handleHeightCmChange = (value: string) => {
    const cm = parseFloat(value) || 0;
    const totalInches = cm / 2.54;
    const ft = Math.floor(totalInches / 12);
    const inch = Math.round(totalInches % 12);

    // Set cm value - keep empty if user clears it
    onChange('heightCm', value);
    // Set ft and inch - only show values if conversion produces non-zero results
    onChange('heightFeet', ft > 0 ? String(ft) : '');
    onChange('heightInch', inch >= 0 ? String(inch) : '');
    // Update BMI and ideal weight
    if (value) updateDerivedValues(value);
  };

  // Handle weight change - also update BMI
  const handleWeightChange = (value: string) => {
    onChange('weightKg', value);
    // Update BMI with current height
    const currentCm = displayHeightCm || heightCm;
    if (currentCm && value) {
      const newBmi = calculateBMI(value, currentCm);
      if (newBmi) onChange('bmi', newBmi);
    }
  };

  return (
    <Card className="border-0 shadow-lg rounded-xl overflow-hidden">
      <CardHeader className="bg-linear-to-r from-emerald-500 to-emerald-600 py-4 px-4 sm:px-6">
        <CardTitle className="text-lg sm:text-xl font-bold text-white">Basic Information</CardTitle>
        <CardDescription className="text-blue-100 text-sm">Client's personal details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First Name *</Label>
            <Input id="firstName" value={firstName} onChange={e => onChange('firstName', e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input id="lastName" value={lastName} onChange={e => onChange('lastName', e.target.value)} required />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={e => onChange('email', e.target.value)} disabled={disableEmail} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone *</Label>
          <div className="flex gap-2">
            <Select
              value={(() => {
                if (!phone) return '+91';
                // Match country codes: +91, +1, +44, +971, +65, +61, +49, +33 (order by length desc for proper matching)
                const match = phone.match(/^\+(971|91|44|65|61|49|33|1)/);
                return match ? `+${match[1]}` : '+91';
              })()}
              onValueChange={(code) => {
                if (disablePhone) return;
                // Extract just the number part using specific country code patterns
                const codeMatch = phone?.match(/^\+(971|91|44|65|61|49|33|1)/);
                const currentCode = codeMatch ? `+${codeMatch[1]}` : '';
                const currentNumber = currentCode ? phone?.replace(currentCode, '').replace(/^[\s-]?/, '').trim() : phone?.trim() || '';
                onChange('phone', `${code}${currentNumber}`);
              }}
              disabled={disablePhone}
            >
              <SelectTrigger className="w-25">
                <SelectValue placeholder="Code" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="+91">🇮🇳 +91</SelectItem>
                <SelectItem value="+1">🇺🇸 +1</SelectItem>
                <SelectItem value="+44">🇬🇧 +44</SelectItem>
                <SelectItem value="+971">🇦🇪 +971</SelectItem>
                <SelectItem value="+65">🇸🇬 +65</SelectItem>
                <SelectItem value="+61">🇦🇺 +61</SelectItem>
                <SelectItem value="+49">🇩🇪 +49</SelectItem>
                <SelectItem value="+33">🇫🇷 +33</SelectItem>
              </SelectContent>
            </Select>
            <Input
              id="phone"
              className="flex-1"
              value={(() => {
                if (!phone) return '';
                // Remove specific country code prefix and any space/dash after it
                const codeMatch = phone.match(/^\+(971|91|44|65|61|49|33|1)/);
                if (codeMatch) {
                  return phone.replace(`+${codeMatch[1]}`, '').replace(/^[\s-]?/, '').trim();
                }
                return phone.trim();
              })()}
              onChange={e => {
                if (disablePhone) return;
                // Extract country code from current phone or default to +91
                const match = phone?.match(/^\+(971|91|44|65|61|49|33|1)/);
                const code = match ? `+${match[1]}` : '+91';
                onChange('phone', `${code}${e.target.value}`);
              }}
              placeholder="9000000000"
              required
              disabled={disablePhone}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <Input id="dateOfBirth" type="date" value={formattedDOB} onChange={e => onChange('dateOfBirth', e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gender">Gender</Label>
            <Select value={gender} onValueChange={val => onChange('gender', val)}>
              <SelectTrigger>
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
                <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="parentAccount">Parent Account</Label>
            <Input id="parentAccount" value={parentAccount} onChange={e => onChange('parentAccount', e.target.value)} placeholder="Parent name or ID" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="altPhone">Alternative Phone Number</Label>
            <div className="flex gap-2">
              <Select
                value={(() => {
                  if (!altPhone) return '+91';
                  const match = altPhone.match(/^\+(971|91|44|65|61|49|33|1)/);
                  return match ? `+${match[1]}` : '+91';
                })()}
                onValueChange={(code) => {
                  const codeMatch = altPhone?.match(/^\+(971|91|44|65|61|49|33|1)/);
                  const currentCode = codeMatch ? `+${codeMatch[1]}` : '';
                  const currentNumber = currentCode ? altPhone?.replace(currentCode, '').replace(/^[\s-]?/, '').trim() : altPhone?.trim() || '';
                  onChange('altPhone', `${code}${currentNumber}`);
                }}
              >
                <SelectTrigger className="w-25">
                  <SelectValue placeholder="Code" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="+91">🇮🇳 +91</SelectItem>
                  <SelectItem value="+1">🇺🇸 +1</SelectItem>
                  <SelectItem value="+44">🇬🇧 +44</SelectItem>
                  <SelectItem value="+971">🇦🇪 +971</SelectItem>
                  <SelectItem value="+65">🇸🇬 +65</SelectItem>
                  <SelectItem value="+61">🇦🇺 +61</SelectItem>
                  <SelectItem value="+49">🇩🇪 +49</SelectItem>
                  <SelectItem value="+33">🇫🇷 +33</SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="altPhone"
                className="flex-1"
                value={(() => {
                  if (!altPhone) return '';
                  const codeMatch = altPhone.match(/^\+(971|91|44|65|61|49|33|1)/);
                  if (codeMatch) {
                    return altPhone.replace(`+${codeMatch[1]}`, '').replace(/^[\s-]?/, '').trim();
                  }
                  return altPhone.trim();
                })()}
                onChange={e => {
                  const match = altPhone?.match(/^\+(971|91|44|65|61|49|33|1)/);
                  const code = match ? `+${match[1]}` : '+91';
                  onChange('altPhone', `${code}${e.target.value}`);
                }}
                placeholder="9000000000"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="altEmails">Alternative Emails</Label>
            <Input id="altEmails" value={altEmails} onChange={e => onChange('altEmails', e.target.value)} placeholder="comma separated" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="anniversary">Anniversary</Label>
            <Input id="anniversary" type="date" value={formattedAN} onChange={e => onChange('anniversary', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="source">Source</Label>
            <Select
              value={['google-ads', 'facebook-ads', 'instagram', 'referral', 'other'].includes(source) ? source : 'other'}
              onValueChange={val => {
                if (val === 'other') {
                  onChange('source', '');
                } else {
                  onChange('source', val);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google-ads">Google Ads</SelectItem>
                <SelectItem value="facebook-ads">Facebook Ads</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="referral">Referral</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            {/* Show text input when "Other" is selected or when source has a custom value */}
            {(!['google-ads', 'facebook-ads', 'instagram', 'referral'].includes(source) && source !== undefined) && (
              <Input
                id="otherSource"
                value={source === 'other' ? '' : source}
                onChange={e => onChange('source', e.target.value)}
                placeholder="Please specify the source..."
                className="mt-2"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="referralSource">Change Referral / Referral Source</Label>
            <Input id="referralSource" value={referralSource} onChange={e => onChange('referralSource', e.target.value)} placeholder="Referral name/code" />
          </div>
        </div>

        {/* GENERAL GOAL — NOT SAVED + NEVER SHOW SELECTED VALUE */}
        <div className="space-y-6 border-t border-gray-200 pt-6">
          <h4 className="font-semibold text-gray-900 text-base">Goals & Personal Info</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2.5">
              <Label htmlFor="generalGoal" className="text-sm font-medium">Goal</Label>
              <Select value={generalGoal} onValueChange={val => onChange('generalGoal', val)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Not Specified" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="not-specified">Not Specified</SelectItem>
                  {goalCategories.map((category) => (
                    <SelectItem key={category._id} value={category.value}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="maritalStatus" className="text-sm font-medium">Marital Status *</Label>
              <Select value={maritalStatus} onValueChange={val => onChange('maritalStatus', val)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="married">Married</SelectItem>
                  <SelectItem value="divorced">Divorced</SelectItem>
                  <SelectItem value="widowed">Widowed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-2.5">
              <Label htmlFor="occupation" className="text-sm font-medium">Occupation *</Label>
              <Input id="occupation" value={occupation} onChange={e => onChange('occupation', e.target.value)} placeholder="Occupation" className="h-10" />
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="targetWeightBucket" className="text-sm font-medium">What is Your Target Weight?</Label>
              <Select value={targetWeightBucket || ''} onValueChange={val => onChange('targetWeightBucket', val)}>
                <SelectTrigger className={`h-10 ${targetWeightBucket && targetWeightBucket !== 'none' ? 'border-orange-400 bg-orange-50' : ''}`}>
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-auto">
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="below-5">Below 5 Kgs</SelectItem>
                  <SelectItem value="5-10">5 to 10 Kgs</SelectItem>
                  <SelectItem value="10-15">10 to 15 Kgs</SelectItem>
                  <SelectItem value="15-20">15 to 20 Kgs</SelectItem>
                  <SelectItem value="20-25">20 to 25 Kgs</SelectItem>
                  <SelectItem value="25-30">25 to 30 Kgs</SelectItem>
                  <SelectItem value="more-30">More than 30 Kgs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Physical Measurements Section */}
        <div className="space-y-6 border-t border-gray-200 pt-6">
          <h4 className="font-semibold text-gray-900 text-base">Physical Measurements</h4>

          {/* Height */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Height Measurements</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2.5">
                <Label className="text-xs text-gray-600">Height (Ft)*</Label>
                <Input
                  type="number"
                  value={displayHeightFeet}
                  onChange={e => handleHeightFeetChange(e.target.value)}
                  placeholder="Enter feet"
                  className="h-10"
                />
              </div>
              <div className="space-y-2.5">
                <Label className="text-xs text-gray-600">Height (Inch)</Label>
                <Input
                  type="number"
                  value={displayHeightInch}
                  onChange={e => handleHeightInchChange(e.target.value)}
                  placeholder="Enter inches"
                  className="h-10"
                />
              </div>
              <div className="space-y-2.5">
                <Label className="text-xs text-gray-600">Height (Cm)</Label>
                <Input
                  type="number"
                  value={displayHeightCm}
                  onChange={e => handleHeightCmChange(e.target.value)}
                  placeholder="Enter centimeters"
                  className="h-10 bg-gray-50"
                />
              </div>
            </div>
          </div>

          {/* Weight */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Weight Measurements</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {hideFirstWeightField ? (
                <div className="space-y-2.5">
                  <Label className="text-xs text-gray-600">Current Weight (Live)</Label>
                  <Input
                    readOnly
                    value={currentWeightKg && Number.isFinite(currentWeightKg) ? `${currentWeightKg.toFixed(1)} kg` : '--'}
                    className="h-10 bg-blue-50"
                  />
                  <p className="text-[11px] text-blue-700">Live value from Weight Tracker.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <Label className="text-xs text-gray-600">Weight (Kg)*</Label>
                  <Input
                    type="number"
                    value={weightKg}
                    onChange={e => handleWeightChange(e.target.value)}
                    placeholder="70"
                    className={`h-10 ${disableFirstWeight ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                    disabled={disableFirstWeight}
                  />
                  {disableFirstWeight && (
                    <p className="text-[11px] text-amber-700">First weight is locked after first save.</p>
                  )}
                  {userRole === 'client' && disableFirstWeight && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      🔒 FIRST WEIGHT (Locked)
                    </span>
                  )}
                  {(userRole === 'dietitian' || userRole === 'admin') && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      ✏️ FIRST WEIGHT (You can edit)
                    </span>
                  )}
                </div>
              )}
              <div className="space-y-2.5">
                <Label className="text-xs text-gray-600">Target Weight (Kg)</Label>
                <Input
                  type="number"
                  value={targetWeightKg}
                  onChange={e => onChange("targetWeightKg", e.target.value)}
                  placeholder="65"
                  className="h-10"
                />
              </div>
              <div className="space-y-2.5">
                <Label className="text-xs text-gray-600">BMI</Label>
                <Input readOnly value={computedBmi} className="h-10 bg-blue-50" />
              </div>
            </div>
          </div>

          {/* Ideal Weight & Activity Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <Label className="text-sm font-medium">Ideal Weight (Kg)</Label>
              <Input readOnly value={computedIdeal} className="h-10 bg-blue-50" />
            </div>
            <div className="space-y-2.5">
              <Label className="text-sm font-medium">Activity Level</Label>
              <Select value={activityLevel} onValueChange={val => onChange('activityLevel', val)}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Select activity level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sedentary">Sedentary</SelectItem>
                  <SelectItem value="lightly_active">Lightly Active</SelectItem>
                  <SelectItem value="moderately_active">Moderately Active</SelectItem>
                  <SelectItem value="very_active">Very Active</SelectItem>
                  <SelectItem value="extremely_active">Extremely Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">What Are Your Goals?</Label>
            <span className="text-xs text-gray-500">Select multiple</span>
          </div>
          <div className="flex flex-wrap gap-2.5 mt-2">
            {['Weight Loss', 'Weight Gain', 'Weight Loss + Disease Management', 'Only Disease Management', 'Other'].map(item => {
              const value = item.toLowerCase().replace(/\s+/g, '-');
              const selected = goalsList?.includes(value);
              return (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = selected ? goalsList?.filter((g: string) => g !== value) : [...(goalsList || []), value];
                    onChange('goalsList', next);
                  }}
                  className={`text-xs transition-all ${selected ? 'bg-orange-500 text-white border-orange-500 hover:bg-orange-600' : 'hover:border-orange-300'}`}
                >
                  {item}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-4 pb-2 bg-blue-50 px-4 py-3 rounded-lg">
          <input type="checkbox" id="sharePhotoConsent" checked={sharePhotoConsent} onChange={e => onChange('sharePhotoConsent', e.target.checked)} className="h-4 w-4 rounded" />
          <Label htmlFor="sharePhotoConsent" className="text-sm">Ready to share front/side photos (for analysis)?</Label>
        </div>

        <div className="flex justify-end pt-6 border-t border-gray-200 mt-6">
          <Button type="button" onClick={onSave} disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-md hover:shadow-lg transition-all">
            <Save className="mr-2 h-4 w-4" />
            Save Basic Info
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
export default BasicInfoForm;