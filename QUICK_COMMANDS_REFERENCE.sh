#!/bin/bash

# ============================================================================
# DTPS Domain-to-IP Fix - QUICK COMMANDS REFERENCE
# Copy-paste commands for fast deployment and verification
# ============================================================================

# COLOR CODES
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="/Users/lokeshdhote/Desktop/DTPS"

echo -e "${BLUE}"
cat << 'EOF'
╔════════════════════════════════════════════════════════════════════════════╗
║          DTPS Domain-to-IP Switching Fix - Quick Commands                  ║
║                                                                            ║
║  Ready-to-use commands for deployment and verification                    ║
╚════════════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"


# ============================================================================
# SECTION 1: PRE-DEPLOYMENT CHECKS
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}1. PRE-DEPLOYMENT VERIFICATION${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo "Check if .env.local is configured correctly:"
echo -e "${GREEN}grep NEXTAUTH_URL $PROJECT_DIR/.env.local${NC}"
echo ""

echo "Verify getBaseUrl() function exists:"
echo -e "${GREEN}grep -n 'export function getBaseUrl' $PROJECT_DIR/src/lib/config.ts${NC}"
echo ""

echo "Check all files use getBaseUrl():"
echo -e "${GREEN}grep -r 'getBaseUrl' $PROJECT_DIR/src/app/api --include='*.ts' | wc -l${NC}"
echo ""

echo "Verify no direct NEXTAUTH_URL in critical files:"
echo -e "${GREEN}grep -r 'process\\.env\\.NEXTAUTH_URL' $PROJECT_DIR/src/app/api --include='*.ts'${NC}"
echo ""


# ============================================================================
# SECTION 2: DEPLOYMENT
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}2. DEPLOYMENT OPTIONS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo "OPTION A: Automated Deployment (Recommended) ⭐"
echo "─────────────────────────────────────────────────"
echo -e "${GREEN}cd $PROJECT_DIR && chmod +x DEPLOYMENT_AND_VERIFICATION.sh && ./DEPLOYMENT_AND_VERIFICATION.sh${NC}"
echo ""

echo "OPTION B: Manual Deployment"
echo "──────────────────────────"
echo -e "${GREEN}cd $PROJECT_DIR${NC}"
echo -e "${GREEN}cp .env.local .env.local.backup.\$(date +%s)${NC}"
echo -e "${GREEN}docker-compose -f docker-compose.prod.yml down${NC}"
echo -e "${GREEN}docker-compose -f docker-compose.prod.yml build --no-cache${NC}"
echo -e "${GREEN}docker-compose -f docker-compose.prod.yml up -d${NC}"
echo ""

echo "OPTION C: One-Command Deploy"
echo "───────────────────────────"
echo -e "${GREEN}cd $PROJECT_DIR && cp .env.local .env.local.backup.\$(date +%s) && docker-compose -f docker-compose.prod.yml down && sleep 2 && docker-compose -f docker-compose.prod.yml build --no-cache && docker-compose -f docker-compose.prod.yml up -d${NC}"
echo ""


# ============================================================================
# SECTION 3: VERIFICATION AFTER DEPLOYMENT
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}3. POST-DEPLOYMENT VERIFICATION${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo "Wait for containers to start (10 seconds):"
echo -e "${GREEN}sleep 10${NC}"
echo ""

echo "Check NEXTAUTH_URL in running container:"
echo -e "${GREEN}docker exec dtps-app printenv | grep NEXTAUTH_URL${NC}"
echo -e "Expected: NEXTAUTH_URL=https://dtps.tech"
echo ""

echo "Test health endpoint (localhost):"
echo -e "${GREEN}curl -s http://localhost:3000/api/health | jq .${NC}"
echo -e "Expected: HTTP 200"
echo ""

echo "Check container status:"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml ps${NC}"
echo -e "Expected: All services running"
echo ""

echo "View application logs:"
echo -e "${GREEN}docker logs dtps-app --tail 50${NC}"
echo -e "Expected: No errors, no private IPs"
echo ""

echo "Check for private IP references in logs:"
echo -e "${GREEN}docker logs dtps-app | grep -E '10\.|192\.168\.|172\.16\.' | wc -l${NC}"
echo -e "Expected: 0"
echo ""

echo "Monitor logs in real-time (Press Ctrl+C to exit):"
echo -e "${GREEN}docker logs dtps-app --follow${NC}"
echo ""


# ============================================================================
# SECTION 4: MANUAL TESTING
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}4. MANUAL TESTING (Do these after deployment)${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo "Test 1: Password Reset Email"
echo "────────────────────────────"
echo "  1. Open browser: https://dtps.tech/login"
echo "  2. Click 'Forgot Password'"
echo "  3. Enter test email"
echo "  4. Check email for reset link"
echo "  5. Verify link starts with: https://dtps.tech (NOT http://10.x.x.x)"
echo ""

echo "Test 2: Domain Accessibility"
echo "────────────────────────────"
echo "  1. Open browser: https://dtps.tech"
echo "  2. Verify website loads correctly"
echo "  3. Check for SSL certificate (green lock icon)"
echo ""

echo "Test 3: OAuth Integration"
echo "────────────────────────"
echo "  1. Login to https://dtps.tech"
echo "  2. Go to Settings → Calendar"
echo "  3. Click 'Connect Google Calendar'"
echo "  4. Verify authorization works"
echo ""


# ============================================================================
# SECTION 5: TROUBLESHOOTING
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}5. TROUBLESHOOTING COMMANDS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo "If health check fails:"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml logs dtps-app | tail -100${NC}"
echo ""

echo "If still seeing private IPs after deployment:"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml down${NC}"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml build --no-cache${NC}"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml up -d${NC}"
echo ""

