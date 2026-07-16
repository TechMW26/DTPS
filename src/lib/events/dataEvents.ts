// Event-based data refresh system
// Triggers automatic UI updates when data changes

type EventCallback = () => void;
type EventType =
  | 'meal-plan-updated'
  | 'meal-plan-created'
  | 'meal-plan-deleted'
  | 'meal-plan-frozen'
  | 'meal-plan-unfrozen'
  | 'meal-plan-extended'
  | 'meal-plan-paused'
  | 'meal-plan-resumed'
  | 'client-updated'
  | 'payment-updated'
  | 'purchase-updated'
  | 'notes-updated'
  | 'tasks-updated'
  | 'tags-updated'
  | 'transformations-updated'
  | 'blogs-updated'
  | 'dietitians-updated'
  | 'health-counselors-updated'
  | 'goal-categories-updated'
  | 'basic-info-updated'
  | 'lifestyle-info-updated'
  | 'medical-info-updated'
  | 'dietary-recall-updated'
  | 'form-data-updated'
  | 'data-changed'; // Generic event for any data change

class DataEventEmitter {
  private listeners: Map<EventType, Set<EventCallback>> = new Map();

  // Subscribe to an event
  on(event: EventType, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  // Emit an event to trigger all listeners
  emit(event: EventType, data?: any): void {

    // Trigger specific event listeners
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error);
      }
    });

    // Also trigger generic 'data-changed' listeners for any event
    if (event !== 'data-changed') {
      this.listeners.get('data-changed')?.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error(`Error in data-changed listener:`, error);
        }
      });
    }
  }

  // Remove all listeners for an event
  off(event: EventType): void {
    this.listeners.delete(event);
  }

  // Clear all listeners
  clear(): void {
    this.listeners.clear();
  }
}

// Singleton instance
export const dataEvents = new DataEventEmitter();

// Helper hooks for React components
export const DataEventTypes = {
  MEAL_PLAN_UPDATED: 'meal-plan-updated' as EventType,
  MEAL_PLAN_CREATED: 'meal-plan-created' as EventType,
  MEAL_PLAN_DELETED: 'meal-plan-deleted' as EventType,
  MEAL_PLAN_FROZEN: 'meal-plan-frozen' as EventType,
  MEAL_PLAN_UNFROZEN: 'meal-plan-unfrozen' as EventType,
  MEAL_PLAN_EXTENDED: 'meal-plan-extended' as EventType,
  MEAL_PLAN_PAUSED: 'meal-plan-paused' as EventType,
  MEAL_PLAN_RESUMED: 'meal-plan-resumed' as EventType,
  CLIENT_UPDATED: 'client-updated' as EventType,
  PAYMENT_UPDATED: 'payment-updated' as EventType,
  PURCHASE_UPDATED: 'purchase-updated' as EventType,
  NOTES_UPDATED: 'notes-updated' as EventType,
  TASKS_UPDATED: 'tasks-updated' as EventType,
  TAGS_UPDATED: 'tags-updated' as EventType,
  TRANSFORMATIONS_UPDATED: 'transformations-updated' as EventType,
  BLOGS_UPDATED: 'blogs-updated' as EventType,
  DIETITIANS_UPDATED: 'dietitians-updated' as EventType,
  HEALTH_COUNSELORS_UPDATED: 'health-counselors-updated' as EventType,
  GOAL_CATEGORIES_UPDATED: 'goal-categories-updated' as EventType,
  // Form data sync events
  BASIC_INFO_UPDATED: 'basic-info-updated' as EventType,
  LIFESTYLE_INFO_UPDATED: 'lifestyle-info-updated' as EventType,
  MEDICAL_INFO_UPDATED: 'medical-info-updated' as EventType,
  DIETARY_RECALL_UPDATED: 'dietary-recall-updated' as EventType,
  FORM_DATA_UPDATED: 'form-data-updated' as EventType,
  DATA_CHANGED: 'data-changed' as EventType,
};
