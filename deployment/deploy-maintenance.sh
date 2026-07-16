#!/bin/bash

# ════════════════════════════════════════════════════════════════
# Deploy Maintenance Page to Hostinger VPS
# ════════════════════════════════════════════════════════════════
#
# Usage:
#   chmod +x deploy-maintenance.sh
#   ./deploy-maintenance.sh username@vps-ip-address
#
# Example:
#   ./deploy-maintenance.sh root@185.12.34.56
#
# ════════════════════════════════════════════════════════════════

set -e  # Exit on error

if [ -z "$1" ]; then
  echo "❌ Error: SSH target required"
  echo ""
  echo "Usage: ./deploy-maintenance.sh username@vps-ip-address"
  echo ""
  echo "Examples:"
  echo "  ./deploy-maintenance.sh root@185.12.34.56"
  echo "  ./deploy-maintenance.sh ubuntu@dtps.example.com"
  exit 1
fi

TARGET="$1"
LOCAL_FILE="$(dirname "$0")/../public/maintenance.html"
REMOTE_PATH="/var/www/html/maintenance.html"

echo "📦 Deploying maintenance page..."
echo "   Source: $LOCAL_FILE"
echo "   Target: $TARGET:$REMOTE_PATH"
echo ""

# Verify local file exists
if [ ! -f "$LOCAL_FILE" ]; then
  echo "❌ Error: $LOCAL_FILE not found"
  exit 1
fi

# Copy file via SCP
echo "⬆️  Uploading maintenance.html..."
scp "$LOCAL_FILE" "$TARGET:$REMOTE_PATH"

if [ $? -eq 0 ]; then
  echo "✅ File uploaded successfully"
  echo ""
  echo "🔧 Next steps on your VPS:"
  echo "   1. Add the Nginx config from deployment/nginx-maintenance-config.conf"
  echo "   2. Run: sudo nginx -t"
  echo "   3. Run: sudo systemctl reload nginx"
  echo ""
  echo "To verify it works:"
  echo "   curl -I https://dtps.example.com/maintenance.html"
else
  echo "❌ Upload failed"
  exit 1
fi
