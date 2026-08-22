'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Apple, Clock, Loader2, CalendarCheck, Camera, X, CheckCircle2, ZoomIn } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { uploadFileReliably } from '@/lib/client-upload';
import { ListSkeleton } from '@/components/ui/skeleton';

interface Meal {
  _id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  type: 'Early Morning' | 'Breakfast' | 'Mid Morning' | 'Lunch' | 'Mid Evening' | 'Evening' | 'Dinner' | 'Past Dinner';
  time: string;
  consumed: boolean;
  fromMealPlan?: boolean;
  mealPlanId?: string;
  unit?: string;
  photo?: string;
  notes?: string;
}

interface ActiveMealPlan {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface FreezeInfo {
  date: string;
  reason: string;
  frozenAt?: string;
}

interface CaloriesSectionProps {
  clientId: string;
  selectedDate: Date;
}

export default function CaloriesSection({ clientId, selectedDate }: CaloriesSectionProps) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMealPlan, setActiveMealPlan] = useState<ActiveMealPlan | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [isFrozen, setIsFrozen] = useState(false);
  const [freezeInfo, setFreezeInfo] = useState<FreezeInfo | null>(null);
  const [summary, setSummary] = useState({
    totalMeals: 0,
    consumedMeals: 0,
    totalCalories: 0,
    consumedCalories: 0,
    consumedProtein: 0,
    consumedCarbs: 0,
    consumedFat: 0,
    targets: { calories: 2000, protein: 150, carbs: 250, fat: 65 },
    percentage: 0
  });

  // Photo upload state
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);
  const [mealNotes, setMealNotes] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Open image in lightbox
  const openLightbox = (imageUrl: string) => {
    setLightboxImage(imageUrl);
    setLightboxOpen(true);
  };

  // Close lightbox
  const closeLightbox = () => {
    setLightboxOpen(false);
    setLightboxImage(null);
  };

  // Fetch meals for the selected date and goals from progress API
  const fetchMeals = useCallback(async () => {
    try {
      setLoading(true);
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch(`/api/journal/meals?date=${dateStr}&clientId=${clientId}`);
      const data = await res.json();
      
      if (data.success) {
        setMeals(data.meals || []);
        setSummary(data.summary || summary);
        setActiveMealPlan(data.activeMealPlan || null);
        setIsFrozen(data.isFrozen || false);
        setFreezeInfo(data.freezeInfo || null);
        if (data.user) {
          setUserName(`${data.user.firstName} ${data.user.lastName}`);
        }

        // Calculate total goals from meal plan meals for the selected date
        let totalGoalsCalories = 0;
        let totalGoalsProtein = 0;
        let totalGoalsCarbs = 0;
        let totalGoalsFats = 0;

        // Sum up calories/macros from all meals for this day
        if (data.meals && data.meals.length > 0) {
          data.meals.forEach((meal: any) => {
            totalGoalsCalories += parseFloat(meal.calories) || 0;
            totalGoalsProtein += parseFloat(meal.protein) || 0;
            totalGoalsCarbs += parseFloat(meal.carbs) || 0;
            totalGoalsFats += parseFloat(meal.fat) || 0;
          });
        }

        // Update summary with calculated goals from meal plan
        if (totalGoalsCalories > 0 || totalGoalsProtein > 0 || totalGoalsCarbs > 0 || totalGoalsFats > 0) {
          setSummary(prev => ({
            ...prev,
            targets: {
              calories: Math.round(totalGoalsCalories) || prev.targets.calories,
              protein: Math.round(totalGoalsProtein) || prev.targets.protein,
              carbs: Math.round(totalGoalsCarbs) || prev.targets.carbs,
              fat: Math.round(totalGoalsFats) || prev.targets.fat
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error fetching meals:', error);
      toast.error('Failed to load meals');
    } finally {
      setLoading(false);
    }
  }, [clientId, selectedDate]);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  // Listen for visibility change to refresh data when user comes back
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchMeals();
      }
    };

    const handleDataChange = () => {
      fetchMeals();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('user-data-changed', handleDataChange);
    window.addEventListener('meal-plan-updated', handleDataChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('user-data-changed', handleDataChange);
      window.removeEventListener('meal-plan-updated', handleDataChange);
    };
  }, [fetchMeals]);

  const targetCalories = summary.targets.calories;
  const targetProtein = summary.targets.protein;
  const targetCarbs = summary.targets.carbs;
  const targetFats = summary.targets.fat;

  const consumedMealsCount = meals.filter(m => m.consumed).length;
  const consumedCalories = summary.consumedCalories;
  const consumedProtein = summary.consumedProtein;
  const consumedCarbs = summary.consumedCarbs;
  const consumedFat = summary.consumedFat;

  const toggleMealConsumed = async (meal: Meal, consumed: boolean, photo?: string, notes?: string) => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const res = await fetch('/api/journal/meals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: meal.mealPlanId || meal._id,
          consumed: consumed,
          photo: photo || '',
          notes: notes || '',
          date: dateStr,
          clientId,
          mealData: meal.fromMealPlan ? {
            name: meal.name,
            calories: meal.calories,
            protein: meal.protein,
            carbs: meal.carbs,
            fat: meal.fat,
            type: meal.type,
            time: meal.time,
            unit: meal.unit
          } : undefined
        })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Update local state
        setMeals(prev => prev.map(m => 
          (m._id === meal._id || m.mealPlanId === meal.mealPlanId) 
            ? { ...m, consumed, photo: photo || '', notes: notes || '' } 
            : m
        ));
        setSummary(prev => ({ ...prev, ...data.summary }));
        toast.success('Meal completed successfully!');
        
        // Emit event to notify other components about the change
        window.dispatchEvent(new CustomEvent('meal-plan-updated', { 
          detail: { mealId: meal._id, consumed, date: dateStr } 
        }));
        window.dispatchEvent(new CustomEvent('user-data-changed', { 
          detail: { dataType: 'meal' } 
        }));
      } else {
        toast.error(data.error || 'Failed to update meal');
      }
    } catch (error) {
      console.error('Error updating meal:', error);
      toast.error('Failed to update meal');
    }
  };

  // Open completion dialog (photo + notes + submit)
  const openCompletionDialog = (meal: Meal) => {
    if (meal.consumed) return; // Already consumed, don't allow changes
    setSelectedMeal(meal);
    setMealNotes('');
    setSelectedPhotoFile(null);
    setPreviewPhoto(null);
    setPhotoDialogOpen(true);
  };

  // Handle file selection for photo
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Photo size must be less than 5MB');
        return;
      }
      
      if (previewPhoto?.startsWith('blob:')) URL.revokeObjectURL(previewPhoto);
      setSelectedPhotoFile(file);
      setPreviewPhoto(URL.createObjectURL(file));
    }
  };

  // Complete meal with photo and notes (one-time submit)
  const completeMeal = async () => {
    if (!selectedMeal) return;

    try {
      setUploadingPhoto(true);
      let photoUrl = '';
      if (selectedPhotoFile) {
        const uploadResult = await uploadFileReliably(selectedPhotoFile, 'progress');
        photoUrl = uploadResult.url;
      }
      await toggleMealConsumed(selectedMeal, true, photoUrl, mealNotes);
      setPhotoDialogOpen(false);
      setSelectedMeal(null);
      setSelectedPhotoFile(null);
      if (previewPhoto?.startsWith('blob:')) URL.revokeObjectURL(previewPhoto);
      setPreviewPhoto(null);
      setMealNotes('');
    } catch (error) {
      console.error('Error completing meal:', error);
      toast.error('Failed to complete meal');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const getMealTypeColor = (type: string) => {
    switch (type) {
      case 'Early Morning': return 'bg-yellow-100 text-yellow-700';
      case 'Breakfast': return 'bg-blue-100 text-blue-700';
      case 'Mid Morning': return 'bg-cyan-100 text-cyan-700';
      case 'Lunch': return 'bg-green-100 text-green-700';
      case 'Mid Evening': return 'bg-amber-100 text-amber-700';
      case 'Evening': return 'bg-orange-100 text-orange-700';
      case 'Dinner': return 'bg-purple-100 text-purple-700';
      case 'Past Dinner': return 'bg-indigo-100 text-indigo-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return <ListSkeleton rows={5} />;
  }

  // Show frozen day message
  if (isFrozen) {
    return (
      <div className="space-y-6 w-full">
        {/* Active Meal Plan Info */}
        {activeMealPlan && (
          <Card className="w-full border-green-200 bg-green-50/50">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <CalendarCheck className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800">Active Meal Plan: {activeMealPlan.name}</p>
                  <p className="text-xs text-green-600">
                    {format(new Date(activeMealPlan.startDate), 'MMM d, yyyy')} - {format(new Date(activeMealPlan.endDate), 'MMM d, yyyy')}
                  </p>
                </div>
                <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                  Active
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Frozen Day Message */}
        <Card className="w-full border-blue-200 bg-blue-50/50">
          <CardContent className="py-8 px-6">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-4 bg-linear-to-br from-blue-100 to-cyan-100 rounded-full flex items-center justify-center">
                <span className="text-5xl">❄️</span>
              </div>
              <h3 className="mb-2 text-xl font-bold text-blue-800">This Day is Frozen</h3>
              <p className="mb-2 text-sm text-gray-600 font-medium">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
              <p className="mb-4 text-sm text-gray-500">
                Your dietitian has frozen this day. No meals are scheduled.
              </p>
              {freezeInfo?.reason && (
                <div className="bg-blue-100 border border-blue-200 rounded-xl p-4 mb-4 text-left max-w-md mx-auto">
                  <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Reason</p>
                  <p className="text-sm text-blue-800">{freezeInfo.reason}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Active Meal Plan Info */}
      {activeMealPlan && (
        <Card className="w-full border-green-200 bg-green-50/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <CalendarCheck className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Active Meal Plan: {activeMealPlan.name}</p>
                <p className="text-xs text-green-600">
                  {format(new Date(activeMealPlan.startDate), 'MMM d, yyyy')} - {format(new Date(activeMealPlan.endDate), 'MMM d, yyyy')}
                </p>
              </div>
              <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                Active
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Diet Plan Header */}
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Apple className="h-5 w-5 text-green-500" />
              <div>
                <CardTitle className="text-base">Today's Diet Plan</CardTitle>
                <p className="text-sm text-gray-500">
                  {userName ? `${userName}'s personalized nutrition targets` : 'Mark meals as consumed to track your daily intake'}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-green-600 border-green-200">
              {consumedMealsCount} / {meals.length} Meals
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Target Nutrition - From User Database */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Target Calories</p>
              <p className="text-lg font-bold text-gray-800">{targetCalories}</p>
              <p className="text-xs text-gray-400">kcal</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Target Protein</p>
              <p className="text-lg font-bold text-gray-800">{targetProtein}g</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Target Carbs</p>
              <p className="text-lg font-bold text-gray-800">{targetCarbs}g</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">Target Fats</p>
              <p className="text-lg font-bold text-gray-800">{targetFats}g</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Planned Meals */}
      <Card className="w-full">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <CardTitle className="text-base">Planned Meals</CardTitle>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-gray-500">{consumedCalories} kcal consumed</span>
              <span className="text-gray-400">•</span>
              <span className="text-blue-500">P: {consumedProtein}g</span>
              <span className="text-gray-400">•</span>
              <span className="text-yellow-500">C: {consumedCarbs}g</span>
              <span className="text-gray-400">•</span>
              <span className="text-orange-500">F: {consumedFat}g</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {meals.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No meals planned for today</p>
          ) : (
            <div className="space-y-3">
              {meals.map((meal) => (
                <div 
                  key={meal._id}
                  className={`p-4 rounded-lg border transition-all ${
                    meal.consumed 
                      ? 'bg-green-50 border-green-300 shadow-sm' 
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Meal Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`font-medium ${meal.consumed ? 'text-green-700' : 'text-gray-800'}`}>
                          {meal.name}
                          {meal.unit && <span className="text-gray-500 font-normal ml-1">({meal.unit})</span>}
                        </span>
                        <Badge className={getMealTypeColor(meal.type)} variant="secondary">
                          {meal.type}
                        </Badge>
                        {meal.fromMealPlan && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                            Diet Plan
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-3 text-sm text-gray-500 flex-wrap">
                        <span className="font-medium">{Math.round(meal.calories)} kcal</span>
                        <span className="text-blue-600">P: {Math.round(meal.protein)}g</span>
                        <span className="text-amber-600">C: {Math.round(meal.carbs)}g</span>
                        <span className="text-orange-600">F: {Math.round(meal.fat)}g</span>
                        <span className="flex items-center text-gray-400">
                          <Clock className="h-3 w-3 mr-1" />
                          {meal.time}
                        </span>
                      </div>
                      
                      {/* Show photo/notes if meal is completed */}
                      {meal.consumed && (meal.photo || meal.notes) && (
                        <div className="mt-2 p-2 bg-green-100/50 rounded-lg">
                          {meal.photo && (
                            <div 
                              className="relative group cursor-pointer"
                              onClick={() => openLightbox(meal.photo!)}
                            >
                              <img 
                                src={meal.photo} 
                                alt="Meal" 
                                className="w-full h-32 object-cover rounded-lg mb-2 transition-transform group-hover:scale-[1.02]"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                                <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          )}
                          {meal.notes && (
                            <p className="text-xs text-gray-600 italic">"{meal.notes}"</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action Button - Only show if not consumed */}
                    <div className="flex flex-col items-end gap-1">
                      {meal.consumed ? (
                        <div className="flex items-center gap-2 bg-green-500 text-white px-3 py-2 rounded-full">
                          <CheckCircle2 className="h-5 w-5" />
                          <span className="text-sm font-medium">Completed</span>
                        </div>
                      ) : (
                        <Button
                          onClick={() => openCompletionDialog(meal)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Complete Meal
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Completion Dialog - Photo + Notes + Submit */}
      <Dialog open={photoDialogOpen} onOpenChange={(open) => {
        if (!open && !uploadingPhoto) {
          setPhotoDialogOpen(false);
          setSelectedMeal(null);
          setPreviewPhoto(null);
          setMealNotes('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Complete: {selectedMeal?.name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Photo Upload (Required) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Meal Photo <span className="text-red-500">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoSelect}
                className="hidden"
              />
              
              {previewPhoto ? (
                <div className="relative group">
                  <img 
                    src={previewPhoto} 
                    alt="Meal" 
                    className="w-full h-48 object-cover rounded-lg border cursor-pointer"
                    onClick={() => openLightbox(previewPhoto)}
                  />
                  <div 
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center cursor-pointer"
                    onClick={() => openLightbox(previewPhoto)}
                  >
                    <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setPreviewPhoto(null); }}
                    className="absolute top-2 right-2 h-8 w-8 p-0 rounded-full z-10"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-2 border-dashed flex flex-col items-center justify-center gap-2"
                >
                  <Camera className="h-8 w-8 text-gray-400" />
                  <span className="text-sm text-gray-500">Click to take/upload photo</span>
                </Button>
              )}
            </div>

            {/* Notes (Optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <Textarea
                value={mealNotes}
                onChange={(e) => setMealNotes(e.target.value)}
                placeholder="How was the meal? Any changes made?"
                rows={2}
              />
            </div>

            {/* Meal Info Summary */}
            {selectedMeal && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Calories:</span>
                    <span className="font-medium">{Math.round(selectedMeal.calories)} kcal</span>
                  </div>
                  <div className="flex justify-between text-blue-600">
                    <span>Protein:</span>
                    <span>{Math.round(selectedMeal.protein)}g</span>
                  </div>
                  <div className="flex justify-between text-amber-600">
                    <span>Carbs:</span>
                    <span>{Math.round(selectedMeal.carbs)}g</span>
                  </div>
                  <div className="flex justify-between text-orange-600">
                    <span>Fat:</span>
                    <span>{Math.round(selectedMeal.fat)}g</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setPhotoDialogOpen(false);
                setSelectedMeal(null);
                setPreviewPhoto(null);
                setMealNotes('');
              }}
              disabled={uploadingPhoto}
            >
              Cancel
            </Button>
            <Button 
              onClick={completeMeal}
              disabled={uploadingPhoto || !previewPhoto}
              className="bg-green-600 hover:bg-green-700"
            >
              {uploadingPhoto ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Complete Meal
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox Modal for Full Screen Image View */}
      {lightboxOpen && lightboxImage && (
        <div 
          className="fixed inset-0 z-100 bg-black/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          {/* Close Button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-101 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <X className="h-8 w-8 text-white" />
          </button>

          {/* Image Container */}
          <div 
            className="relative max-w-full max-h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={lightboxImage}
              alt="Meal Photo"
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>

          {/* Tap anywhere to close hint */}
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            Tap anywhere to close
          </p>
        </div>
      )}
    </div>
  );
}
