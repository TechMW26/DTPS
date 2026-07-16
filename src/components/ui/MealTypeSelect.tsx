'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  MEAL_TYPES, 
  MEAL_TYPE_KEYS, 
  getMealLabel,
  getMealTime12h,
  type MealTypeKey 
} from '@/lib/mealConfig';

interface MealTypeSelectProps {
  value?: string;
  onValueChange: (value: MealTypeKey) => void;
  placeholder?: string;
  showTime?: boolean;
  disabled?: boolean;
  className?: string;
  required?: boolean;
}

/**
 * MealTypeSelect Component
 * 
 * A dropdown select for meal types using the canonical meal configuration.
 * All meal types are displayed in chronological order with their IST times.
 */
export function MealTypeSelect({
  value,
  onValueChange,
  placeholder = 'Select meal type',
  showTime = true,
  disabled = false,
  className = '',
  required = false,
}: MealTypeSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={onValueChange as (value: string) => void}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {MEAL_TYPE_KEYS.map((key) => {
          const config = MEAL_TYPES[key];
          return (
            <SelectItem key={key} value={key}>
              {showTime 
                ? `${config.label} (${config.time12h})`
                : config.label
              }
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

interface MealTypeDisplayProps {
  mealType: string;
  showTime?: boolean;
  className?: string;
}

/**
 * MealTypeDisplay Component
 * 
 * Displays a meal type label with optional time.
 * Handles both canonical keys and legacy formats.
 */
export function MealTypeDisplay({
  mealType,
  showTime = false,
  className = '',
}: MealTypeDisplayProps) {
  const label = getMealLabel(mealType);
  const time = showTime ? getMealTime12h(mealType) : null;

  return (
    <span className={className}>
      {label}
      {time && <span className="text-muted-foreground ml-1">({time})</span>}
    </span>
  );
}

/**
 * MealTypeBadge Component
 * 
 * A badge-style display for meal types.
 */
export function MealTypeBadge({
  mealType,
  showTime = false,
  className = '',
}: MealTypeDisplayProps) {
  const label = getMealLabel(mealType);
  const time = showTime ? getMealTime12h(mealType) : null;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ${className}`}>
      {label}
      {time && <span className="ml-1 text-green-600">• {time}</span>}
    </span>
  );
}

export default MealTypeSelect;
