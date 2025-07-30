const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import database connection
const { connectDatabase } = require('./config/database');

// Import routes
const shopifyRoutes = require('./routes/shopify');
const pointsRoutes = require('./routes/points');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple error logging
const logError = (error, context = '') => {
  console.error(`[ERROR] ${context}:`, error);
};

// Environment validation
const requiredEnvVars = ['NODE_ENV', 'SHOPIFY_STORE_URL', 'SHOPIFY_ACCESS_TOKEN', 'APP_URL'];
const optionalEnvVars = ['MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
const missingOptionalVars = optionalEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.warn(`[WARN] Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.warn('[WARN] Some Shopify features may not work properly');
}

if (missingOptionalVars.length > 0) {
  console.warn(`[WARN] Missing optional environment variables: ${missingOptionalVars.join(', ')}`);
  console.warn('[WARN] Points system will not work without MongoDB');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database connection
let databaseConnected = false;
connectDatabase().then(connected => {
  databaseConnected = connected;
}).catch(error => {
  console.error('[DATABASE] Failed to connect:', error);
});

// Routes
app.use('/api/shopify', shopifyRoutes);
app.use('/api/points', pointsRoutes);

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
  const { testConnection } = require('./config/database');
  const dbStatus = await testConnection();
  
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
    },
    database: {
      connected: dbStatus.connected,
      name: dbStatus.database || 'Not connected',
      error: dbStatus.error || null
    },
    shopify: {
      configured: !!process.env.SHOPIFY_ACCESS_TOKEN,
      store_url: process.env.SHOPIFY_STORE_URL || 'Not configured'
    }
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Shopify Loyalty App API',
    version: '1.0.0',
    app_type: 'custom_app',
    shopify_status: process.env.SHOPIFY_ACCESS_TOKEN ? 'configured' : 'not_configured',
    database_status: databaseConnected ? 'connected' : 'not_connected',
    endpoints: {
      health: '/health',
      api: '/api',
      shopify_status: '/api/shopify/status',
      shopify_test: '/api/shopify/test',
      setup_webhooks: '/api/shopify/setup-webhooks',
      orders: '/api/shopify/orders',
      points_config: '/api/points/config',
      customer_points: '/api/points/customer/:customerId',
      points_analytics: '/api/points/analytics'
    }
  });
});

// API routes placeholder
app.get('/api', (req, res) => {
  res.json({
    message: 'API is working',
    timestamp: new Date().toISOString(),
    database_connected: databaseConnected,
    available_routes: {
      shopify: '/api/shopify/*',
      points: '/api/points/*'
    }
  });
});

// Test route to verify Shopify connection
app.get('/api/shopify-test', async (req, res) => {
  try {
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({
        error: 'Shopify not configured',
        missing: {
          store_url: !process.env.SHOPIFY_STORE_URL,
          access_token: !process.env.SHOPIFY_ACCESS_TOKEN
        }
      });
    }
    
    res.json({
      message: 'Shopify configuration detected',
      store_url: process.env.SHOPIFY_STORE_URL,
      has_token: !!process.env.SHOPIFY_ACCESS_TOKEN,
      app_url: process.env.APP_URL
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    available_endpoints: [
      'GET /',
      'GET /health',
      'GET /api',
      'GET /api/shopify/status',
      'GET /api/points/config'
    ]
  });
});

// Error handler with logging
app.use((err, req, res, next) => {
  logError(err, `${req.method} ${req.path}`);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
  console.log(`🛍️ Shopify: ${process.env.SHOPIFY_STORE_URL ? 'configured' : 'not configured'}`);
  console.log(`🗄️ Database: ${process.env.MONGODB_URI ? 'configured' : 'not configured'}`);
});