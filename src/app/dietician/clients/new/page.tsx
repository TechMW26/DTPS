'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  User,
  Save,
  ArrowLeft,
  Activity,
  HeartPulse,
  ClipboardList,
  CheckCircle,
  UserPlus
} from 'lucide-react';
import Link from 'next/link';
import BasicInfoForm from '@/components/clients/BasicInfoForm';
import LifestyleForm from '@/components/clients/LifestyleForm';
import MedicalForm from '@/components/clients/MedicalForm';
import { RecallForm, type RecallEntry } from '@/components/clients/RecallForm';
import { toast } from 'sonner';
import { validateEmail } from '@/lib/validations/auth';

export default function DietitianNewClientPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Active section state
  const sections = ['basic', 'lifestyle', 'medical', 'recall'] as const;
  type SectionKey = typeof sections[number];
  const [activeSection, setActiveSection] = useState<SectionKey>('basic');
  const [savedSections, setSavedSections] = useState<SectionKey[]>([]);

  // Basic Info Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [parentAccount, setParentAccount] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [altEmails, setAltEmails] = useState('');
  const [anniversary, setAnniversary] = useState('');
  const [source, setSource] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [generalGoal, setGeneralGoal] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [occupation, setOccupation] = useState('');
  const [goalsList, setGoalsList] = useState<string[]>([]);
  const [targetWeightBucket, setTargetWeightBucket] = useState('');
  const [sharePhotoConsent, setSharePhotoConsent] = useState(false);
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInch, setHeightInch] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [targetWeightKg, setTargetWeightKg] = useState('');
  const [bmi, setBmi] = useState('');
  const [idealWeightKg, setIdealWeightKg] = useState('');
  const [activityLevel, setActivityLevel] = useState('');

  // Lifestyle Form state
  const [foodPreference, setFoodPreference] = useState('');
  const [preferredCuisine, setPreferredCuisine] = useState<string[]>([]);
  const [allergiesFood, setAllergiesFood] = useState<string[]>([]);
  const [fastDays, setFastDays] = useState<string[]>([]);
  const [nonVegExemptDays, setNonVegExemptDays] = useState<string[]>([]);
  const [foodLikes, setFoodLikes] = useState('');
  const [foodDislikes, setFoodDislikes] = useState('');
  const [eatOutFrequency, setEatOutFrequency] = useState('');
  const [smokingFrequency, setSmokingFrequency] = useState('');
  const [alcoholFrequency, setAlcoholFrequency] = useState('');
  const [activityRate, setActivityRate] = useState('');
  const [cookingOil, setCookingOil] = useState<string[]>([]);
  const [monthlyOilConsumption, setMonthlyOilConsumption] = useState('');
  const [cookingSalt, setCookingSalt] = useState('');
  const [carbonatedBeverageFrequency, setCarbonatedBeverageFrequency] = useState('');
  const [cravingType, setCravingType] = useState('');

  // Medical Form state
  const [medicalConditions, setMedicalConditions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState('');
  const [notes, setNotes] = useState('');
  const [diseaseHistory, setDiseaseHistory] = useState<any[]>([]);
  const [medicalHistory, setMedicalHistory] = useState('');
  const [familyHistory, setFamilyHistory] = useState('');
  const [medication, setMedication] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [gutIssues, setGutIssues] = useState<string[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [isPregnant, setIsPregnant] = useState(false);
  const [isLactating, setIsLactating] = useState(false);
  const [menstrualCycle, setMenstrualCycle] = useState('');
  const [bloodFlow, setBloodFlow] = useState('');

  // Recall Form state
  const [recallEntries, setRecallEntries] = useState<RecallEntry[]>([]);

  const markSaved = (section: SectionKey) => {
    setSavedSections(prev => prev.includes(section) ? prev : [...prev, section]);
    toast.success(`${section.charAt(0).toUpperCase() + section.slice(1)} section saved`);
  };

  const basicChange = (field: any, value: any) => {
    switch (field) {
      case 'firstName': setFirstName(value); break;
      case 'lastName': setLastName(value); break;
      case 'email': setEmail(value); break;
      case 'phone': setPhone(value); break;
      case 'dateOfBirth': setDateOfBirth(value); break;
      case 'gender': setGender(value); break;
      case 'parentAccount': setParentAccount(value); break;
      case 'altPhone': setAltPhone(value); break;
      case 'altEmails': setAltEmails(value); break;
      case 'anniversary': setAnniversary(value); break;
      case 'source': setSource(value); break;
      case 'referralSource': setReferralSource(value); break;
      case 'generalGoal': setGeneralGoal(value); break;
      case 'maritalStatus': setMaritalStatus(value); break;
      case 'occupation': setOccupation(value); break;
      case 'goalsList': setGoalsList(Array.isArray(value) ? value : []); break;
      case 'targetWeightBucket': setTargetWeightBucket(value); break;
      case 'sharePhotoConsent': setSharePhotoConsent(value); break;
      case 'heightFeet': setHeightFeet(value); break;
      case 'heightInch': setHeightInch(value); break;
      case 'heightCm': setHeightCm(value); break;
      case 'weightKg': setWeightKg(value); break;
      case 'targetWeightKg': setTargetWeightKg(value); break;
      case 'bmi': setBmi(value); break;
      case 'idealWeightKg': setIdealWeightKg(value); break;
      case 'activityLevel': setActivityLevel(value); break;
    }
  };

  const lifestyleChange = (field: any, value: any) => {
    switch (field) {
      case 'foodPreference': setFoodPreference(value); break;
      case 'preferredCuisine': setPreferredCuisine(Array.isArray(value) ? value : []); break;
      case 'allergiesFood': setAllergiesFood(Array.isArray(value) ? value : []); break;
      case 'fastDays': setFastDays(Array.isArray(value) ? value : []); break;
      case 'nonVegExemptDays': setNonVegExemptDays(Array.isArray(value) ? value : []); break;
      case 'foodLikes': setFoodLikes(value); break;
      case 'foodDislikes': setFoodDislikes(value); break;
      case 'eatOutFrequency': setEatOutFrequency(value); break;
      case 'smokingFrequency': setSmokingFrequency(value); break;
      case 'alcoholFrequency': setAlcoholFrequency(value); break;
      case 'activityRate': setActivityRate(value); break;
      case 'cookingOil': setCookingOil(Array.isArray(value) ? value : []); break;
      case 'monthlyOilConsumption': setMonthlyOilConsumption(value); break;
      case 'cookingSalt': setCookingSalt(value); break;
      case 'carbonatedBeverageFrequency': setCarbonatedBeverageFrequency(value); break;
      case 'cravingType': setCravingType(value); break;
    }
  };

  const medicalChange = (field: any, value: any) => {
    switch (field) {
      case 'medicalConditions': setMedicalConditions(value); break;
      case 'allergies': setAllergies(value); break;
      case 'dietaryRestrictions': setDietaryRestrictions(value); break;
      case 'notes': setNotes(value); break;
      case 'diseaseHistory': setDiseaseHistory(value); break;
      case 'medicalHistory': setMedicalHistory(value); break;
      case 'familyHistory': setFamilyHistory(value); break;
      case 'medication': setMedication(value); break;
      case 'bloodGroup': setBloodGroup(value); break;
      case 'gutIssues': setGutIssues(value); break;
      case 'reports': setReports(value); break;
      case 'isPregnant': setIsPregnant(value); break;
      case 'isLactating': setIsLactating(value); break;
      case 'menstrualCycle': setMenstrualCycle(value); break;
      case 'bloodFlow': setBloodFlow(value); break;
    }
  };

  const recallChange = (entries: RecallEntry[]) => setRecallEntries(entries);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastName || !phone) {
      toast.error('Please fill in all required fields (First Name, Last Name, Phone)');
      return;
    }

    // Validate email format only if email is provided
    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        toast.error(emailValidation.error || 'Please enter a valid email address');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          createdByStaff: true, // Flag to indicate staff is creating client
          firstName,
          lastName,
          email: email || undefined,
          phone,
          role: 'client',
          dateOfBirth: dateOfBirth || undefined,
          gender: gender || undefined,
          parentAccount: parentAccount || undefined,
          altPhone: altPhone || undefined,
          altEmails: altEmails ? altEmails.split(',').map(e => e.trim()).filter(Boolean) : undefined,
          anniversary: anniversary || undefined,
          source: source || undefined,
          referralSource: referralSource || undefined,
          generalGoal: generalGoal || undefined,
          maritalStatus: maritalStatus || undefined,
          occupation: occupation || undefined,
          goalsList: goalsList.length ? goalsList : undefined,
          targetWeightBucket: targetWeightBucket || undefined,
          sharePhotoConsent,
          heightFeet: heightFeet || undefined,
          heightInch: heightInch || undefined,
          heightCm: heightCm || undefined,
          weightKg: weightKg || undefined,
          targetWeightKg: targetWeightKg || undefined,
          bmi: bmi || undefined,
          idealWeightKg: idealWeightKg || undefined,
          activityLevel: activityLevel || undefined,
          foodPreference: foodPreference || undefined,
          preferredCuisine: preferredCuisine.length ? preferredCuisine : undefined,
          allergiesFood: allergiesFood.length ? allergiesFood : undefined,
          fastDays: fastDays.length ? fastDays : undefined,
          nonVegExemptDays: nonVegExemptDays.length ? nonVegExemptDays : undefined,
          foodLikes: foodLikes || undefined,
          foodDislikes: foodDislikes || undefined,
          eatOutFrequency: eatOutFrequency || undefined,
          smokingFrequency: smokingFrequency || undefined,
          alcoholFrequency: alcoholFrequency || undefined,
          activityRate: activityRate || undefined,
          cookingOil: cookingOil.length ? cookingOil : undefined,
          monthlyOilConsumption: monthlyOilConsumption || undefined,
          cookingSalt: cookingSalt || undefined,
          carbonatedBeverageFrequency: carbonatedBeverageFrequency || undefined,
          cravingType: cravingType || undefined,
          medicalConditions: medicalConditions ? medicalConditions.split(',').map((c: string) => c.trim()) : undefined,
          allergies: allergies ? allergies.split(',').map((a: string) => a.trim()) : undefined,
          dietaryRestrictions: dietaryRestrictions ? dietaryRestrictions.split(',').map((d: string) => d.trim()) : undefined,
          diseaseHistory: diseaseHistory.length ? diseaseHistory : undefined,
          medicalHistory: medicalHistory || undefined,
          familyHistory: familyHistory || undefined,
          medication: medication || undefined,
          bloodGroup: bloodGroup || undefined,
          gutIssues: gutIssues.length ? gutIssues : undefined,
          reports: reports.length ? reports : undefined,
          isPregnant,
          isLactating,
          menstrualCycle: menstrualCycle || undefined,
          bloodFlow: bloodFlow || undefined,
          notes,
          // Assign this client to the current dietitian
          assignedDietitian: session?.user?.id
        }),
      });

      if (response.ok) {
        toast.success('Client created successfully!');
        router.push('/dietician/clients?success=created');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to create client');
        setError(data.error || 'Failed to create client');
      }
    } catch (error) {
      console.error('Error creating client:', error);
      toast.error('Failed to create client');
      setError('Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/dietician/clients">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>

          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <UserPlus className="h-7 w-7 text-green-600" />
              Create New Client
            </h1>
            <p className="text-gray-600 mt-1 text-sm sm:text-base">Add a new client to your practice</p>
          </div>
        </div>

        {/* Section Navigation */}
        <Card className="border-2 border-green-500 shadow-lg rounded-xl overflow-hidden">
          <CardContent className="p-3 sm:p-4 bg-linear-to-r from-green-50 to-emerald-50">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Button
                variant={activeSection === 'basic' ? 'default' : 'outline'}
                onClick={() => setActiveSection('basic')}
                className={`gap-2 text-xs sm:text-sm ${activeSection === 'basic' ? 'bg-green-600 hover:bg-green-700 border-green-600' : 'border-2 border-gray-800 hover:border-green-600 hover:bg-green-50'}`}
                size="sm"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Basic</span>
                {savedSections.includes('basic') && <CheckCircle className="h-4 w-4 text-green-400" />}
              </Button>
              <Button
                variant={activeSection === 'lifestyle' ? 'default' : 'outline'}
                onClick={() => setActiveSection('lifestyle')}
                className={`gap-2 text-xs sm:text-sm ${activeSection === 'lifestyle' ? 'bg-green-600 hover:bg-green-700 border-green-600' : 'border-2 border-gray-800 hover:border-green-600 hover:bg-green-50'}`}
                size="sm"
              >
                <Activity className="h-4 w-4" />
                <span className="hidden sm:inline">Lifestyle</span>
                {savedSections.includes('lifestyle') && <CheckCircle className="h-4 w-4 text-green-400" />}
              </Button>
              <Button
                variant={activeSection === 'medical' ? 'default' : 'outline'}
                onClick={() => setActiveSection('medical')}
                className={`gap-2 text-xs sm:text-sm ${activeSection === 'medical' ? 'bg-green-600 hover:bg-green-700 border-green-600' : 'border-2 border-gray-800 hover:border-green-600 hover:bg-green-50'}`}
                size="sm"
              >
                <HeartPulse className="h-4 w-4" />
                <span className="hidden sm:inline">Medical</span>
                {savedSections.includes('medical') && <CheckCircle className="h-4 w-4 text-green-400" />}
              </Button>
              <Button
                variant={activeSection === 'recall' ? 'default' : 'outline'}
                onClick={() => setActiveSection('recall')}
                className={`gap-2 text-xs sm:text-sm ${activeSection === 'recall' ? 'bg-green-600 hover:bg-green-700 border-green-600' : 'border-2 border-gray-800 hover:border-green-600 hover:bg-green-50'}`}
                size="sm"
              >
                <ClipboardList className="h-4 w-4" />
                <span className="hidden sm:inline">Recall</span>
                {savedSections.includes('recall') && <CheckCircle className="h-4 w-4 text-green-400" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic Section Rendering */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="w-full min-h-screen overflow-visible">
            {activeSection === 'basic' && (
              <div className="transition-all duration-300 animate-fadeIn">
                <BasicInfoForm
                  firstName={firstName}
                  lastName={lastName}
                  email={email}
                  phone={phone}
                  dateOfBirth={dateOfBirth}
                  gender={gender}
                  parentAccount={parentAccount}
                  altPhone={altPhone}
                  altEmails={altEmails}
                  anniversary={anniversary}
                  source={source}
                  referralSource={referralSource}
                  generalGoal={generalGoal}
                  maritalStatus={maritalStatus}
                  occupation={occupation}
                  goalsList={goalsList}
                  targetWeightBucket={targetWeightBucket}
                  sharePhotoConsent={sharePhotoConsent}
                  heightFeet={heightFeet}
                  heightInch={heightInch}
                  heightCm={heightCm}
                  weightKg={weightKg}
                  targetWeightKg={targetWeightKg}
                  idealWeightKg={idealWeightKg}
                  bmi={bmi}
                  activityLevel={activityLevel}
                  onChange={basicChange}
                  onSave={() => markSaved('basic')}
                  loading={loading}
                />
              </div>
            )}
            {activeSection === 'lifestyle' && (
              <div className="transition-all duration-300 animate-fadeIn">
                <LifestyleForm
                  foodPreference={foodPreference}
                  preferredCuisine={preferredCuisine}
                  allergiesFood={allergiesFood}
                  fastDays={fastDays}
                  nonVegExemptDays={nonVegExemptDays}
                  foodLikes={foodLikes}
                  foodDislikes={foodDislikes}
                  eatOutFrequency={eatOutFrequency}
                  smokingFrequency={smokingFrequency}
                  alcoholFrequency={alcoholFrequency}
                  activityRate={activityRate}
                  cookingOil={cookingOil}
                  monthlyOilConsumption={monthlyOilConsumption}
                  cookingSalt={cookingSalt}
                  carbonatedBeverageFrequency={carbonatedBeverageFrequency}
                  cravingType={cravingType}
                  onChange={lifestyleChange}
                  onSave={() => markSaved('lifestyle')}
                  loading={loading}
                />
              </div>
            )}
            {activeSection === 'medical' && (
              <div className="transition-all duration-300 animate-fadeIn">
                <MedicalForm
                  medicalConditions={medicalConditions}
                  allergies={allergies}
                  dietaryRestrictions={dietaryRestrictions}
                  notes={notes}
                  diseaseHistory={diseaseHistory}
                  medicalHistory={medicalHistory}
                  familyHistory={familyHistory}
                  medication={medication}
                  bloodGroup={bloodGroup}
                  gutIssues={gutIssues}
                  reports={reports}
                  isPregnant={isPregnant}
                  isLactating={isLactating}
                  menstrualCycle={menstrualCycle}
                  bloodFlow={bloodFlow}
                  clientGender={gender}
                  onChange={medicalChange}
                  onSave={() => markSaved('medical')}
                  loading={loading}
                />
              </div>
            )}
            {activeSection === 'recall' && (
              <div className="transition-all duration-300 animate-fadeIn">
                <RecallForm
                  entries={recallEntries}
                  onChange={recallChange}
                  onSave={() => markSaved('recall')}
                  loading={loading}
                  userRole="dietitian"
                />
              </div>
            )}
          </div>

          {/* Submit Button */}
          <Card className="border-0 shadow-md">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-sm text-gray-600">
                  <span className="font-medium">{savedSections.length}/4</span> sections saved
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <Button type="button" variant="outline" asChild className="flex-1 sm:flex-none">
                    <Link href="/dietician/clients">Cancel</Link>
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-md hover:shadow-lg transition-all"
                  >
                    {loading ? (
                      <>
                        <LoadingSpinner className="mr-2 h-4 w-4" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Create Client
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>

        {/* Info Box */}
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <div className="shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="font-medium text-blue-900">Client Account Setup</h4>
                <p className="text-sm text-blue-700 mt-1">
                  A temporary password will be generated for the client. They will receive login instructions
                  via email and should change their password on first login. The client will be automatically assigned to you.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
