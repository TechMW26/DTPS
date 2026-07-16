/**
 * PM2 Ecosystem Configuration
 * 
 * Production-grade process management for the DTPS application.
 * Features:
 * - Cluster mode for utilizing multiple CPU cores
 * - Automatic restart on crashes
 * - Memory limit monitoring
 * - Graceful reload
 * - Log management
 */

module.exports = {
  apps: [
    {
      name: 'dtps-app',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: './',
      
      // Cluster mode - use all available CPUs
      instances: 'max',
      exec_mode: 'cluster',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      
      // Memory management
      max_memory_restart: '1G', // Restart if memory exceeds 1GB
      
      // Restart behavior
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s', // Minimum uptime to consider a start successful
      restart_delay: 4000, // Delay between restarts
      
      // Graceful shutdown
      kill_timeout: 10000, // Time to wait before force kill
      wait_ready: true, // Wait for process.send('ready')
      listen_timeout: 10000, // Timeout for ready signal
      
      // Logging
      log_file: './logs/combined.log',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Watch (disabled in production)
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.next', '.git'],
      
      // Advanced features
      exp_backoff_restart_delay: 100, // Exponential backoff on restart
      
      // Health check
      health_check_interval: 30000, // 30 seconds
      health_check_grace_period: 10000,
    },
  ],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:TechMW26/DTPS.git',
      path: '/var/www/dtps',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
};
