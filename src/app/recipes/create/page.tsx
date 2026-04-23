'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRecipeAutoSave, type RecipeFormData } from '@/hooks';
import {
  Plus,
  Trash2,
  ChefHat,
  Clock,
  Users,
  Target,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { compressImage, validateImageFile, uploadCompressedImage } from '@/lib/imageCompression';

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  remarks?: string;
}

// Default empty form data
const defaultFormData: RecipeFormData = {
  name: '',
  description: '',
  prepTime: '',
  cookTime: '',
  servings: '',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  image: '',
  imagePreview: '',
  isActive: true,
  ingredients: [{ name: '', quantity: 0, unit: '', remarks: '' }],
  instructions: [''],
  dietaryRestrictions: [],
  medicalContraindications: [],
};

export default function CreateRecipePage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [forceCreate, setForceCreate] = useState(false);
  const [similarRecipe, setSimilarRecipe] = useState<{ id: string; name: string; ingredientOverlap: number } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [image, setImage] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [ingredients, setIngredients] = useState<Ingredient[]>([{ name: '', quantity: 0, unit: '', remarks: '' }]);
  const [instructions, setInstructions] = useState<string[]>(['']);
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [medicalContraindications, setMedicalContraindications] = useState<string[]>([]);

  // Memoize form data for auto-save
  const formData: RecipeFormData = useMemo(() => ({
    name,
    description,
    prepTime,
    cookTime,
    servings,
    calories,
    protein,
    carbs,
    fat,
    image,
    imagePreview,
    isActive,
    ingredients,
    instructions,
    dietaryRestrictions,
    medicalContraindications,
  }), [name, description, prepTime, cookTime, servings, calories, protein, carbs, fat, image, imagePreview, isActive, ingredients, instructions, dietaryRestrictions, medicalContraindications]);

  // Auto-save hook (saves draft every 2 seconds, expires after 24 hours)
  const {
    isSaving,
    lastSaved,
    hasDraft,
    clearDraft,
    restoreDraft
  } = useRecipeAutoSave('new-recipe', formData, {
    debounceMs: 2000,
    enabled: !!session?.user?.id,
  });

  // Restore draft on mount
  useEffect(() => {
    if (!draftRestored && session?.user?.id) {
      const restored = restoreDraft();
      if (restored) {
        // Restore all form fields
        setName(restored.name || '');
        setDescription(restored.description || '');
        setPrepTime(restored.prepTime || '');
        setCookTime(restored.cookTime || '');
        setServings(restored.servings || '');
        setCalories(restored.calories || '');
        setProtein(restored.protein || '');
        setCarbs(restored.carbs || '');
        setFat(restored.fat || '');
        setImage(restored.image || '');
        setImagePreview(restored.imagePreview || '');
        setIsActive(restored.isActive ?? true);
        setIngredients(restored.ingredients?.length ? restored.ingredients : [{ name: '', quantity: 0, unit: '', remarks: '' }]);
        setInstructions(restored.instructions?.length ? restored.instructions : ['']);
        setDietaryRestrictions(restored.dietaryRestrictions || []);
        setMedicalContraindications(restored.medicalContraindications || []);

        toast.success('Draft restored', {
          description: 'Your previous work has been restored. Draft expires in 24 hours.',
          duration: 4000
        });
      }
      setDraftRestored(true);
    }
  }, [session?.user?.id, draftRestored, restoreDraft]);

  // Handle clear draft
  const handleClearDraft = useCallback(() => {
    clearDraft();
    // Reset all form fields
    setName('');
    setDescription('');
    setPrepTime('');
    setCookTime('');
    setServings('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
    setImage('');
    setImagePreview('');
    setIsActive(true);
    setIngredients([{ name: '', quantity: 0, unit: '', remarks: '' }]);
    setInstructions(['']);
    setDietaryRestrictions([]);
    setMedicalContraindications([]);
    setError('');
    toast.success('Draft cleared', { description: 'Starting fresh.' });
  }, [clearDraft]);

  const availableDietaryRestrictions = [
    'Vegetarian', 'Vegan', 'Gluten-Free', 'Non-Vegetarian', 'Dairy-Free', 'Keto', 'Low-Carb', 'Low-Fat', 'High-Protein', 'Paleo', 'Mediterranean'
  ];

  const availableMedicalContraindications = [
    'Diabetes',
    'High Blood Pressure',
    'Heart Disease',
    'Kidney Disease',
    'Liver Disease',
    'High Cholesterol',
    'Thyroid Disorders',
    'Gout',
    'Acid Reflux/GERD',
    'IBS (Irritable Bowel Syndrome)',
    'Celiac Disease',
    'Lactose Intolerance',
    'Gallbladder Disease',
    'Osteoporosis',
    'Anemia',
    'Food Allergies',
    'Pregnancy',
    'Breastfeeding'
  ];

  const units = [
    'grams', 'kg', 'ounces', 'pounds', 'ml', 'liters', 'cups',
    'tablespoons', 'teaspoons', 'pieces', 'slices', 'cloves', 'bunches'
  ];

  const portionSizes = [
    '1 TSP ( 5 gm/ml )',
    '1.5 TSP ( 7.5 gm/ml )',
    '1/2 TSP ( 2.5 gm/ml )',
    '2 TSP ( 10 gm/ml )',
    '2.5 TSP ( 15 gm/ml )',
    '1 TBSP ( 15 gm/ml )',
    '1.5 TBSP ( 22.5 gm/ml )',
    '2 TBSP ( 30 gm/ml )',
    '1/2 SMALL BOWL ( 100 gm/ml )',
    '1 SMALL BOWL ( 200 gm/ml )',
    '1.5 SMALL BOWL ( 300 gm/ml )',
    '2.5 SMALL BOWL ( 500 gm/ml )',
    '1 LARGE BOWL ( 300 gm/ml )',
    '1.5 LARGE BOWL ( 150 gm/ml )',
    '2 LARGE BOWL ( 600 gm/ml )',
    '1/2 GLASS ( 125 ml )',
    '1 GLASS ( 250 ml )',
    '1 LARGE GLASS ( 300 ml )',
    '1/2 CUP ( 75 ml )',
    '1 CUP ( 150 ml )',
    '1 SMALL KATORI ( 100 gm/ml )',
    '1 MEDIUM KATORI ( 180 gm/ml )',
    '1 LARGE KATORI ( 250 gm/ml )',
    '1 PLATE ( 100 gm )',
    '1 MEDIUM PLATE ( 160 gm )',
    '1 LARGE PLATE ( 220 gm )',
    'GRAM',
    'ML',
    'EGG WHOLE ( 50 GM WHOLE )',
    'EGG WHITE ( 33 GM )',
    '1 DATES ( 10 GM )',
    'FIG (ANJEER) ( 15 gm )',
    'SEASONAL FRUIT ( 100 gm )',
    'SEASONAL FRUIT ( 200 gm )',
    'ROTI ( 35 GM )',
    'FULLKA ( 25 GM )',
    'STUFFED ROTI ( 50 GM )',
    'PARATHA ( 45 GM )',
    'STUFFED PARATHA ( 80 GM )',
    'BREAD (SMALL) ( 25 GM )',
    'BREAD (MEDIUM) ( 35 GM )',
    'BREAD (LARGE) ( 45 GM )'
  ];

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', quantity: 0, unit: '', remarks: '' }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string | number) => {
    const updatedIngredients = [...ingredients];
    updatedIngredients[index] = { ...updatedIngredients[index], [field]: value };
    setIngredients(updatedIngredients);
  };

  const addInstruction = () => {
    setInstructions([...instructions, '']);
  };

  const removeInstruction = (index: number) => {
    setInstructions(instructions.filter((_, i) => i !== index));
  };

  const updateInstruction = (index: number, value: string) => {
    const updatedInstructions = [...instructions];
    updatedInstructions[index] = value;
    setInstructions(updatedInstructions);
  };

  const toggleDietaryRestriction = (restriction: string) => {
    if (dietaryRestrictions.includes(restriction)) {
      setDietaryRestrictions(dietaryRestrictions.filter(r => r !== restriction));
    } else {
      setDietaryRestrictions([...dietaryRestrictions, restriction]);
    }
  };

  const toggleMedicalContraindication = (condition: string) => {
    if (medicalContraindications.includes(condition)) {
      setMedicalContraindications(medicalContraindications.filter(c => c !== condition));
    } else {
      setMedicalContraindications([...medicalContraindications, condition]);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid image file');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // Compress image
      const { blob, dataUrl, size } = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8,
      });

      // Show preview while uploading
      setImagePreview(dataUrl);

      // Upload to ImageKit
      const uploadedUrl = await uploadCompressedImage(blob, file.name, 'recipes');

      setImage(uploadedUrl);
      toast.success('Image uploaded successfully', {
        description: `Original: ${(file.size / 1024 / 1024).toFixed(2)}MB → Compressed: ${(blob.size / 1024 / 1024).toFixed(2)}MB`,
      });
    } catch (error) {
      console.error('Image upload error:', error);
      setError(error instanceof Error ? error.message : 'Failed to upload image');
      setImagePreview('');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !servings || ingredients.some(ing => !ing.name || !ing.unit)) {
      setError('Please fill in all required fields (name, serving size, and complete ingredient details)');
      return;
    }

    const validInstructions = instructions.filter(inst => inst.trim() !== '');
    if (validInstructions.length === 0) {
      setError('Please add at least one instruction');
      return;
    }

    // Validate serving size is selected
    if (!portionSizes.includes(servings)) {
      setError('Please select a valid serving size');
      return;
    }

    // Validate required nutrition fields
    if (!calories || !protein || !carbs || !fat) {
      setError('Please fill in all nutrition fields (calories, protein, carbs, fat)');
      return;
    }

    // Validate required time fields
    if (!prepTime || !cookTime) {
      setError('Please fill in prep time and cook time');
      return;
    }

    if (parseInt(prepTime) < 0) {
      setError('Prep time cannot be negative');
      return;
    }

    if (parseInt(cookTime) < 0) {
      setError('Cook time cannot be negative');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description || undefined,
          prepTime: prepTime ? parseInt(prepTime) : 0,
          cookTime: cookTime ? parseInt(cookTime) : 0,
          // Keep the selected portion label (e.g. "1/2 TSP...", "GRAM") so API can parse/store correctly.
          servings: servings ? servings.trim() : '1 serving',
          nutrition: {
            calories: calories ? parseFloat(calories) : 0,
            protein: protein ? parseFloat(protein) : 0,
            carbs: carbs ? parseFloat(carbs) : 0,
            fat: fat ? parseFloat(fat) : 0
          },
          image: image || undefined,
          isActive,
          ingredients,
          instructions: validInstructions,
          dietaryRestrictions,
          medicalContraindications,
          forceCreate,
        }),
      });

      if (response.ok) {
        // Clear draft after successful save
        clearDraft();
        setForceCreate(false);
        setSimilarRecipe(null);
        toast.success('Recipe created successfully!');
        router.push('/recipes?success=created');
      } else {
        const data = await response.json();
        console.error('Recipe creation failed:', data);

        // Handle duplicate / similar recipe warning
        if (response.status === 409 && data.canForceCreate && data.similarRecipe) {
          setSimilarRecipe(data.similarRecipe);
          setError('');
          toast.warning(`Similar recipe found: "${data.similarRecipe.name}"`, {
            description: 'You can create anyway or review the existing one.',
            duration: 6000,
          });
          setLoading(false);
          return;
        }

        // Handle detailed error messages
        if (data.details && Array.isArray(data.details)) {
          const errorMessages = data.details.map((detail: any) =>
            `${detail.field}: ${detail.message}`
          ).join(', ');
          setError(`${data.message || 'Validation failed'}: ${errorMessages}`);
          toast.error('Failed to create recipe', { description: errorMessages });
        } else {
          const errorMsg = data.message || data.error || 'Failed to create recipe';
          setError(errorMsg);
          toast.error('Failed to create recipe', { description: errorMsg });
        }
      }
    } catch (error) {
      console.error('Error creating recipe:', error);
      setError('Network error: Please check your connection and try again');
      toast.error('Network error', { description: 'Please check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create Recipe</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Add a new recipe to your database</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-save indicator */}
            {isSaving && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {!isSaving && lastSaved && (
              <span className="text-xs text-green-600 dark:text-green-400">
                Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
            {hasDraft && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearDraft}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear Draft
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Similar recipe warning */}
          {similarRecipe && (
            <Alert className="border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-300">
                <div className="space-y-2">
                  <p>
                    A similar recipe <strong>&quot;{similarRecipe.name}&quot;</strong> already exists
                    ({similarRecipe.ingredientOverlap}% ingredient overlap).
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-amber-400 text-amber-700 hover:bg-amber-100"
                      onClick={() => router.push(`/recipes/${similarRecipe.id}`)}
                    >
                      View Existing Recipe
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => {
                        setForceCreate(true);
                        setSimilarRecipe(null);
                        // Re-submit immediately
                        setTimeout(() => {
                          const form = document.querySelector('form');
                          if (form) form.requestSubmit();
                        }, 50);
                      }}
                    >
                      Create Anyway
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSimilarRecipe(null)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Basic Information</CardTitle>
                  <button
                    type="button"
                    onClick={() => setIsActive(!isActive)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${isActive
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                  >
                    {isActive ? (
                      <>
                        <ToggleRight className="w-5 h-5" />
                        Active
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="w-5 h-5" />
                        Inactive
                      </>
                    )}
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Recipe Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Paneer Butter Masala"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the recipe..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="image">Recipe Image</Label>
                  <div className="space-y-3">
                    {imagePreview && (
                      <div className="relative w-full h-48 rounded-lg overflow-hidden border border-gray-200">
                        <img
                          src={imagePreview}
                          alt="Recipe preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setImage('');
                            setImagePreview('');
                          }}
                          className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    <Input
                      id="image"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleImageUpload}
                      disabled={uploading}
                      className="cursor-pointer"
                    />
                    {uploading && (
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        <LoadingSpinner className="h-4 w-4" />
                        Uploading image...
                      </div>
                    )}
                    <div className="text-xs text-gray-500">
                      Upload an image for your recipe (max 10MB, JPG/PNG)
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="prepTime">Prep Time (min) *</Label>
                    <Input
                      id="prepTime"
                      type="number"
                      value={prepTime}
                      onChange={(e) => setPrepTime(e.target.value)}
                      placeholder="15"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="cookTime">Cook Time (min) *</Label>
                    <Input
                      id="cookTime"
                      type="number"
                      value={cookTime}
                      onChange={(e) => setCookTime(e.target.value)}
                      placeholder="30"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="servings">Serving Size *</Label>
                    <Select
                      value={servings}
                      onValueChange={(value) => setServings(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select serving size" />
                      </SelectTrigger>
                      <SelectContent>
                        {portionSizes.map((size) => (
                          <SelectItem key={size} value={size}>
                            {size}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Nutrition Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Target className="h-5 w-5" />
                  <span>Nutrition (per serving)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="calories">Calories *</Label>
                  <Input
                    id="calories"
                    type="number"
                    step="any"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    placeholder="350.5"
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="protein">Protein (g) *</Label>
                    <Input
                      id="protein"
                      type="number"
                      step="any"
                      value={protein}
                      onChange={(e) => setProtein(e.target.value)}
                      placeholder="25"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="carbs">Carbs (g) *</Label>
                    <Input
                      id="carbs"
                      type="number"
                      step="any"
                      value={carbs}
                      onChange={(e) => setCarbs(e.target.value)}
                      placeholder="30"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="fat">Fat (g) *</Label>
                    <Input
                      id="fat"
                      type="number"
                      step="any"
                      value={fat}
                      onChange={(e) => setFat(e.target.value)}
                      placeholder="15"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label>Dietary Restrictions</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {availableDietaryRestrictions.map((restriction) => (
                      <Badge
                        key={restriction}
                        variant={dietaryRestrictions.includes(restriction) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggleDietaryRestriction(restriction)}
                      >
                        {restriction}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Medical Contraindications</Label>
                  <p className="text-sm text-gray-600 mb-2">
                    Select medical conditions for which this recipe should NOT be recommended
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {availableMedicalContraindications.map((condition) => (
                      <div
                        key={condition}
                        className={`p-2 rounded-lg border cursor-pointer transition-colors ${medicalContraindications.includes(condition)
                          ? 'bg-red-50 border-red-200 text-red-800'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          }`}
                        onClick={() => toggleMedicalContraindication(condition)}
                      >
                        <div className="flex items-center space-x-2">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${medicalContraindications.includes(condition)
                            ? 'bg-red-500 border-red-500'
                            : 'border-gray-300'
                            }`}>
                            {medicalContraindications.includes(condition) && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm font-medium">{condition}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Ingredients */}
            <Card>
              <CardHeader>
                <CardTitle>Ingredients *</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <>
                  {ingredients.map((ingredient, index) => (
                    <div key={index} className="space-y-3">
                      <div className="grid grid-cols-12 gap-4 items-end">
                        <div className="col-span-4">
                          <Input
                            placeholder="Ingredient name"
                            value={ingredient.name}
                            onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="Quantity"
                            value={ingredient.quantity || ''}
                            onChange={(e) => updateIngredient(index, 'quantity', parseFloat(e.target.value) || 0)}
                          />
                        </div>
                        <div className="col-span-3">
                          <Select
                            value={ingredient.unit}
                            onValueChange={(value) => updateIngredient(index, 'unit', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent>
                              {units.map((unit) => (
                                <SelectItem key={unit} value={unit}>
                                  {unit}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <Input
                            placeholder="Remarks"
                            value={ingredient.remarks || ''}
                            onChange={(e) => updateIngredient(index, 'remarks', e.target.value)}
                          />
                        </div>
                        <div className="col-span-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeIngredient(index)}
                            disabled={ingredients.length === 1}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" onClick={addIngredient}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Ingredient
                  </Button>
                </>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Instructions *</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <>
                  {instructions.map((instruction, index) => (
                    <div key={index} className="flex items-start space-x-4">
                      <div className="shrink-0 w-8 h-8 bg-green-100 text-green-800 rounded-full flex items-center justify-center text-sm font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <Textarea
                          placeholder={`Step ${index + 1} instructions...`}
                          value={instruction}
                          onChange={(e) => updateInstruction(index, e.target.value)}
                          rows={2}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeInstruction(index)}
                        disabled={instructions.length === 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  <Button type="button" variant="outline" onClick={addInstruction}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Step
                  </Button>
                </>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <LoadingSpinner className="mr-2 h-4 w-4" />
                    Creating...
                  </>
                ) : (
                  'Create Recipe'
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
