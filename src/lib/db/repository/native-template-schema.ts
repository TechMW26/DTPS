import {z} from 'zod';
import {MEAL_TYPES,MEAL_TYPE_KEYS} from '@/lib/mealConfig';
// Get default meal types from canonical config
const getCanonicalMealTypes = () => MEAL_TYPE_KEYS.map(key => ({
  name: MEAL_TYPES[key].label,
  time: MEAL_TYPES[key].time12h
}));

// Validation schema for meal type config
const mealTypeConfigSchema = z.object({
  name: z.string().min(1),
  time: z.string().optional()
});

const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

export const sanitizeDietTemplatePayload = (body: any) => ({
  ...body,
  duration: toFiniteNumber(body?.duration, 1),
  targetCalories: {
    min: toFiniteNumber(body?.targetCalories?.min, 1200),
    max: toFiniteNumber(body?.targetCalories?.max, 2500)
  },
  targetMacros: {
    protein: {
      min: toFiniteNumber(body?.targetMacros?.protein?.min, 50),
      max: toFiniteNumber(body?.targetMacros?.protein?.max, 150)
    },
    carbs: {
      min: toFiniteNumber(body?.targetMacros?.carbs?.min, 100),
      max: toFiniteNumber(body?.targetMacros?.carbs?.max, 300)
    },
    fat: {
      min: toFiniteNumber(body?.targetMacros?.fat?.min, 30),
      max: toFiniteNumber(body?.targetMacros?.fat?.max, 100)
    }
  },
  prepTime: {
    daily: toFiniteNumber(body?.prepTime?.daily, 30),
    weekly: toFiniteNumber(body?.prepTime?.weekly, 210)
  }
});

// Validation schema for diet template (no word limits)
export const dietTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional().default(''),
  category: z.enum(['weight-loss', 'weight-gain', 'maintenance', 'muscle-gain', 'diabetes', 'heart-healthy', 'keto', 'vegan', 'custom']),
  duration: z.number().min(1).max(365),
  targetCalories: z.object({
    min: z.number().min(0).max(10000),
    max: z.number().min(0).max(10000)
  }).optional().default({ min: 1200, max: 2500 }),
  targetMacros: z.object({
    protein: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }).optional().default({ min: 50, max: 150 }),
    carbs: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }).optional().default({ min: 100, max: 300 }),
    fat: z.object({
      min: z.number().min(0),
      max: z.number().min(0)
    }).optional().default({ min: 30, max: 100 })
  }).optional().default({
    protein: { min: 50, max: 150 },
    carbs: { min: 100, max: 300 },
    fat: { min: 30, max: 100 }
  }),
  dietaryRestrictions: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  meals: z.array(z.any()).default([]),
  mealTypes: z.array(mealTypeConfigSchema).optional().default(getCanonicalMealTypes()),
  isPublic: z.boolean().optional().default(false),
  isPremium: z.boolean().optional().default(false),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional().default('intermediate'),
  prepTime: z.object({
    daily: z.number().min(0),
    weekly: z.number().min(0)
  }).optional().default({ daily: 30, weekly: 210 }),
  targetAudience: z.object({
    ageGroup: z.array(z.string()).default([]),
    activityLevel: z.array(z.string()).default([]),
    healthConditions: z.array(z.string()).default([]),
    goals: z.array(z.string()).default([])
  }).optional().default({
    ageGroup: [],
    activityLevel: [],
    healthConditions: [],
    goals: []
  })
});
