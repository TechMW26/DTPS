const SLEEP_PATTERN_MAP: Record<string, string> = {
  regular: 'regular-sleep',
  irregular: 'irregular-sleep',
  insomnia: 'insomnia-diagnosed',
  difficulty: 'difficulty-falling-asleep',
};

const STRESS_LEVEL_MAP: Record<string, string> = {
  none: 'none',
  low: 'rarely-stressed',
  mild: 'mild-occasional-stress',
  medium: 'moderate-stress',
  moderate: 'moderate-stress',
  high: 'frequent-stress',
  'rarely stressed': 'rarely-stressed',
  'mild occasional stress': 'mild-occasional-stress',
  'moderate stress': 'moderate-stress',
  'frequent stress': 'frequent-stress',
};

const FOOD_PREFERENCE_MAP: Record<string, string> = {
  veg: 'veg',
  vegetarian: 'veg',
  vegan: 'vegan',
  'non-veg': 'non-veg',
  'non veg': 'non-veg',
  'non-vegetarian': 'non-veg',
  'non vegetarian': 'non-veg',
  eggetarian: 'eggetarian',
  none: '',
};

function normalizeSelectValue(rawValue: unknown): string {
  const key = String(rawValue ?? '').trim().toLowerCase();
  if (!key) return '';
  // Custom Select serializes empty options as values like "__empty__-none".
  if (key === '__empty__' || key.startsWith('__empty__-')) return '';
  return key;
}

export function sanitizeLifestyleDoc<T extends Record<string, any> | null>(doc: T): T {
  if (!doc) return doc;
  const sanitized = { ...doc } as Record<string, any>;
  if (typeof sanitized.sleepPattern === 'string' && sanitized.sleepPattern.toLowerCase().startsWith('__empty__-')) {
    sanitized.sleepPattern = '';
  }
  if (typeof sanitized.stressLevel === 'string' && sanitized.stressLevel.toLowerCase().startsWith('__empty__-')) {
    sanitized.stressLevel = 'none';
  }
  if (sanitized.stressLevel === '') {
    sanitized.stressLevel = 'none';
  }
  return sanitized as T;
}

export function normalizeLifestylePayload(body: Record<string, any>): Record<string, any> {
  const normalized = { ...body };

  if (typeof normalized.foodPreference === 'string') {
    const key = normalizeSelectValue(normalized.foodPreference);
    if (Object.prototype.hasOwnProperty.call(FOOD_PREFERENCE_MAP, key)) {
      normalized.foodPreference = FOOD_PREFERENCE_MAP[key];
    } else {
      normalized.foodPreference = key;
    }
  }

  if (typeof normalized.sleepPattern === 'string') {
    const key = normalizeSelectValue(normalized.sleepPattern).replace(/[()]/g, '');
    if (key === '' || key === 'none') {
      normalized.sleepPattern = '';
    }
    if (SLEEP_PATTERN_MAP[key]) {
      normalized.sleepPattern = SLEEP_PATTERN_MAP[key];
    } else if (key.includes('irregular')) {
      normalized.sleepPattern = 'irregular-sleep';
    } else if (key.includes('regular')) {
      normalized.sleepPattern = 'regular-sleep';
    } else if (key.includes('insomnia')) {
      normalized.sleepPattern = 'insomnia-diagnosed';
    } else if (key.includes('difficulty')) {
      normalized.sleepPattern = 'difficulty-falling-asleep';
    }
  }

  if (typeof normalized.stressLevel === 'string') {
    const key = normalizeSelectValue(normalized.stressLevel);
    if (key === '') {
      normalized.stressLevel = '';
    } else if (STRESS_LEVEL_MAP[key]) {
      normalized.stressLevel = STRESS_LEVEL_MAP[key];
    } else {
      normalized.stressLevel = key;
    }
  }

  return normalized;
}
