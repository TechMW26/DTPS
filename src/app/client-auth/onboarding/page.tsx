'use client';
import SpoonGifLoader from '@/components/ui/SpoonGifLoader';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ChevronRight, Loader2, Target, Flame, Zap, Check, PartyPopper, Rocket } from 'lucide-react';

type OnboardingStep = 'welcome' | 'profile' | 'goals' | 'preferences' | 'complete';

export default function OnboardingPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
    const [loading, setLoading] = useState(false);

    // Profile data
    const [profile, setProfile] = useState({
        age: '',
        height: '',
        weight: '',
        gender: 'male',
    });

    // Goals data
    const [goals, setGoals] = useState({
        primaryGoal: 'weight-loss', // weight-loss, weight-gain, muscle-gain, fitness
        waterTarget: 2500,
        stepsTarget: 10000,
        sleepTarget: 8,
    });

    // Preferences
    const [preferences, setPreferences] = useState({
        activityLevel: 'moderate', // sedentary, light, moderate, active, very-active
        dietaryPreference: 'no-preference', // no-preference, vegetarian, vegan, keto
    });

    if (status === 'loading') {
        return (
            <div className="min-h-screen bg-linear-to-br from-[#3AB1A0]/10 to-[#E06A26]/5 flex items-center justify-center">
                <SpoonGifLoader size="md" text="Loading..." />
            </div>
        );
    }

    // if (!session?.user) {
    //     return (
    //         <div className="min-h-screen bg-linear-to-br from-[#3AB1A0]/10 to-[#E06A26]/5 flex items-center justify-center">
    //             <Card className="w-full max-w-md">
    //                 <CardContent className="pt-6 text-center">
    //                     <p className="text-gray-600 mb-4">Please sign in to continue onboarding</p>
    //                     <Button onClick={() => router.push('/client-auth/signin')} className="bg-[#3AB1A0] hover:bg-[#2a9989]">
    //                         Go to Sign In
    //                     </Button>
    //                 </CardContent>
    //             </Card>
    //         </div>
    //     );
    // }

    const handleProfileSubmit = async () => {
        if (!profile.age || !profile.height || !profile.weight) {
            toast.error('Please fill in all profile fields');
            return;
        }
        setCurrentStep('goals');
    };

    const handleGoalsSubmit = () => {
        setCurrentStep('preferences');
    };

    const handlePreferencesSubmit = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/client/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    profile,
                    goals,
                    preferences,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to save onboarding data');
            }

            toast.success('Welcome! Your profile is set up.');
            setCurrentStep('complete');
            setTimeout(() => {
                router.push('/user');
            }, 2000);
        } catch (error) {
            toast.error('Failed to save onboarding data');
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const progressPercentage = {
        welcome: 20,
        profile: 40,
        goals: 60,
        preferences: 80,
        complete: 100,
    }[currentStep];

    return (
        <div className="min-h-screen bg-linear-to-br from-[#3AB1A0]/10 to-[#E06A26]/5 p-4">
            {/* Progress Bar */}
            <div className="mb-8">
                <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-[#3AB1A0] transition-all duration-500"
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
            </div>

            <div className="max-w-md mx-auto">
                {/* Welcome Step */}
                {currentStep === 'welcome' && (
                    <Card className="border-0 shadow-lg">
                        <CardHeader className="text-center">
                            <CardTitle className="mb-2 inline-flex items-center justify-center gap-2 text-3xl font-bold text-[#E06A26]">
                                Welcome!
                                <PartyPopper aria-hidden="true" className="h-7 w-7" />
                            </CardTitle>
                            <CardDescription className="text-base">
                                Let's set up your health and fitness profile
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-3 text-center">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#3AB1A0]/20">
                                    <Target className="w-6 h-6 text-[#3AB1A0]" />
                                </div>
                                <p className="text-gray-600">
                                    We'll help you set personalized health goals and track your progress
                                </p>
                            </div>
                            <Button
                                onClick={() => setCurrentStep('profile')}
                                className="w-full bg-[#3AB1A0] hover:bg-[#2a9989] h-12"
                            >
                                Get Started
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {/* Profile Step */}
                {currentStep === 'profile' && (
                    <Card className="border-0 shadow-lg">
                        <CardHeader>
                            <CardTitle>Your Profile</CardTitle>
                            <CardDescription>Help us know you better</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label className="text-sm font-medium">Age</Label>
                                <Input
                                    type="number"
                                    placeholder="Enter your age"
                                    value={profile.age}
                                    onChange={(e) => setProfile({ ...profile, age: e.target.value })}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium">Height (cm)</Label>
                                <Input
                                    type="number"
                                    placeholder="Enter your height"
                                    value={profile.height}
                                    onChange={(e) => setProfile({ ...profile, height: e.target.value })}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium">Weight (kg)</Label>
                                <Input
                                    type="number"
                                    placeholder="Enter your weight"
                                    value={profile.weight}
                                    onChange={(e) => setProfile({ ...profile, weight: e.target.value })}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label className="text-sm font-medium">Gender</Label>
                                <select
                                    value={profile.gender}
                                    onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                                    className="w-full mt-1 p-2 border rounded-lg"
                                >
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentStep('welcome')}
                                    className="flex-1"
                                >
                                    Back
                                </Button>
                                <Button
                                    onClick={handleProfileSubmit}
                                    className="flex-1 bg-[#3AB1A0] hover:bg-[#2a9989]"
                                >
                                    Next
                                    <ChevronRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Goals Step */}
                {currentStep === 'goals' && (
                    <Card className="border-0 shadow-lg">
                        <CardHeader>
                            <CardTitle>Your Goals</CardTitle>
                            <CardDescription>Set your health and fitness targets</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label className="text-sm font-medium">Primary Goal</Label>
                                <select
                                    value={goals.primaryGoal}
                                    onChange={(e) => setGoals({ ...goals, primaryGoal: e.target.value })}
                                    className="w-full mt-1 p-2 border rounded-lg"
                                >
                                    <option value="weight-loss">Weight Loss</option>
                                    <option value="weight-gain">Weight Gain</option>
                                    <option value="muscle-gain">Muscle Gain</option>
                                    <option value="fitness">General Fitness</option>
                                    <option value="health">Better Health</option>
                                </select>
                            </div>

                            <div>
                                <Label className="text-sm font-medium">Daily Water Target (ml)</Label>
                                <Input
                                    type="number"
                                    placeholder="2500"
                                    value={goals.waterTarget}
                                    onChange={(e) => setGoals({ ...goals, waterTarget: parseInt(e.target.value) || 0 })}
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label className="text-sm font-medium">Daily Steps Target</Label>
                                <Input
                                    type="number"
                                    placeholder="10000"
                                    value={goals.stepsTarget}
                                    onChange={(e) => setGoals({ ...goals, stepsTarget: parseInt(e.target.value) || 0 })}
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label className="text-sm font-medium">Sleep Target (hours)</Label>
                                <Input
                                    type="number"
                                    placeholder="8"
                                    step="0.5"
                                    value={goals.sleepTarget}
                                    onChange={(e) => setGoals({ ...goals, sleepTarget: parseFloat(e.target.value) || 0 })}
                                    className="mt-1"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentStep('profile')}
                                    className="flex-1"
                                >
                                    Back
                                </Button>
                                <Button
                                    onClick={handleGoalsSubmit}
                                    className="flex-1 bg-[#3AB1A0] hover:bg-[#2a9989]"
                                >
                                    Next
                                    <ChevronRight className="w-4 h-4 ml-2" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Preferences Step */}
                {currentStep === 'preferences' && (
                    <Card className="border-0 shadow-lg">
                        <CardHeader>
                            <CardTitle>Preferences</CardTitle>
                            <CardDescription>Customize your experience</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label className="text-sm font-medium">Activity Level</Label>
                                <select
                                    value={preferences.activityLevel}
                                    onChange={(e) => setPreferences({ ...preferences, activityLevel: e.target.value })}
                                    className="w-full mt-1 p-2 border rounded-lg"
                                >
                                    <option value="sedentary">Sedentary (little to no exercise)</option>
                                    <option value="light">Light (1-3 days/week)</option>
                                    <option value="moderate">Moderate (3-5 days/week)</option>
                                    <option value="active">Active (6-7 days/week)</option>
                                    <option value="very-active">Very Active (twice per day)</option>
                                </select>
                            </div>

                            <div>
                                <Label className="text-sm font-medium">Dietary Preference</Label>
                                <select
                                    value={preferences.dietaryPreference}
                                    onChange={(e) => setPreferences({ ...preferences, dietaryPreference: e.target.value })}
                                    className="w-full mt-1 p-2 border rounded-lg"
                                >
                                    <option value="no-preference">No Preference</option>
                                    <option value="vegetarian">Vegetarian</option>
                                    <option value="vegan">Vegan</option>
                                    <option value="keto">Keto</option>
                                    <option value="paleo">Paleo</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <Button
                                    variant="outline"
                                    onClick={() => setCurrentStep('goals')}
                                    className="flex-1"
                                >
                                    Back
                                </Button>
                                <Button
                                    onClick={handlePreferencesSubmit}
                                    disabled={loading}
                                    className="flex-1 bg-[#3AB1A0] hover:bg-[#2a9989]"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            Complete
                                            <ChevronRight className="w-4 h-4 ml-2" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Complete Step */}
                {currentStep === 'complete' && (
                    <Card className="border-0 shadow-lg">
                        <CardHeader className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#3AB1A0]/20 mx-auto mb-4">
                                <Check className="w-8 h-8 text-[#3AB1A0]" />
                            </div>
                            <CardTitle className="inline-flex items-center justify-center gap-2 text-2xl">
                                All set!
                                <Rocket aria-hidden="true" className="h-6 w-6" />
                            </CardTitle>
                            <CardDescription>Your profile is ready</CardDescription>
                        </CardHeader>
                        <CardContent className="text-center">
                            <p className="text-gray-600 mb-6">
                                You're all set! Let's start your health journey.
                            </p>
                            <Button
                                onClick={() => router.push('/user')}
                                className="w-full bg-[#3AB1A0] hover:bg-[#2a9989]"
                            >
                                Go to Dashboard
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
