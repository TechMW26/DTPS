#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="dtps.tech"
EMAIL="avi2001raj@gmail.com"
APP_NAME="dtps"
APP_DIR=$(pwd)
REPO_OWNER="TechMW26"
REPO_NAME="DTPS"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
REPO_DIR="/opt/dtps"
GITHUB_TOKEN="${GITHUB_TOKEN:-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}"
CONTAINER_NAME="dtps-app"
NGINX_CONTAINER="dtps-nginx"

# Default options
FRESH_INSTALL=false
SETUP_SSL=true
SKIP_DEPS=false
NO_CACHE=false
RENEW_SSL=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --fresh)
            FRESH_INSTALL=true
            shift
            ;;
        --no-ssl)
            SETUP_SSL=false
            shift
            ;;
        --skip-deps)
            SKIP_DEPS=true
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --renew-ssl)
            RENEW_SSL=true
            shift
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --github-token)
            GITHUB_TOKEN="$2"
            shift 2
            ;;
        --help)
            echo "DTPS - Production Deployment Script for Hostinger VPS"
            echo ""
            echo "Usage: ./deploy-hostinger.sh [options]"
            echo ""
            echo "Options:"
            echo "  --fresh         Fresh install (clean Docker, rebuild everything)"
            echo "  --no-ssl        Skip SSL setup (HTTP only)"
            echo "  --skip-deps     Skip dependency installation (faster for updates)"
            echo "  --no-cache      Build Docker image without cache"
            echo "  --renew-ssl     Force SSL certificate renewal"
            echo "  --domain        Your domain name (default: dtps.tech)"
            echo "  --email         Email for SSL certificate (default: avi2001raj@gmail.com)"
            echo "  --github-token  GitHub personal access token for private repo access"
            echo "  --help          Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  GITHUB_TOKEN    GitHub personal access token (alternative to --github-token)"
            echo ""
            echo "Examples:"
            echo "  First time:   sudo GITHUB_TOKEN=ghp_xxx ./deploy-hostinger.sh --fresh"
            echo "  With flag:    sudo ./deploy-hostinger.sh --fresh --github-token ghp_xxx"
            echo "  Updates:      sudo ./deploy-hostinger.sh --skip-deps"
            echo "  Full rebuild: sudo ./deploy-hostinger.sh --no-cache"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# Check if running as root
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run as root: sudo ./deploy-hostinger.sh"
        exit 1
    fi
}

# Install system dependencies
install_dependencies() {
    log_step "Installing System Dependencies"
    
    log_info "Updating package lists..."
    apt-get update -qq
    
    log_info "Installing required packages..."
    apt-get install -y -qq \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release \
        git \
        ufw \
        software-properties-common \
        > /dev/null 2>&1
    
    log_success "System dependencies installed"
}

# Install Docker
install_docker() {
    log_step "Installing Docker"
    
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        log_success "Docker is already installed (version $DOCKER_VERSION)"
        
        # Ensure Docker is running
        systemctl start docker 2>/dev/null || true
        systemctl enable docker 2>/dev/null || true
        return
    fi
    
    log_info "Installing Docker using official script..."
    
    # Use official install script (fastest and most reliable)
    curl -fsSL https://get.docker.com | sh
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    # Wait for Docker to be ready
    sleep 3
    
    log_success "Docker installed successfully"
}

# Install Certbot for SSL
install_certbot() {
    log_step "Installing Certbot"
    
    if command -v certbot &> /dev/null; then
        log_success "Certbot is already installed"
        return
    fi
    
    log_info "Installing Certbot..."
    apt-get install -y -qq certbot > /dev/null 2>&1
    
    log_success "Certbot installed successfully"
}

