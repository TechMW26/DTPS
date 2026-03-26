'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import ClientsLayout from '@/components/layout/ClientsLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  User,
  Save,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Activity,
  HeartPulse,
  ClipboardList
} from 'lucide-react';
import Link from 'next/link';
import { BasicInfoForm } from '@/components/clients/BasicInfoForm';
import { LifestyleForm } from '@/components/clients/LifestyleForm';
import { MedicalForm } from '@/components/clients/MedicalForm';
import { RecallForm, RecallEntry } from '@/components/clients/RecallForm';
import { validateEmail } from '@/lib/validations/auth';

export default function NewClientPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingClients, setExistingClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(true);

  // Active section state
  const sections = ['basic', 'lifestyle', 'medical', 'recall'] as const;
  type SectionKey = typeof sections[number];
  const [activeSection, setActiveSection] = useState<SectionKey>('basic');
  const [savedSections, setSavedSections] = useState<SectionKey[]>([]);

  // Form state
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
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [healthGoals, setHealthGoals] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInch, setHeightInch] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [targetWeightKg, setTargetWeightKg] = useState('');
  const [bmi, setBmi] = useState('');
  const [idealWeightKg, setIdealWeightKg] = useState('');
  // New lifestyle & food preference fields
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
  // Medical section state
  const [medicalConditions, setMedicalConditions] = useState('');
  const [allergies, setAllergies] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState('');
  const [notes, setNotes] = useState('');
  const [diseaseHistory, setDiseaseHistory] = useState<any[]>([]); // refine type later
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
  const [recallEntries, setRecallEntries] = useState<RecallEntry[]>([]);

  const markSaved = (section: SectionKey) => {
    setSavedSections(prev => prev.includes(section) ? prev : [...prev, section]);
  };

  const basicChange = (field: any, value: string) => {
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
      case 'goalsList': setGoalsList(value.split(',').filter(Boolean)); break;
      case 'targetWeightBucket': setTargetWeightBucket(value); break;
      case 'sharePhotoConsent': setSharePhotoConsent(value === 'true'); break;
      case 'heightFeet': setHeightFeet(value); break;
      case 'heightInch': setHeightInch(value); break;
      case 'heightCm': setHeightCm(value); break;
      case 'weightKg': setWeightKg(value); break;
      case 'targetWeightKg': setTargetWeightKg(value); break;
      case 'idealWeightKg': setIdealWeightKg(value); break;
      case 'bmi': setBmi(value); break;
      case 'activityLevel': setActivityLevel(value); break;
    }
  };

  const lifestyleChange = (field: any, value: string) => {
    switch (field) {
      case 'height': setHeight(value); break;
      case 'weight': setWeight(value); break;
      case 'activityLevel': setActivityLevel(value); break;
      case 'healthGoals': setHealthGoals(value); break;
      case 'heightFeet': setHeightFeet(value); break;
      case 'heightInch': setHeightInch(value); break;
      case 'heightCm': setHeightCm(value); break;
      case 'weightKg': setWeightKg(value); break;
      case 'targetWeightKg': setTargetWeightKg(value); break;
      case 'bmi': setBmi(value); break;
      case 'idealWeightKg': setIdealWeightKg(value); break;
      case 'foodPreference': setFoodPreference(value); break;
      case 'preferredCuisine': setPreferredCuisine(value.split(',').filter(Boolean)); break;
      case 'allergiesFood': setAllergiesFood(value.split(',').filter(Boolean)); break;
      case 'fastDays': setFastDays(value.split(',').filter(Boolean)); break;
      case 'nonVegExemptDays': setNonVegExemptDays(value.split(',').filter(Boolean)); break;
      case 'foodLikes': setFoodLikes(value); break;
      case 'foodDislikes': setFoodDislikes(value); break;
      case 'eatOutFrequency': setEatOutFrequency(value); break;
      case 'smokingFrequency': setSmokingFrequency(value); break;
      case 'alcoholFrequency': setAlcoholFrequency(value); break;
      case 'activityRate': setActivityRate(value); break;
      case 'cookingOil': setCookingOil(value.split(',').filter(Boolean)); break;
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

  // Fetch existing clients
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch('/api/users?role=client');
        if (response.ok) {
          const clients = await response.json();
          setExistingClients((clients?.users || []).slice(0, 10)); // Show first 10 clients
        }
      } catch (error) {
        console.error('Error fetching clients:', error);
      } finally {
        setLoadingClients(false);
      }
    };

    fetchClients();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!firstName || !lastName || !phone) {
      setError('Please fill in all required fields (First Name, Last Name, Phone)');
      return;
    }

    // Validate email format only if email is provided
    if (email) {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        setError(emailValidation.error || 'Please enter a valid email address');
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
          height: height ? parseFloat(height) : undefined,
          weight: weight ? parseFloat(weight) : undefined,
          activityLevel: activityLevel || undefined,
          healthGoals: healthGoals ? healthGoals.split(',').map(g => g.trim()) : undefined,
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
          notes
        }),
      });

      if (response.ok) {
        router.push('/clients?success=created');
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create client');
      }
    } catch (error) {
      console.error('Error creating client:', error);
      setError('Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ClientsLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/clients">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Clients
            </Link>
          </Button>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">Add New Client</h1>
            <p className="text-gray-600 mt-1">Create a new client profile</p>
          </div>
        </div>

        {/* Section Navigation */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <Button
                variant={activeSection === 'basic' ? 'default' : 'outline'}
                onClick={() => setActiveSection('basic')}
                className={`gap-2 px-4 py-2 rounded-lg font-medium transition-all ${activeSection === 'basic'
                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                  : 'hover:bg-slate-100'
                  }`}
              >
                <User className="h-4 w-4" />
                <span>Basic</span>
                {savedSections.includes('basic') && <CheckCircle className="h-4 w-4 text-green-600 ml-1" />}
              </Button>
              <Button
                variant={activeSection === 'lifestyle' ? 'default' : 'outline'}
                onClick={() => setActiveSection('lifestyle')}
                className={`gap-2 px-4 py-2 rounded-lg font-medium transition-all ${activeSection === 'lifestyle'
                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                  : 'hover:bg-slate-100'
                  }`}
              >
                <Activity className="h-4 w-4" />
                <span>Lifestyle</span>
                {savedSections.includes('lifestyle') && <CheckCircle className="h-4 w-4 text-green-600 ml-1" />}
              </Button>
              <Button
                variant={activeSection === 'medical' ? 'default' : 'outline'}
                onClick={() => setActiveSection('medical')}
                className={`gap-2 px-4 py-2 rounded-lg font-medium transition-all ${activeSection === 'medical'
                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                  : 'hover:bg-slate-100'
                  }`}
              >
                <HeartPulse className="h-4 w-4" />
                <span>Medical</span>
                {savedSections.includes('medical') && <CheckCircle className="h-4 w-4 text-green-600 ml-1" />}
              </Button>
              <Button
                variant={activeSection === 'recall' ? 'default' : 'outline'}
                onClick={() => setActiveSection('recall')}
                className={`gap-2 px-4 py-2 rounded-lg font-medium transition-all ${activeSection === 'recall'
                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                  : 'hover:bg-slate-100'
                  }`}
              >
                <ClipboardList className="h-4 w-4" />
                <span>Recall</span>
                {savedSections.includes('recall') && <CheckCircle className="h-4 w-4 text-green-600 ml-1" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Existing Clients Section */}
        {/* <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Existing Clients</span>
            </CardTitle>
            <CardDescription>
              Recent clients in your system - check if the client already exists before creating a new one
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingClients ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner className="h-6 w-6 mr-2" />
                <span>Loading clients...</span>
              </div>
            ) : existingClients.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {existingClients?.map((client: any) => (
                    <div key={client._id} className="p-3 border rounded-lg bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{client?.firstName} {client?.lastName}</p>
                          <p className="text-xs text-gray-600">{client?.email}</p>
                          {client?.phone && (
                            <p className="text-xs text-gray-500">{client?.phone}</p>
                          )}
                          {client?.wooCommerceData && (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                                🛒 {client.wooCommerceData.totalOrders} orders
                              </span>
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                        >
                          <Link href={`/clients/${client._id}`}>
                            View
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-center">
                  <Button variant="outline" asChild>
                    <Link href="/clients">
                      View All {existingClients?.length > 10 ? '14,000+' : existingClients?.length} Clients
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No existing clients found</p>
            )}
          </CardContent>
        </Card> */}

        {/* Dynamic Section Rendering */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="w-full">
            {activeSection === 'basic' && (
              <div className="animate-in fade-in duration-300">
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
              <div className="animate-in fade-in duration-300">
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
              <div className="animate-in fade-in duration-300">
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
                  onChange={medicalChange}
                  onSave={() => markSaved('medical')}
                  loading={loading}
                />
              </div>
            )}
            {activeSection === 'recall' && (
              <div className="animate-in fade-in duration-300">
                <RecallForm
                  entries={recallEntries}
                  onChange={recallChange}
                  onSave={() => markSaved('recall')}
                  loading={loading}
                />
              </div>
            )}
          </div>
          {/* Submit Button */}
          <div className="flex justify-end space-x-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/clients">Cancel</Link>
            </Button>
            <Button type="submit" disabled={loading}>
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
                  A temporary password will be assigned to the client. They will receive login instructions
                  via email and should change their password on first login.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ClientsLayout>
  );
}
