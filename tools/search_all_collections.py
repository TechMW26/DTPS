"""Search all collections for 90-day plan data for C-7474."""
import pymongo
from pymongo import MongoClient
from bson import ObjectId
import re
import os

MONGODB_URI = os.environ["MONGODB_URI"]
client = MongoClient(MONGODB_URI)
db = client["DTPS"]

client_user_id = ObjectId("6a5dcb6e22c17d7fe427d1f1")
dietitian_id = ObjectId("6a0450ad80c23bcd2d24e7f0")

# List ALL collections
print("=" * 70)
print("ALL COLLECTIONS IN DB:")
all_cols = db.list_collection_names()
for c in sorted(all_cols):
    count = db[c].count_documents({})
    print(f"  {c}: {count} docs")

# Search ALL collections for references to this client
print("\n" + "=" * 70)
print("SEARCHING ALL COLLECTIONS for client C-7474 and/or dietitian Pramod...")

# Keywords to search for
client_refs = [client_user_id, "C-7474", "Faiz", "faizremedy"]
dietitian_refs = [dietitian_id]

for col_name in sorted(all_cols):
    col = db[col_name]
    
    # Build query
    or_clauses = []
    
    # Search by ObjectId fields
    for ref in client_refs:
        if isinstance(ref, ObjectId):
            # Try common field names
            for field in ['clientId', 'client', 'userId', 'user', 'createdBy']:
                try:
                    count = col.count_documents({field: ref}, limit=1)
                    if count > 0:
                        or_clauses.append(f"{field}=clientObjId")
                        break
                except:
                    pass
    
    # Search by string "C-7474"
    try:
        count = col.count_documents({"clientId": "C-7474"}, limit=1)
        if count > 0:
            or_clauses.append("clientId=C-7474")
    except:
        pass
    
    # Search by ObjectId in any field (try all string fields)
    try:
        # Just check a few common patterns
        for field in ['clientId', 'client', 'userId', 'user', 'dietitianId', 'dietitian', 'createdBy', 'assignedTo']:
            try:
                count = col.count_documents({field: client_user_id}, limit=1)
                if count > 0 and f"{field}=clientObjId" not in or_clauses:
                    or_clauses.append(f"{field}=clientObjId")
            except:
                pass
    except:
        pass
    
    if or_clauses:
        total = col.count_documents({})
        matching = 0
        # Get actual count
        try:
            for field in ['clientId', 'client', 'userId', 'user']:
                try:
                    matching += col.count_documents({field: client_user_id})
                except:
                    pass
        except:
            pass
        print(f"  {col_name}: {matching} matching / {total} total — fields: {', '.join(set(or_clauses))}")

# Now look at specific plan-related collections in detail
print("\n" + "=" * 70)
print("DETAILED LOOK AT PLAN-RELATED COLLECTIONS:")

# Check dietplan, diet_plan, diet-plans, etc.
for col_name in all_cols:
    if 'plan' in col_name.lower() or 'diet' in col_name.lower() or 'template' in col_name.lower() or 'meal' in col_name.lower():
        col = db[col_name]
        print(f"\n--- {col_name} ---")
        # Get all docs related to client
        try:
            docs = list(col.find({"$or": [
                {"clientId": client_user_id},
                {"client": client_user_id},
                {"userId": client_user_id},
            ]}).limit(20))
        except:
            docs = []
        
        if docs:
            for doc in docs:
                # Show key fields
                keys = list(doc.keys())
                name = doc.get('name', doc.get('title', 'N/A'))
                meals_arr = doc.get('meals', doc.get('mealPlans', doc.get('days', [])))
                meals_len = len(meals_arr) if isinstance(meals_arr, list) else 'N/A'
                print(f"  ID: {doc['_id']} | Name: {name} | Meals: {meals_len} | Keys: {keys[:15]}")
        else:
            print(f"  (no matching docs)")

# Also check for any document with duration=90
print("\n" + "=" * 70)
print("DOCUMENTS WITH duration=90:")
for col_name in all_cols:
    try:
        docs = list(db[col_name].find({"duration": 90}).limit(10))
        if docs:
            print(f"  {col_name}: {len(docs)} docs")
            for doc in docs:
                print(f"    ID: {doc['_id']} | {doc.get('name','?')} | Keys: {list(doc.keys())[:10]}")
    except:
        pass

client.close()