# Stop conflicting web servers (LiteSpeed, Apache, etc.)
stop_conflicting_servers() {
    log_step "Stopping Conflicting Web Servers"
    
    # Stop and disable LiteSpeed (Hostinger VPS default)
    if systemctl is-active --quiet lsws 2>/dev/null; then
        log_info "Stopping LiteSpeed Web Server (lsws)..."
        systemctl stop lsws
        systemctl disable lsws
        log_success "LiteSpeed (lsws) stopped and disabled"
    elif systemctl is-active --quiet lshttpd 2>/dev/null; then
        log_info "Stopping OpenLiteSpeed (lshttpd)..."
        systemctl stop lshttpd
        systemctl disable lshttpd
        log_success "OpenLiteSpeed (lshttpd) stopped and disabled"
    elif systemctl is-active --quiet openlitespeed 2>/dev/null; then
        log_info "Stopping OpenLiteSpeed..."
        systemctl stop openlitespeed
        systemctl disable openlitespeed
        log_success "OpenLiteSpeed stopped and disabled"
    fi
    
    # Stop Apache if running
    if systemctl is-active --quiet apache2 2>/dev/null; then
        log_info "Stopping Apache2..."
        systemctl stop apache2
        systemctl disable apache2
        log_success "Apache2 stopped and disabled"
    fi
    
    # Stop any nginx installed on host (not Docker)
    if systemctl is-active --quiet nginx 2>/dev/null; then
        log_info "Stopping host Nginx (Docker Nginx will be used instead)..."
        systemctl stop nginx
        systemctl disable nginx
        log_success "Host Nginx stopped and disabled"
    fi
    
    # Kill anything still holding ports 80/443
    log_info "Ensuring ports 80/443 are free for Docker..."
    fuser -k 80/tcp 2>/dev/null || true
    fuser -k 443/tcp 2>/dev/null || true
    sleep 1
    
    # Verify ports are free
    PORT_80_PID=$(fuser 80/tcp 2>/dev/null || true)
    PORT_443_PID=$(fuser 443/tcp 2>/dev/null || true)
    
    if [ -n "$PORT_80_PID" ] || [ -n "$PORT_443_PID" ]; then
        log_warning "Ports 80/443 may still be in use. Trying harder..."
        fuser -k -9 80/tcp 2>/dev/null || true
        fuser -k -9 443/tcp 2>/dev/null || true
        sleep 2
    fi
    
    log_success "Ports 80/443 are available for Docker"
}

# Configure firewall
configure_firewall() {
    log_step "Configuring Firewall"
    
    log_info "Setting up UFW firewall rules..."
    
    # Reset and configure
    ufw --force reset > /dev/null 2>&1
    ufw default deny incoming > /dev/null 2>&1
    ufw default allow outgoing > /dev/null 2>&1
    
    # Allow essential ports
    ufw allow ssh > /dev/null 2>&1
    ufw allow 80/tcp > /dev/null 2>&1
    ufw allow 443/tcp > /dev/null 2>&1
    
    # Enable firewall
    ufw --force enable > /dev/null 2>&1
    
    log_success "Firewall configured (SSH, HTTP, HTTPS allowed)"
}

# Check environment file
check_env_file() {
    log_step "Checking Environment Configuration"
    
    # Check for .env or .env.local
    ENV_FILE=""
    if [ -f ".env.local" ]; then
        ENV_FILE=".env.local"
    elif [ -f ".env" ]; then
        ENV_FILE=".env"
        # docker-compose expects .env.local, so create symlink
        ln -sf .env .env.local
    fi
    
    if [ -z "$ENV_FILE" ]; then
        log_error "No .env or .env.local file found!"
        log_info "Create .env.local file with your configuration:"
        echo ""
        echo "  MONGODB_URI=mongodb+srv://..."
        echo "  JWT_SECRET=your-secret-key"
        echo "  NEXTAUTH_SECRET=your-nextauth-secret"
        echo "  NEXTAUTH_URL=https://${DOMAIN}"
        echo ""
        exit 1
    fi
    
    log_info "Using environment file: $ENV_FILE"
    
    # Validate required variables
    MONGODB_URI=$(grep -E "^MONGODB_URI=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
    
    if [ -z "$MONGODB_URI" ]; then
        log_error "MONGODB_URI is not set in $ENV_FILE"
        exit 1
    fi
    
    log_success "Environment configuration validated"
}

# Create SSL directories
setup_ssl_directories() {
    log_info "Setting up SSL directories..."
    
    mkdir -p /etc/letsencrypt
    mkdir -p /var/www/certbot
    mkdir -p /var/lib/letsencrypt
    
    # Ensure proper permissions
    chmod -R 755 /etc/letsencrypt
    chmod -R 755 /var/www/certbot
}

# Create temporary nginx config for SSL certificate generation
create_temp_nginx_config() {
    log_info "Creating temporary Nginx configuration for SSL setup..."
    
    cat > nginx-temp.conf <<'EOF'
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name dtps.tech www.dtps.tech;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'DTPS Server - SSL Setup in Progress';
            add_header Content-Type text/plain;
        }
    }
}
EOF
}

