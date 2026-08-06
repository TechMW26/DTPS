"""Update C-7474 plan: keep first 10 days, remove day 11, set duration=10."""
import pymongo
from pymongo import MongoClient
from bson import ObjectId
import os
from datetime import datetime

MONGODB_URI = os.environ["MONGODB_URI"]
client = MongoClient(MONGODB_URI)
db = client["DTPS"]

plan_id = ObjectId("6a5dfd5a22c17d7fe42d0d09")

# Fetch current plan
plan = db.clientmealplans.find_one({"_id": plan_id})
if not plan:
    print("❌ Plan not found!")
    client.close()
    exit()

meals = plan.get('meals', [])
print(f"Current meals count: {len(meals)}")
print(f"Current duration: {plan.get('duration')}")
print(f"Current startDate: {plan.get('startDate')}")
print(f"Current endDate: {plan.get('endDate')}")

# Show what we're keeping and removing
print("\n--- Keeping (days 1-10): ---")
for i, meal in enumerate(meals[:10]):
    day = meal.get('day', '?') if isinstance(meal, dict) else '?'
    date = str(meal.get('date', '?'))[:10] if isinstance(meal, dict) else '?'
    print(f"  [{i}] {day} | {date}")

print("\n--- Removing (day 11): ---")
for i, meal in enumerate(meals[10:]):
    day = meal.get('day', '?') if isinstance(meal, dict) else '?'
    date = str(meal.get('date', '?'))[:10] if isinstance(meal, dict) else '?'
    print(f"  [{10+i}] {day} | {date}")

# Perform the update
new_meals = meals[:10]  # Keep first 10
new_duration = 10
# endDate stays as is (2026-07-31) since that's day 10

result = db.clientmealplans.update_one(
    {"_id": plan_id},
    {
        "$set": {
            "meals": new_meals,
            "duration": new_duration,
            "endDate": plan.get('startDate')  # Actually let me recalculate properly
        }
    }
)

# Recalculate endDate: startDate + 9 days = 10-day plan (day 1 to day 10 inclusive)
from datetime import timedelta
start = plan.get('startDate')
if isinstance(start, str):
    start = datetime.fromisoformat(start.replace('Z', '+00:00'))
new_end = start + timedelta(days=9)  # Day 1 through Day 10 = 9 days after start
new_end = new_end.replace(hour=23, minute=59, second=59, microsecond=0)

result = db.clientmealplans.update_one(
    {"_id": plan_id},
    {
        "$set": {
            "meals": new_meals,
            "duration": new_duration,
            "endDate": new_end
        }
    }
)

print(f"\n✅ Update result: matched={result.matched_count}, modified={result.modified_count}")

# Verify
plan_after = db.clientmealplans.find_one({"_id": plan_id})
print(f"\n--- AFTER UPDATE ---")
print(f"Meals count: {len(plan_after.get('meals', []))}")
print(f"Duration: {plan_after.get('duration')}")
print(f"Start: {plan_after.get('startDate')}")
print(f"End: {plan_after.get('endDate')}")

# Show all remaining meals
for i, meal in enumerate(plan_after['meals']):
    day = meal.get('day', '?') if isinstance(meal, dict) else '?'
    date = str(meal.get('date', '?'))[:10] if isinstance(meal, dict) else '?'
    print(f"  [{i}] {day} | {date}")

client.close()
print("\n✅ DONE - Plan updated successfully!")
