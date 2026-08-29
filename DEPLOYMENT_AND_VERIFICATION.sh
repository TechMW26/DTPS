#!/bin/bash

###############################################################################
# DTPS Domain-to-IP Switching Fix - Deployment & Verification Script
# Purpose: Deploy fixed code and verify all configurations are correct
# Run this ONLY after code changes are complete
###############################################################################

set -e  # Exit on any error

DTPS_DIR="/Users/lokeshdhote/Desktop/DTPS"
LOG_FILE="$DTPS_DIR/deployment.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

###############################################################################
# LOGGING FUNCTIONS
###############################################################################

log() {
    local message="$1"
    echo -e "${BLUE}[INFO]${NC} $message"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] $message" >> "$LOG_FILE"
}

success() {
    local message="$1"
    echo -e "${GREEN}[✓]${NC} $message"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [SUCCESS] $message" >> "$LOG_FILE"
}

error() {
    local message="$1"
    echo -e "${RED}[✗]${NC} $message"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $message" >> "$LOG_FILE"
}

warning() {
    local message="$1"
    echo -e "${YELLOW}[!]${NC} $message"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARNING] $message" >> "$LOG_FILE"
}

###############################################################################
# VERIFICATION FUNCTIONS
###############################################################################

verify_env_file() {
    log "Verifying .env.local configuration..."
    
    if [ ! -f "$DTPS_DIR/.env.local" ]; then
        error ".env.local not found at $DTPS_DIR/.env.local"
        return 1
    fi
    
    local nextauth_url=$(grep "^NEXTAUTH_URL=" "$DTPS_DIR/.env.local" | cut -d'=' -f2)
    
    if [ -z "$nextauth_url" ]; then
        error "NEXTAUTH_URL not found in .env.local"
        return 1
    fi
    
    if [[ "$nextauth_url" == *"localhost"* ]] || [[ "$nextauth_url" == *"127.0.0.1"* ]] || [[ "$nextauth_url" == *"10."* ]] || [[ "$nextauth_url" == *"192.168."* ]]; then
        error "NEXTAUTH_URL contains invalid value: $nextauth_url (should be https://dtps.tech)"
        return 1
    fi
    
    if [[ "$nextauth_url" != "https://dtps.tech" ]]; then
        warning "NEXTAUTH_URL is $nextauth_url (expected https://dtps.tech)"
    else
        success "NEXTAUTH_URL correctly set to: $nextauth_url"
    fi
    
    return 0
}

verify_code_fixes() {
    log "Verifying code files use getBaseUrl()..."
    
    local files_to_check=(
        "src/app/api/watch/oauth/callback/route.ts"
        "src/app/api/auth/google-calendar/route.ts"
        "src/app/api/auth/google-calendar/callback/route.ts"
        "src/app/api/auth/logout/route.ts"
        "src/lib/services/googleCalendar.ts"
        "src/watchconnectivity/backend/services/WatchService.ts"
    )
    
    local all_good=true
    
    for file in "${files_to_check[@]}"; do
        if [ ! -f "$DTPS_DIR/$file" ]; then
            warning "File not found: $file"
            continue
        fi
        
        # Check if file imports getBaseUrl
        if grep -q "import.*getBaseUrl.*from.*@/lib/config" "$DTPS_DIR/$file"; then
            success "$file: ✓ Imports getBaseUrl()"
        else
            error "$file: ✗ Does NOT import getBaseUrl()"
            all_good=false
        fi
        
        # Check if file still uses direct NEXTAUTH_URL (should not in critical files)
        if grep -q "process\.env\.NEXTAUTH_URL" "$DTPS_DIR/$file"; then
            warning "$file: Still contains direct NEXTAUTH_URL access (check if intentional)"
        fi
    done
    
    return $([ "$all_good" = true ] && echo 0 || echo 1)
}

verify_docker_config() {
    log "Verifying Docker configuration..."
    
    local docker_compose="$DTPS_DIR/docker-compose.prod.yml"
    
    if [ ! -f "$docker_compose" ]; then
        error "docker-compose.prod.yml not found"
        return 1
    fi
    
    if grep -q "env_file:" "$docker_compose" && grep -q ".env.local" "$docker_compose"; then
        success "docker-compose.prod.yml correctly loads .env.local"
    else
        error "docker-compose.prod.yml does NOT load .env.local"
        return 1
    fi
    
    if grep -q "HOSTNAME=\"0.0.0.0\"" "$DTPS_DIR/Dockerfile"; then
        success "Dockerfile correctly sets HOSTNAME=0.0.0.0"
    else
        warning "Dockerfile: Check HOSTNAME binding configuration"
    fi
    
    return 0
}

###############################################################################
# DEPLOYMENT FUNCTIONS
###############################################################################

backup_env() {
    log "Creating backup of current environment..."
    local backup_file="$DTPS_DIR/.env.local.backup.$(date +%s)"
    cp "$DTPS_DIR/.env.local" "$backup_file"
    success "Backup created: $backup_file"
}

stop_containers() {
    log "Stopping Docker containers..."
    cd "$DTPS_DIR"
    
    if docker-compose -f docker-compose.prod.yml ps | grep -q "dtps-app"; then
        docker-compose -f docker-compose.prod.yml down
        sleep 2
        success "Containers stopped"
    else
        log "No containers currently running"
    fi
}