# Obtain SSL certificate using standalone mode
obtain_ssl_certificate() {
    log_step "Obtaining SSL Certificate"
    
    # Check if certificate already exists
    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        if $RENEW_SSL; then
            log_info "Forcing SSL certificate renewal..."
        else
            # Check certificate expiry
            CERT_EXPIRY=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" 2>/dev/null | cut -d= -f2)
            log_success "SSL certificate already exists (expires: $CERT_EXPIRY)"
            log_info "Use --renew-ssl to force renewal"
            return
        fi
    fi
    
    setup_ssl_directories
    
    log_info "Stopping any services on port 80..."
    # Stop Docker containers that might be using port 80
    docker stop ${NGINX_CONTAINER} 2>/dev/null || true
    docker rm ${NGINX_CONTAINER} 2>/dev/null || true
    
    # Stop LiteSpeed/Apache that Hostinger pre-installs
    systemctl stop lsws 2>/dev/null || true
    systemctl stop lshttpd 2>/dev/null || true
    systemctl stop openlitespeed 2>/dev/null || true
    systemctl stop apache2 2>/dev/null || true
    systemctl stop nginx 2>/dev/null || true
    
    # Kill anything on port 80 and 443
    fuser -k 80/tcp 2>/dev/null || true
    fuser -k 443/tcp 2>/dev/null || true
    sleep 2
    
    log_info "Obtaining SSL certificate for ${DOMAIN}..."
    
    # Use standalone mode (most reliable for first-time setup)
    certbot certonly \
        --standalone \
        --non-interactive \
        --agree-tos \
        --email ${EMAIL} \
        --domains ${DOMAIN},www.${DOMAIN} \
        --keep-until-expiring \
        --expand \
        || {
            log_warning "Failed with www subdomain, trying without..."
            certbot certonly \
                --standalone \
                --non-interactive \
                --agree-tos \
                --email ${EMAIL} \
                --domains ${DOMAIN} \
                --keep-until-expiring
        }
    
    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        log_success "SSL certificate obtained successfully!"
        
        # Setup auto-renewal cron job
        setup_ssl_renewal
    else
        log_error "Failed to obtain SSL certificate"
        log_info "You can try again with: sudo certbot certonly --standalone -d ${DOMAIN}"
        exit 1
    fi
}

# Setup automatic SSL renewal
setup_ssl_renewal() {
    log_info "Setting up automatic SSL renewal..."
    
    # Create renewal script
    cat > /usr/local/bin/renew-dtps-ssl.sh <<'EOF'
#!/bin/bash
# DTPS SSL Renewal Script

# Stop nginx container to free port 80
docker stop dtps-nginx 2>/dev/null || true

# Renew certificate
certbot renew --standalone --quiet

# Restart nginx container
docker start dtps-nginx 2>/dev/null || true

# Log renewal attempt
echo "$(date): SSL renewal attempted" >> /var/log/dtps-ssl-renewal.log
EOF

    chmod +x /usr/local/bin/renew-dtps-ssl.sh
    
    # Add cron job for renewal (runs at 3 AM on 1st and 15th of each month)
    CRON_JOB="0 3 1,15 * * /usr/local/bin/renew-dtps-ssl.sh"
    
    # Remove old cron job if exists and add new one
    crontab -l 2>/dev/null | grep -v "renew-dtps-ssl" | { cat; echo "$CRON_JOB"; } | crontab -
    
    log_success "SSL auto-renewal configured (runs on 1st and 15th of each month)"
}

