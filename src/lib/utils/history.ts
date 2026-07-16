/**
 * Utility for logging client history entries
 */

export interface HistoryLogData {
  userId: string;
  action: 'create' | 'update' | 'delete' | 'upload' | 'assign';
  category: 'profile' | 'medical' | 'lifestyle' | 'diet' | 'payment' | 'appointment' | 'document' | 'assignment' | 'other';
  description: string;
  changeDetails?: Array<{
    fieldName: string;
    oldValue: any;
    newValue: any;
  }>;
  metadata?: Record<string, any>;
}

/**
 * Log a history entry for a client
 * @param data History entry data
 * @returns Promise with the created history entry
 */
export async function logHistory(data: HistoryLogData) {
  try {
    const response = await fetch(`/api/users/${data.userId}/history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: data.action,
        category: data.category,
        description: data.description,
        changeDetails: data.changeDetails || [],
        metadata: data.metadata,
      }),
    });

    if (!response.ok) {
      console.error('Failed to log history:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error logging history:', error);
    return null;
  }
}

/**
 * Compare two objects and generate change details
 * @param oldData Old object
 * @param newData New object
 * @param fieldsToCompare Array of field names to compare (if undefined, all fields are compared)
 * @returns Array of change details
 */
export function generateChangeDetails(
  oldData: Record<string, any>,
  newData: Record<string, any>,
  fieldsToCompare?: string[]
): Array<{ fieldName: string; oldValue: any; newValue: any }> {
  const changes = [];
  const fields = fieldsToCompare || Object.keys(newData);

  for (const field of fields) {
    const oldValue = oldData?.[field];
    const newValue = newData[field];

    // Skip if values are the same (handle null/undefined comparison)
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      continue;
    }

    changes.push({
      fieldName: field,
      oldValue,
      newValue,
    });
  }

  return changes;
}

/**
 * Get category and action based on field and operation
 * @param fieldName Name of the field being changed
 * @param action Type of action (create, update, delete)
 * @returns Object with category and description
 */
export function getCategoryForField(
  fieldName: string,
  action: 'create' | 'update' | 'delete' = 'update'
): { category: string; description: string } {
  const fieldToCategory: Record<string, string> = {
    // Profile fields
    'firstName': 'profile',
    'lastName': 'profile',
    'email': 'profile',
    'phone': 'profile',
    'dateOfBirth': 'profile',
    'gender': 'profile',
    'parentAccount': 'profile',
    'maritalStatus': 'profile',
    'occupation': 'profile',
    'anniversary': 'profile',

    // Medical fields
    'medicalConditions': 'medical',
    'allergies': 'medical',
    'dietaryRestrictions': 'medical',
    'medication': 'medical',
    'bloodGroup': 'medical',
    'diseaseHistory': 'medical',
    'isPregnant': 'medical',
    'isLactating': 'medical',

    // Lifestyle fields
    'foodPreference': 'lifestyle',
    'preferredCuisine': 'lifestyle',
    'allergiesFood': 'lifestyle',
    'fastDays': 'lifestyle',
    'smokingFrequency': 'lifestyle',
    'alcoholFrequency': 'lifestyle',
    'activityLevel': 'lifestyle',

    // Diet fields
    'dietaryRecall': 'diet',
    'mealPlan': 'diet',
    'foodLog': 'diet',
  };

  const category = fieldToCategory[fieldName] || 'other';
  return {
    category,
    description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${fieldName}`,
  };
}
