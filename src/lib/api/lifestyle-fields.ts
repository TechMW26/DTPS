const LIFESTYLE_FIELDS = [
  "heightFeet",
  "heightInch",
  "heightCm",
  "weightKg",
  "targetWeightKg",
  "idealWeightKg",
  "bmi",
  "foodPreference",
  "preferredCuisine",
  "allergiesFood",
  "fastDays",
  "nonVegExemptDays",
  "foodLikes",
  "foodDislikes",
  "eatOutFrequency",
  "smokingFrequency",
  "alcoholFrequency",
  "activityRate",
  "activityLevel",
  "cookingOil",
  "monthlyOilConsumption",
  "cookingSalt",
  "carbonatedBeverageFrequency",
  "cravingType",
  "sleepPattern",
  "stressLevel",
] as const;

type LifestyleField = (typeof LIFESTYLE_FIELDS)[number];

/**
 * Build a partial $set document without converting omitted fields into empty
 * strings/arrays. This lets section-specific and retried saves merge safely
 * instead of erasing data written by another form or device.
 */
export function pickDefinedLifestyleFields(
  source: Record<string, unknown>,
): Partial<Record<LifestyleField, unknown>> {
  const update: Partial<Record<LifestyleField, unknown>> = {};
  for (const field of LIFESTYLE_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(source, field) &&
      source[field] !== undefined
    ) {
      update[field] = source[field];
    }
  }
  return update;
}

export function pickDefinedFields(
  source: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  );
}
