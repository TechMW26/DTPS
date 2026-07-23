"""Deep dive into client C-7474 plans - find the 90-day plan."""
import pymongo
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime

MONGODB_URI = "mongodb+srv://avirajsharma_db_user:NjqypCD9sr0JNxvi@dtpscluster.hjx2qyc.mongodb.net/DTPS?retryWrites=true&w=majority"
client = MongoClient(MONGODB_URI)
db = client["DTPS"]

client_user_id = ObjectId("6a5dcb6e22c17d7fe427d1f1")
dietitian_id = ObjectId("6a0450ad80c23bcd2d24e7f0")

# 1. Check ALL clientmealplans for this client
print("=" * 60)
print("ALL ClientMealPlans for C-7474:")
all_plans = list(db.clientmealplans.find({"clientId": client_user_id}).sort("createdAt", -1))
print(f"Total: {len(all_plans)}")
for plan in all_plans:
    meals_count = len(plan.get('meals', []))
    start = plan.get('startDate')
    end = plan.get('endDate')
    duration_days = (end - start).days if start and end else 0
    print(f"  ID: {plan['_id']} | {plan.get('name')} | Status: {plan.get('status')} | "
          f"Phase: {plan.get('phaseTag','?')} | "
          f"Start: {str(start)[:10]} | End: {str(end)[:10]} | "
          f"Duration: {duration_days}d | Meals[]: {meals_count} | "
          f"Dietitian: {plan.get('dietitianId')}")

# 2. Check MealPlan collection too
print("\n" + "=" * 60)
print("MealPlan collection for this client:")
mp_plans = list(db.mealplans.find({"client": client_user_id}).sort("createdAt", -1))
print(f"Total: {len(mp_plans)}")
for plan in mp_plans:
    meals_count = len(plan.get('meals', []))
    start = plan.get('startDate')
    end = plan.get('endDate')
    duration_days = (end - start).days if start and end else 0
    print(f"  ID: {plan['_id']} | {plan.get('name')} | "
          f"Start: {str(start)[:10]} | End: {str(end)[:10]} | "
          f"Duration: {duration_days}d | Meals[]: {meals_count} | "
          f"Dietitian: {plan.get('dietitian')}")

# 3. Check DietTemplate collection
print("\n" + "=" * 60)
print("DietTemplate collection linked to C-7474 or Pramod:")
dt_plans = list(db.diettemplates.find({
    "$or": [
        {"clientId": client_user_id},
        {"dietitianId": dietitian_id},
    ]
}).sort("createdAt", -1))
print(f"Total: {len(dt_plans)}")
for plan in dt_plans:
    print(f"  ID: {plan['_id']} | {plan.get('name')} | Keys: {list(plan.keys())}")

# 4. Look at the full 11-meal plan in ClientMealPlan more carefully
print("\n" + "=" * 60)
print("DETAIL of the 11-meal ClientMealPlan:")
plan_11 = db.clientmealplans.find_one({"_id": ObjectId("6a5dfd5a22c17d7fe42d0d09")})
if plan_11:
    # Show ALL meals
    print(f"Name: {plan_11.get('name')}")
    print(f"Description (first 200 chars): {str(plan_11.get('description',''))[:200]}")
    print(f"Duration field: {plan_11.get('duration')}")
    print(f"Start: {plan_11.get('startDate')}")
    print(f"End: {plan_11.get('endDate')}")
    print(f"\nAll {len(plan_11.get('meals',[]))} meals:")
    for i, meal in enumerate(plan_11['meals']):
        if isinstance(meal, dict):
            day_label = meal.get('day', '?')
            date = str(meal.get('date', '?'))[:10]
            # Count meal types in this day
            meal_types = list(meal.get('meals', {}).keys()) if isinstance(meal.get('meals'), dict) else '?'
            note = str(meal.get('note', ''))[:80]
            print(f"  [{i}] {day_label} | {date} | mealTypes: {meal_types} | note: {note}")
    
    # Check if there's a template linked
    print(f"\nTemplate ID: {plan_11.get('templateId')}")
    if plan_11.get('templateId'):
        template = db.diettemplates.find_one({"_id": plan_11['templateId']})
        if template:
            days_in_template = len(template.get('meals', [])) if template.get('meals') else 0
            print(f"  Template: {template.get('name')} | Days: {days_in_template}")

# 5. Check all diet templates for Pramod
print("\n" + "=" * 60)
print("ALL DietTemplates by Pramod:")
all_templates = list(db.diettemplates.find({"dietitianId": dietitian_id}))
print(f"Total: {len(all_templates)}")
for t in all_templates:
    meals_count = len(t.get('meals', [])) if t.get('meals') else 0
    print(f"  ID: {t['_id']} | {t.get('name')} | Meals[]: {meals_count} | "
          f"Duration: {t.get('duration','?')} days | Keys: {list(t.keys())}")

# 6. Also check if there's a parent plan via previousPhaseId or extendedFromPlanId
print("\n" + "=" * 60)
print("Looking for linked plans (previous phases / extensions):")
for plan in all_plans:
    prev_id = plan.get('previousPhaseId')
    ext_id = plan.get('extendedFromPlanId')
    if prev_id:
        prev_plan = db.clientmealplans.find_one({"_id": prev_id})
        if prev_plan:
            print(f"  Previous phase of {plan['_id']}: {prev_plan.get('name')} | "
                  f"Meals: {len(prev_plan.get('meals',[]))} | "
                  f"Status: {prev_plan.get('status')}")
    if ext_id:
        ext_plan = db.clientmealplans.find_one({"_id": ext_id})
        if ext_plan:
            print(f"  Extended from: {ext_plan.get('name')} | "
                  f"Meals: {len(ext_plan.get('meals',[]))} | "
                  f"Status: {ext_plan.get('status')}")

client.close()
