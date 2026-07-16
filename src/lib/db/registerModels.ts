/**
 * Model Registration Module
 * Ensures all Mongoose models are registered when the database connects
 */

// Import all models to register their schemas
import './User';
import './Appointment';
import './Recipe';
import './MealPlan';
import './Message';
import './Payment';
import './SystemAlert';
import './ProgressEntry';
import './FoodLog';
import './WooCommerceClient';
import './WatiContact';
import './ClientDocuments';
import './DietaryRecall';
import './LifestyleInfo';
import './MedicalInfo';
import './JournalTracking';
import './DietTemplate';
import './Task';
import './Tag';
import './History';
import './ActivityAssignment';

export function registerModels() {
  // All models are imported and registered above
  // This function is called to ensure models are loaded
}
