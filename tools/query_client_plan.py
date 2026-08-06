"""Query DB for client C-7474 and their 90-day plan by DT Pramod."""
import pymongo
from pymongo import MongoClient
from bson import ObjectId
import json
import os
from datetime import datetime

# MongoDB connection
MONGODB_URI = os.environ["MONGODB_URI"]
client = MongoClient(MONGODB_URI)
db = client["DTPS"]

# 1. Find client C-7474
print("=" * 60)
print("1. Finding client C-7474...")
user = db.users.find_one({"clientId": "C-7474"})
if not user:
    print("❌ Client C-7474 NOT FOUND!")
    client.close()
    exit()

print(f"✅ Found: {user.get('firstName')} {user.get('lastName')}")
print(f"   User ID: {user['_id']}")
print(f"   Client ID: {user.get('clientId')}")
print(f"   Email: {user.get('email')}")
print(f"   Role: {user.get('role')}")

client_user_id = user['_id']

# 2. Find dietitian "DT Pramod" or similar
print("\n" + "=" * 60)
print("2. Finding dietitian 'DT Pramod'...")
dietitian = db.users.find_one({
    "role": "dietitian",
    "$or": [
        {"firstName": {"$regex": "pramod", "$options": "i"}},
        {"lastName": {"$regex": "pramod", "$options": "i"}},
        {"dtps_id": {"$regex": "pramod", "$options": "i"}},
    ]
})
if dietitian:
    print(f"✅ Found: {dietitian.get('firstName')} {dietitian.get('lastName')}")
    print(f"   User ID: {dietitian['_id']}")
    print(f"   DTPS ID: {dietitian.get('dtps_id')}")
    dietitian_id = dietitian['_id']
else:
    print("⚠️ Dietitian 'Pramod' not found by name, searching by DTPS ID prefix 'DT-'...")
    dietitian = db.users.find_one({"dtps_id": {"$regex": "^DT-", "$options": "i"}})
    if dietitian:
        print(f"   Found dietitian: {dietitian.get('firstName')} {dietitian.get('lastName')} ({dietitian.get('dtps_id')})")
    dietitian_id = None

# 3. Find ClientMealPlan for this client
print("\n" + "=" * 60)
print("3. Finding ClientMealPlans for this client...")

query = {"clientId": client_user_id}
if dietitian_id:
    query["dietitianId"] = dietitian_id

plans = list(db.clientmealplans.find(query).sort("createdAt", -1))
print(f"   Found {len(plans)} plan(s)")

for i, plan in enumerate(plans):
    meals_count = len(plan.get('meals', []))
    start = plan.get('startDate')
    end = plan.get('endDate')
    duration = (end - start).days if start and end else 0
    
    print(f"\n   --- Plan #{i+1} ---")
    print(f"   ID: {plan['_id']}")
    print(f"   Name: {plan.get('name')}")
    print(f"   Status: {plan.get('status')}")
    print(f"   Start: {start}")
    print(f"   End:   {end}")
    print(f"   Duration: {duration} days")
    print(f"   Meals array length: {meals_count}")
    print(f"   Phase: {plan.get('phaseTag', 'N/A')}")
    print(f"   Phase #: {plan.get('phaseNumber', 'N/A')}")
    
    # Show sample of meal days
    if meals_count > 0:
        print(f"\n   First 3 meal entries (sample):")
        for j, meal in enumerate(plan['meals'][:3]):
            if isinstance(meal, dict):
                day = meal.get('day', meal.get('dayNumber', '?'))
                date = meal.get('date', '?')
                print(f"      Day {day} | Date: {date} | Keys: {list(meal.keys())}")
            else:
                print(f"      [{j}] Type: {type(meal).__name__} = {str(meal)[:100]}")
        
        print(f"\n   Last 3 meal entries (sample):")
        for j, meal in enumerate(plan['meals'][-3:]):
            if isinstance(meal, dict):
                day = meal.get('day', meal.get('dayNumber', '?'))
                date = meal.get('date', '?')
                print(f"      Day {day} | Date: {date} | Keys: {list(meal.keys())}")
            else:
                print(f"      [{meals_count-3+j}] Type: {type(meal).__name__} = {str(meal)[:100]}")

print("\n" + "=" * 60)
print("DONE")
client.close()