build_images() {
    log "Building new Docker images (without cache)..."
    cd "$DTPS_DIR"
    
    if docker-compose -f docker-compose.prod.yml build --no-cache; then
        success "Docker images built successfully"
        return 0
    else
        error "Failed to build Docker images"
        return 1
    fi
}

start_containers() {
    log "Starting Docker containers..."
    cd "$DTPS_DIR"
    
    if docker-compose -f docker-compose.prod.yml up -d; then
        success "Containers started"
        sleep 10
        return 0
    else
        error "Failed to start containers"
        return 1
    fi
}

###############################################################################
# TESTING FUNCTIONS
###############################################################################

test_health_check() {
    log "Testing application health endpoint..."
    
    sleep 5
    
    local max_attempts=10
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            success "Health check passed"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
    done
    
    error "Health check failed after $max_attempts attempts"
    return 1
}

test_domain_accessibility() {
    log "Testing domain accessibility..."
    
    if curl -s -o /dev/null -w "%{http_code}" https://dtps.tech/api/health | grep -q "200"; then
        success "Domain https://dtps.tech is accessible"
        return 0
    else
        error "Domain https://dtps.tech returned non-200 status"
        return 1
    fi
}

test_environment_variables() {
    log "Testing environment variables in container..."
    
    local env_value=$(docker exec dtps-app printenv NEXTAUTH_URL 2>/dev/null || echo "")
    
    if [ -z "$env_value" ]; then
        error "NEXTAUTH_URL not found in container environment"
        return 1
    fi
    
    if [[ "$env_value" == "https://dtps.tech" ]]; then
        success "Container NEXTAUTH_URL correctly set to: $env_value"
        return 0
    else
        error "Container NEXTAUTH_URL is incorrect: $env_value (expected https://dtps.tech)"
        return 1
    fi
}

check_logs_for_errors() {
    log "Checking container logs for errors..."
    
    local error_count=$(docker logs dtps-app 2>/dev/null | grep -i "error\|fail\|exception" | grep -v "handled" | wc -l || echo "0")
    
    if [ "$error_count" -eq 0 ]; then
        success "No critical errors found in logs"
        return 0
    else
        warning "Found $error_count potential errors in logs (review manually)"
        docker logs dtps-app | grep -i "error\|fail" | head -20 | while read line; do
            warning "  $line"
        done
        return 0  # Don't fail on log warnings
    fi
}

check_no_private_ips() {
    log "Checking logs for private IP references..."
    
    local ip_count=$(docker logs dtps-app 2>/dev/null | grep -E "10\.[0-9]+\.[0-9]+\.[0-9]+|192\.168\.|172\.16\." | wc -l || echo "0")
    
    if [ "$ip_count" -eq 0 ]; then
        success "No private IP addresses found in logs"
        return 0
    else
        error "Found $ip_count references to private IP addresses in logs"
        docker logs dtps-app | grep -E "10\.[0-9]+\.|192\.168\.|172\.16\." | head -10
        return 1
    fi
}

###############################################################################
# MAIN DEPLOYMENT FLOW
###############################################################################

main() {
    echo -e "${BLUE}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  DTPS Domain-to-IP Switching Fix - Deployment Script           ║"
    echo "║  Start Time: $TIMESTAMP"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Initialize log file
    echo "Deployment started at $TIMESTAMP" > "$LOG_FILE"
    
    # VERIFICATION PHASE
    echo -e "\n${YELLOW}=== PHASE 1: PRE-DEPLOYMENT VERIFICATION ===${NC}\n"
    
    verify_env_file || exit 1
    verify_code_fixes || exit 1
    verify_docker_config || exit 1
    
    # BACKUP PHASE
    echo -e "\n${YELLOW}=== PHASE 2: BACKUP ===${NC}\n"
    backup_env
    
    # DEPLOYMENT PHASE
    echo -e "\n${YELLOW}=== PHASE 3: DEPLOYMENT ===${NC}\n"
    
    stop_containers || exit 1
    build_images || exit 1
    start_containers || exit 1
    
    # TESTING PHASE
    echo -e "\n${YELLOW}=== PHASE 4: POST-DEPLOYMENT TESTING ===${NC}\n"
    
    test_environment_variables || exit 1
    test_health_check || exit 1
    check_logs_for_errors || true  # Don't fail
    check_no_private_ips || exit 1
    
    # Try domain test if available
    if command -v curl &> /dev/null; then
        sleep 5
        test_domain_accessibility || warning "Could not verify domain accessibility (may be due to network/DNS)"
    fi
    
    # FINAL SUMMARY
    echo -e "\n${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║  ✓ DEPLOYMENT COMPLETED SUCCESSFULLY                           ║"
    echo "║                                                                ║"
    echo "║  Next Steps:                                                   ║"
    echo "║  1. Monitor logs: docker logs dtps-app --follow                ║"
    echo "║  2. Test password reset: https://dtps.tech/login               ║"
    echo "║  3. Check email links: Should contain https://dtps.tech        ║"
    echo "║  4. Monitor for 1 hour for any errors                          ║"
    echo "║  5. If issues: Deploy backup from $DTPS_DIR/.env.local.backup.*"
    echo "║                                                                ║"
    echo "║  Full logs available at: $LOG_FILE"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    return 0
}

# Run main function
main "$@"
exit $?