# Update nginx.conf with correct domain
update_nginx_config() {
    log_info "Ensuring nginx.conf is configured for ${DOMAIN}..."
    
    # The existing nginx.conf should already be configured for dtps.tech
    # Just verify SSL paths exist
    if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        log_warning "SSL certificate not found, nginx may not start correctly"
    fi
}

# Update docker-compose.yml for production
update_docker_compose() {
    log_info "Updating docker-compose.yml for production..."
    
    cat > docker-compose.prod.yml <<EOF
services:
  # Next.js Application
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        BUILDKIT_INLINE_CACHE: 1
    container_name: ${CONTAINER_NAME}
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.local
    networks:
      - dtps-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # Nginx Reverse Proxy with SSL
  nginx:
    image: nginx:alpine
    container_name: ${NGINX_CONTAINER}
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - /var/www/certbot:/var/www/certbot:ro
    depends_on:
      app:
        condition: service_started
    networks:
      - dtps-network

networks:
  dtps-network:
    driver: bridge
EOF

    log_success "docker-compose.prod.yml created"
}

# Build authenticated repo URL if token is available
build_repo_url() {
    if [ -n "$GITHUB_TOKEN" ]; then
        echo "https://${GITHUB_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git"
    else
        echo "$REPO_URL"
    fi
}

# Clone or update repository from GitHub
clone_or_update_repo() {
    log_step "Setting Up Repository"

    local AUTH_URL
    AUTH_URL=$(build_repo_url)

    if [ -d "$REPO_DIR/.git" ]; then
        log_info "Repository already exists at $REPO_DIR"
        cd "$REPO_DIR"
        log_info "Ensuring remote points to ${REPO_OWNER}/${REPO_NAME}..."
        git remote set-url origin "$AUTH_URL" 2>/dev/null || true
        log_success "Repository ready"
    else
        if [ -z "$GITHUB_TOKEN" ]; then
            log_warning "No GITHUB_TOKEN set — repo is private, clone may fail!"
            log_warning "Set via: export GITHUB_TOKEN=ghp_xxx OR use --github-token flag"
        fi
        log_info "Cloning from ${REPO_OWNER}/${REPO_NAME}..."
        mkdir -p "$(dirname "$REPO_DIR")"
        git clone "$AUTH_URL" "$REPO_DIR"
        cd "$REPO_DIR"
        log_success "Repository cloned to $REPO_DIR"
    fi

    APP_DIR="$REPO_DIR"
}

# Pull latest code from git
pull_latest_code() {
    log_step "Pulling Latest Code"

    if [ -d .git ]; then
        local AUTH_URL
        AUTH_URL=$(build_repo_url)

        # Ensure correct remote with token
        CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
        if [ "$CURRENT_REMOTE" != "$AUTH_URL" ] && [ "$CURRENT_REMOTE" != "$REPO_URL" ]; then
            log_info "Updating remote to ${REPO_OWNER}/${REPO_NAME}..."
        fi
        git remote set-url origin "$AUTH_URL" 2>/dev/null || true

        log_info "Fetching latest from ${REPO_OWNER}/${REPO_NAME}..."
        git fetch origin 2>/dev/null || {
            log_error "Failed to fetch — is the GITHUB_TOKEN valid?"
            exit 1
        }
        git reset --hard origin/main 2>/dev/null || git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || log_warning "Could not pull latest code"
        log_success "Code updated"
    else
        log_warning "Not a git repository, skipping code pull"
    fi
}