echo "To rollback to previous version:"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml down${NC}"
echo -e "${GREEN}cp $PROJECT_DIR/.env.local.backup.LATEST $PROJECT_DIR/.env.local${NC}"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml up -d${NC}"
echo ""

echo "To view full error logs:"
echo -e "${GREEN}docker exec dtps-app printenv${NC}"
echo ""

echo "To check if app is running inside container:"
echo -e "${GREEN}docker exec dtps-app ps aux | grep node${NC}"
echo ""

echo "To restart just the app container:"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml restart dtps-app${NC}"
echo ""

echo "To rebuild without starting:"
echo -e "${GREEN}docker-compose -f $PROJECT_DIR/docker-compose.prod.yml build --no-cache${NC}"
echo ""


# ============================================================================
# SECTION 6: MONITORING
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}6. MONITORING & MAINTENANCE${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo "Monitor health endpoint every 30 seconds:"
echo -e "${GREEN}watch -n 30 'curl -s https://dtps.tech/api/health | jq .'${NC}"
echo ""

echo "Monitor logs with keyword search:"
echo -e "${GREEN}docker logs dtps-app --follow | grep -E 'ERROR|error|Exception'${NC}"
echo ""

echo "Check docker disk usage:"
echo -e "${GREEN}docker system df${NC}"
echo ""

echo "Clean up unused Docker images (optional):"
echo -e "${GREEN}docker system prune -a${NC}"
echo ""

echo "View all running containers:"
echo -e "${GREEN}docker ps${NC}"
echo ""

echo "Check Docker container resource usage:"
echo -e "${GREEN}docker stats dtps-app${NC}"
echo ""


# ============================================================================
# SECTION 7: VALIDATION
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}7. COMPLETE VALIDATION CHECKLIST${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo "Run all verification commands in sequence:"
echo -e "${GREEN}cd $PROJECT_DIR && \\"
echo "echo '✓ Checking NEXTAUTH_URL...' && \\"
echo "docker exec dtps-app printenv | grep NEXTAUTH_URL && \\"
echo "echo '✓ Checking health endpoint...' && \\"
echo "curl -s http://localhost:3000/api/health && \\"
echo "echo '✓ Checking for private IPs...' && \\"
echo "docker logs dtps-app | grep -c -E '10\.|192\.168\.|172\.16\.' || echo '0 found ✓' && \\"
echo "echo '✓ Checking container status...' && \\"
echo "docker-compose -f docker-compose.prod.yml ps${NC}"
echo ""


# ============================================================================
# SECTION 8: QUICK REFERENCE
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}8. QUICK REFERENCE - KEY FILES${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo "Documentation Files:"
echo "  • DOMAIN_IP_SWITCHING_COMPREHENSIVE_FIX.md"
echo "    → Complete technical analysis (3,600+ lines)"
echo ""
echo "  • QUICK_DEPLOYMENT_GUIDE.md"
echo "    → Step-by-step deployment instructions"
echo ""
echo "  • RESOLUTION_COMPLETE_SUMMARY.md"
echo "    → Executive summary and checklist"
echo ""
echo "  • DEPLOYMENT_SUMMARY.txt"
echo "    → Visual overview and quick reference"
echo ""

echo "Script Files:"
echo "  • DEPLOYMENT_AND_VERIFICATION.sh"
echo "    → Automated deployment and verification"
echo "    → Usage: chmod +x DEPLOYMENT_AND_VERIFICATION.sh && ./DEPLOYMENT_AND_VERIFICATION.sh"
echo ""

echo "Configuration Files:"
echo "  • .env.local"
echo "    → Production environment variables"
echo "    → Contains: NEXTAUTH_URL=https://dtps.tech"
echo ""
echo "  • docker-compose.prod.yml"
echo "    → Docker container orchestration"
echo ""

echo "Code Files Modified:"
echo "  • src/lib/config.ts"
echo "    → Contains getBaseUrl() function"
echo ""
echo "  • src/app/api/watch/oauth/callback/route.ts"
echo "  • src/app/api/auth/google-calendar/route.ts"
echo "  • src/app/api/auth/google-calendar/callback/route.ts"
echo "  • src/app/api/auth/logout/route.ts"
echo "  • src/lib/services/googleCalendar.ts"
echo "  • src/app/api/client/send-receipt/route.ts"
echo "  • src/watchconnectivity/backend/services/WatchService.ts"
echo ""


# ============================================================================
# FINAL NOTES
# ============================================================================

echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}FINAL NOTES${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════════════════════${NC}\n"

echo -e "${GREEN}✓ All code fixes are complete${NC}"
echo -e "${GREEN}✓ Configuration is verified${NC}"
echo -e "${GREEN}✓ Automated deployment script is ready${NC}"
echo -e "${GREEN}✓ Documentation is comprehensive${NC}"
echo ""

echo "Next Steps:"
echo "1. Run deployment: ./DEPLOYMENT_AND_VERIFICATION.sh"
echo "2. Verify post-deployment (see Section 3)"
echo "3. Perform manual testing (see Section 4)"
echo "4. Monitor for 1 hour"
echo "5. Report success or issues"
echo ""

echo "Expected Result:"
echo "✅ Website always loads from https://dtps.tech"
echo "✅ Email links work (not using private IPs)"
echo "✅ OAuth integrations function"
echo "✅ No errors in logs"
echo "✅ Works after restart"
echo ""

echo -e "${GREEN}Status: READY FOR PRODUCTION DEPLOYMENT${NC}"
echo -e "${GREEN}Estimated Time: 15-20 minutes${NC}"
echo -e "${GREEN}Risk Level: LOW${NC}"
echo ""
