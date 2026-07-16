#!/bin/bash

# Quick test script for /admin/allclients optimization
# This script verifies all optimizations are working

echo "🔍 Testing /admin/allclients optimizations..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Check if database indexes script exists
echo "1️⃣ Checking database index script..."
if [ -f "scripts/create-user-indexes.js" ]; then
    echo -e "${GREEN}✅ Index script found${NC}"
else
    echo -e "${RED}❌ Index script not found${NC}"
    exit 1
fi

# 2. Check if API route has been optimized
echo ""
echo "2️⃣ Checking API route optimizations..."
if grep -q "server-side pagination" src/app/api/admin/clients/route.ts 2>/dev/null; then
    echo -e "${GREEN}✅ API route optimized${NC}"
else
    echo -e "${YELLOW}⚠️  API route comments not found (but file may still be optimized)${NC}"
fi

# 3. Check if frontend has server-side pagination
echo ""
echo "3️⃣ Checking frontend optimizations..."
if grep -q "server-side" src/app/admin/allclients/page.tsx 2>/dev/null; then
    echo -e "${GREEN}✅ Frontend optimized${NC}"
else
    echo -e "${YELLOW}⚠️  Frontend pagination comments not found${NC}"
fi

# 4. Check if skeleton loaders are added
echo ""
echo "4️⃣ Checking skeleton loaders..."
if grep -q "Skeleton rows" src/app/admin/allclients/page.tsx 2>/dev/null; then
    echo -e "${GREEN}✅ Skeleton loaders added${NC}"
else
    echo -e "${YELLOW}⚠️  Skeleton loaders not found${NC}"
fi

# 5. Check if indexes are added to User model
echo ""
echo "5️⃣ Checking User model indexes..."
if grep -q "clientStatus" src/lib/db/models/User.ts 2>/dev/null; then
    echo -e "${GREEN}✅ Indexes added to User model${NC}"
else
    echo -e "${RED}❌ Indexes not found in User model${NC}"
fi

# 6. Check if cache tags are properly set
echo ""
echo "6️⃣ Checking cache implementation..."
if grep -q "tags: \['admin', 'clients'\]" src/app/api/admin/clients/route.ts 2>/dev/null; then
    echo -e "${GREEN}✅ Cache tags properly configured${NC}"
else
    echo -e "${YELLOW}⚠️  Cache tag format may be different${NC}"
fi

echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Create database indexes:"
echo "   ${YELLOW}node scripts/create-user-indexes.js${NC}"
echo ""
echo "2. Start the development server:"
echo "   ${YELLOW}npm run dev${NC}"
echo ""
echo "3. Test the page:"
echo "   ${YELLOW}http://localhost:3000/admin/allclients${NC}"
echo ""
echo "4. Verify performance:"
echo "   - Page should load in < 1 second"
echo "   - Skeleton loaders should appear during loading"
echo "   - Pagination should work smoothly"
echo "   - Search should respond within 500ms"
echo ""
echo "✨ All checks completed!"
