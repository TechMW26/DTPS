![alt text](image.png)# ════════════════════════════════════════════════════════════════
# Maintenance Page Deployment & Configuration Guide
# ════════════════════════════════════════════════════════════════

## 📋 Overview

This maintenance page is a self-contained, branded HTML file that Nginx will serve automatically whenever your Docker app is restarting, being redeployed, or otherwise unreachable (502/503/504 errors).

**Features:**
- ✅ Fully responsive (mobile, tablet, desktop, landscape)
- ✅ Self-contained (no external dependencies except Google Fonts CDN fallback)
- ✅ Animated progress bar and status indicators
- ✅ Accessible (works without JavaScript)
- ✅ Fast loading (single HTML file, ~12KB)

---

## 🚀 Quick Setup (5 minutes)

### Step 1: Deploy maintenance.html to VPS

**Option A: Use the deployment script (recommended)**

```bash
chmod +x deployment/deploy-maintenance.sh
./deployment/deploy-maintenance.sh root@your-vps-ip
```

**Option B: Manual SCP**

```bash
scp public/maintenance.html root@185.12.34.56:/var/www/html/maintenance.html
```

**Option C: Manual via SSH**

```bash
ssh root@185.12.34.56
# Then paste the contents of public/maintenance.html into:
nano /var/www/html/maintenance.html
# Press Ctrl+X, Y, Enter to save
```

---

### Step 2: Configure Nginx

SSH into your VPS and edit your Nginx config:

```bash
sudo nano /etc/nginx/sites-available/dtps
# or wherever your server block is
```

Find your server block (looks like `server { listen 443 ssl;`) and **add this inside it** (after any location blocks but still inside the `server {}` block):

```nginx
# Error pages for deployment/restart scenarios
error_page 502 503 504 /maintenance.html;

# Serve the maintenance page without exposing internal details
location = /maintenance.html {
  root /var/www/html;
  internal;
  expires 1m;
  add_header Cache-Control "public, max-age=60";
}

# Allow direct access to maintenance page if requested
location /maintenance.html {
  root /var/www/html;
  expires 1m;
  add_header Cache-Control "public, max-age=60";
}
```

---

### Step 3: Test & Reload

```bash
# Verify Nginx config is valid
sudo nginx -t

# Output should be:
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration will be tested is successful

# Reload Nginx (does NOT interrupt existing connections)
sudo systemctl reload nginx

# Verify it works
curl -I https://dtps.example.com/maintenance.html
# Should return 200 OK
```

---

## 🔧 Manual Maintenance Mode

If you want to **force** the maintenance page before deploying (to stop accepting new connections), add this **temporarily** inside your `server {}` block:

```nginx
# Temporary: Force maintenance mode
location / {
  return 503;
}
```

Then reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

**Important:** Remove that block after deployment completes, then reload again:

```bash
sudo systemctl reload nginx
```

---

## 🌐 Font Handling

The page uses Google Fonts (Syne + Instrument Sans) via CDN. If your VPS has no outbound internet access at boot time, the fonts may fail to load. 

**Fallback fonts are included** in the CSS, so the page will still be readable with system fonts (Georgia, Segoe UI, Roboto, sans-serif).

### Option A: System fonts only (no change needed)
The page already uses safe fallbacks. It will look good without external fonts.

### Option B: Self-host the fonts (advanced)
Download the Google Fonts and serve them from your VPS:

```bash
# Download fonts locally first
wget https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Instrument+Sans:wght@400;500&display=swap

# Upload to VPS
scp google-fonts.css root@vps:/var/www/html/fonts.css

# Update the <link> in maintenance.html to point locally
# Instead of: <link href="https://fonts.googleapis.com/..." rel="stylesheet"/>
# Use: <link href="/fonts.css" rel="stylesheet"/>
```

---

## ✅ Testing

### Test 1: Verify file exists on VPS

```bash
ssh root@185.12.34.56
curl http://localhost/maintenance.html | head -20
# Should show HTML content
```

### Test 2: Simulate error condition (careful!)

```bash
# Temporarily stop your app (if running on localhost:3000)
docker-compose stop  # or kill process

# Visit your domain
curl https://dtps.example.com/

# Should see maintenance page instead of error
# Then restart:
docker-compose up -d
```

### Test 3: Direct request

```bash
curl -I https://dtps.example.com/maintenance.html
# HTTP/1.1 200 OK
# Cache-Control: public, max-age=60
```

---

## 📊 Monitoring

Nginx logs will show when the page is served:

```bash
# View recent requests to maintenance page
sudo tail -f /var/log/nginx/access.log | grep maintenance.html

# View errors
sudo tail -f /var/log/nginx/error.log
```

---

## 🐛 Troubleshooting

### "Permission denied" when uploading

```bash
# Fix file permissions on VPS
ssh root@185.12.34.56
sudo chmod 644 /var/www/html/maintenance.html
sudo chown www-data:www-data /var/www/html/maintenance.html
```

### Maintenance page not showing on 502/503/504

```bash
# Verify Nginx config was reloaded
sudo systemctl reload nginx

# Check if /var/www/html/maintenance.html exists
ls -la /var/www/html/maintenance.html

# Test error_page directly
sudo nginx -t  # Should say OK

# Check Nginx logs
sudo tail -20 /var/log/nginx/error.log
```

### Page loads but styling is broken

```bash
# This usually means Google Fonts CDN is blocked
# The page will still work with fallback fonts
# To fix, either:
# 1. Allow outbound HTTPS from your VPS
# 2. Or self-host the fonts (see Font Handling section above)
```

### "internal" location error

```
location directive with absolute URI cannot have additional blocks (location argument);
```

This means your Nginx version is older. Remove the `internal;` directive:

```nginx
location = /maintenance.html {
  root /var/www/html;
  expires 1m;
  add_header Cache-Control "public, max-age=60";
}
```

---

## 📋 Deployment Checklist

- [ ] Copied `public/maintenance.html` to VPS at `/var/www/html/maintenance.html`
- [ ] Added Nginx error_page and location blocks to server config
- [ ] Ran `sudo nginx -t` (no errors)
- [ ] Ran `sudo systemctl reload nginx`
- [ ] Tested: `curl https://dtps.example.com/maintenance.html` returns 200
- [ ] Verified permissions: `chmod 644`, `chown www-data:www-data`
- [ ] Tested manual maintenance mode (optional)

---

## 🔄 During Deployment

**Before running Docker deployment:**

```bash
# Option 1: Let Nginx auto-serve it on 502/503/504 (recommended)
# No action needed — it happens automatically

# Option 2: Force maintenance mode first (optional)
ssh root@vps
sudo nano /etc/nginx/sites-available/dtps
# Uncomment the 'location / { return 503; }' block
sudo systemctl reload nginx
```

**After Docker is back online:**

```bash
# If you forced maintenance, remove it
ssh root@vps
sudo nano /etc/nginx/sites-available/dtps
# Comment out the 'location / { return 503; }' block
sudo systemctl reload nginx
```

---

## 🎨 Customization

To customize the maintenance page (change colors, text, etc.):

1. Edit `public/maintenance.html` locally
2. Redeploy with: `./deployment/deploy-maintenance.sh root@vps-ip`
3. Reload Nginx: `sudo systemctl reload nginx`

---

**That's it!** Your DTPS app now has a professional maintenance page that's automatically shown during deployments. 🎉