# Deploy with Docker
deploy_docker() {
    log_step "Deploying with Docker"
    
    # Enable BuildKit for faster builds
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    
    # Determine compose file
    COMPOSE_FILE="docker-compose.prod.yml"
    if [ ! -f "$COMPOSE_FILE" ]; then
        COMPOSE_FILE="docker-compose.yml"
    fi
    
    log_info "Using compose file: $COMPOSE_FILE"
    
    # Build arguments
    BUILD_ARGS=""
    if $NO_CACHE; then
        BUILD_ARGS="--no-cache"
        log_info "Building without cache (fresh build)..."
    fi
    
    # Check for existing containers
    RUNNING_APP=$(docker ps -q -f name=${CONTAINER_NAME} 2>/dev/null || true)
    
    if [ -n "$RUNNING_APP" ] && ! $FRESH_INSTALL; then
        log_info "Performing zero-downtime deployment..."
        
        # Build new image while old container is still running
        log_info "Building new Docker image..."
        docker compose -f $COMPOSE_FILE build $BUILD_ARGS
        
        # Stop and remove old containers
        log_info "Stopping old containers..."
        docker compose -f $COMPOSE_FILE down --remove-orphans 2>/dev/null || true
        
        # Start new containers
        log_info "Starting new containers..."
        docker compose -f $COMPOSE_FILE up -d
    else
        if $FRESH_INSTALL; then
            log_info "Fresh install - cleaning up old containers and images..."
            docker compose -f $COMPOSE_FILE down --remove-orphans 2>/dev/null || true
            docker compose -f docker-compose.yml down --remove-orphans 2>/dev/null || true
            docker system prune -f > /dev/null 2>&1 || true
        fi
        
        log_info "Building Docker image..."
        docker compose -f $COMPOSE_FILE build $BUILD_ARGS
        
        log_info "Starting containers..."
        docker compose -f $COMPOSE_FILE up -d
    fi
    
    # Wait for containers to start
    log_info "Waiting for containers to start..."
    sleep 5
    
    # Check container status
    if docker ps | grep -q "${CONTAINER_NAME}.*Up"; then
        log_success "Application container is running"
    else
        log_error "Application container failed to start"
        log_info "Checking logs..."
        docker logs ${CONTAINER_NAME} --tail=30
        exit 1
    fi
    
    if docker ps | grep -q "${NGINX_CONTAINER}.*Up"; then
        log_success "Nginx container is running"
    else
        log_warning "Nginx container may have issues"
        docker logs ${NGINX_CONTAINER} --tail=20 2>/dev/null || true
    fi
    
    # Clean up old images
    log_info "Cleaning up old Docker images..."
    docker image prune -f > /dev/null 2>&1 || true
}

# Health check
health_check() {
    log_step "Running Health Checks"
    
    log_info "Waiting for application to be ready..."
    
    MAX_ATTEMPTS=30
    ATTEMPT=0
    
    while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
        ATTEMPT=$((ATTEMPT + 1))
        
        # Check if container is running
        if ! docker ps | grep -q "${CONTAINER_NAME}.*Up"; then
            log_error "Container stopped unexpectedly"
            docker logs ${CONTAINER_NAME} --tail=50
            exit 1
        fi
        
        # Try to reach the health endpoint
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
        
        if [ "$HTTP_CODE" = "200" ]; then
            log_success "Application is healthy (HTTP $HTTP_CODE)"
            break
        fi
        
        if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
            log_warning "Health check timed out, but container is running"
            log_info "The application may still be starting up..."
        fi
        
        sleep 2
    done
    
    # Check HTTPS if SSL is enabled
    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        HTTPS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -k https://localhost 2>/dev/null || echo "000")
        if [ "$HTTPS_CODE" = "200" ] || [ "$HTTPS_CODE" = "301" ] || [ "$HTTPS_CODE" = "302" ] || [ "$HTTPS_CODE" = "307" ]; then
            log_success "HTTPS is working (HTTP $HTTPS_CODE)"
        else
            log_warning "HTTPS check returned $HTTPS_CODE"
        fi
        
        # Verify the correct certificate is being served (not LiteSpeed default)
        CERT_CN=$(echo | openssl s_client -connect localhost:443 -servername ${DOMAIN} 2>/dev/null | openssl x509 -noout -subject 2>/dev/null | grep -o "CN = .*" | cut -d' ' -f3)
        if [ "$CERT_CN" = "${DOMAIN}" ]; then
            log_success "SSL certificate is correctly serving for ${DOMAIN}"
        elif [ -n "$CERT_CN" ]; then
            log_warning "SSL certificate CN is '${CERT_CN}' (expected '${DOMAIN}')"
            log_warning "A conflicting web server may be intercepting port 443"
            log_info "Check: ss -tlnp | grep -E ':80|:443'"
        fi
    fi
}

# Show deployment status
show_status() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                            ║${NC}"
    echo -e "${GREEN}║           🎉 DTPS Deployment Complete! 🎉                  ║${NC}"
    echo -e "${GREEN}║                                                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${CYAN}Container Status:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "NAME|dtps"
    echo ""
    
    echo -e "${CYAN}Useful Commands:${NC}"
    echo "  View logs:        docker logs -f ${CONTAINER_NAME}"
    echo "  Nginx logs:       docker logs -f ${NGINX_CONTAINER}"
    echo "  Restart app:      docker restart ${CONTAINER_NAME}"
    echo "  Restart all:      docker compose -f docker-compose.prod.yml restart"
    echo "  Stop all:         docker compose -f docker-compose.prod.yml down"
    echo "  Rebuild:          sudo ./deploy-hostinger.sh --skip-deps"
    echo "  Full rebuild:     sudo ./deploy-hostinger.sh --skip-deps --no-cache"
    echo ""
    
    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
        CERT_EXPIRY=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" 2>/dev/null | cut -d= -f2)
        echo -e "${CYAN}SSL Certificate:${NC}"
        echo "  Domain:           ${DOMAIN}"
        echo "  Expires:          ${CERT_EXPIRY}"
        echo "  Auto-renewal:     Enabled (1st and 15th of each month)"
        echo ""
        echo -e "${GREEN}🌐 Your site is live at: https://${DOMAIN}${NC}"
    else
        echo -e "${YELLOW}⚠️  SSL not configured. Site available at: http://${DOMAIN}${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Main deployment function
main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                            ║${NC}"
    echo -e "${CYAN}║     DTPS - Production Deployment for Hostinger VPS         ║${NC}"
    echo -e "${CYAN}║                                                            ║${NC}"
    echo -e "${CYAN}╠════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║  Domain:    ${DOMAIN}                                  ║${NC}"
    echo -e "${CYAN}║  Email:     ${EMAIL}                         ║${NC}"
    echo -e "${CYAN}║  SSL:       $(if $SETUP_SSL; then echo "Enabled "; else echo "Disabled"; fi)                                        ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check root
    check_root

    # Clone or update the repository
    clone_or_update_repo

    # ALWAYS stop conflicting web servers (LiteSpeed, Apache, etc.)
    # This is critical on Hostinger VPS where LiteSpeed is pre-installed
    stop_conflicting_servers

    # Install dependencies
    if ! $SKIP_DEPS; then
        install_dependencies
        install_docker
        if $SETUP_SSL; then
            install_certbot
        fi
        configure_firewall
    fi

    # Check environment
    check_env_file

    # Pull latest code
    pull_latest_code
    
    # SSL setup (before Docker to ensure certs exist)
    if $SETUP_SSL; then
        obtain_ssl_certificate
    fi
    
    # Update configurations
    update_docker_compose
    update_nginx_config
    
    # Stop conflicting servers again (they may have restarted during SSL setup)
    stop_conflicting_servers
    
    # Deploy
    deploy_docker
    
    # Health checks
    health_check
    
    # Show status
    show_status
}

# Run main function
main
