// Add this to your server.js for better error handling and debugging

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

// Enhanced error logging
const logError = (error, context = '') => {
  console.error(`[ERROR] ${context}:`, error.message);
  console.error(`[ERROR] Stack:`, error.stack);
};

// Process error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ [FATAL] Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Environment validation with better error messages
const requiredEnvVars = ['NODE_ENV', 'SHOPIFY_STORE_URL', 'SHOPIFY_ACCESS_TOKEN', 'APP_URL'];
const optionalEnvVars = ['MONGODB_URI'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
const missingOptionalVars = optionalEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(`❌ [FATAL] Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please set these environment variables and restart the server.');
  process.exit(1);
}

if (missingOptionalVars.length > 0) {
  console.warn(`⚠️ [WARN] Missing optional environment variables: ${missingOptionalVars.join(', ')}`);
  console.warn('Points system will not work without MongoDB');
}

// Enhanced middleware with error handling
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Initialize database connection with retry
let databaseConnected = false;
let retryCount = 0;
const maxRetries = 3;

async function initializeDatabase() {
  try {
    databaseConnected = await connectDatabase();
    if (databaseConnected) {
      console.log('✅ [DATABASE] Successfully connected');
    } else {
      console.log('⚠️ [DATABASE] Not configured, running without database');
    }
  } catch (error) {
    retryCount++;
    console.error(`❌ [DATABASE] Connection failed (attempt ${retryCount}/${maxRetries}):`, error.message);
    
    if (retryCount < maxRetries) {
      console.log(`🔄 [DATABASE] Retrying in 5 seconds...`);
      setTimeout(initializeDatabase, 5000);
    } else {
      console.error('❌ [DATABASE] Max retries reached, continuing without database');
      databaseConnected = false;
    }
  }
}

initializeDatabase();

// Routes with error handling
try {
  app.use('/api/shopify', shopifyRoutes);
  console.log('✅ [ROUTES] Shopify routes loaded');
} catch (error) {
  logError(error, 'Loading Shopify routes');
  console.error('❌ [ROUTES] Failed to load Shopify routes');
}

try {
  app.use('/api/points', pointsRoutes);
  console.log('✅ [ROUTES] Points routes loaded');
} catch (error) {
  logError(error, 'Loading Points routes');
  console.error('❌ [ROUTES] Failed to load Points routes');
}

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
  try {
    const { testConnection } = require('./config/database');
    const dbStatus = await testConnection();
    
    const healthData = {
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
      },
      routes: {
        shopify: 'loaded',
        points: 'loaded'
      }
    };

    res.status(200).json(healthData);
  } catch (error) {
    logError(error, 'Health check');
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Root endpoint with detailed info
app.get('/', (req, res) => {
  try {
    res.json({
      message: 'Shopify Loyalty App API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      app_type: 'custom_app',
      shopify_status: process.env.SHOPIFY_ACCESS_TOKEN ? 'configured' : 'not_configured',
      database_status: databaseConnected ? 'connected' : 'not_connected',
      endpoints: {
        health: '/health',
        api: '/api',
        shopify_status: '/api/shopify/status',
        shopify_test: '/api/shopify/test',
        setup_checkout: '/api/shopify/setup-checkout-integration',
        checkout_script: '/api/shopify/checkout-points-widget.js',
        points_config: '/api/points/config',
        customer_points: '/api/points/customer/:customerId',
        points_analytics: '/api/points/analytics'
      }
    });
  } catch (error) {
    logError(error, 'Root endpoint');
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
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

// 404 handler
app.use('*', (req, res) => {
  console.log(`[404] Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    available_endpoints: [
      'GET /',
      'GET /health',
      'GET /api',
      'GET /api/shopify/status',
      'POST /api/shopify/setup-checkout-integration',
      'GET /api/points/config'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logError(err, `${req.method} ${req.path}`);
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

// Start server with error handling
app.listen(PORT, () => {
  console.log('🚀 =================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🚀 App URL: ${process.env.APP_URL || `http://localhost:${PORT}`}`);
  console.log(`🚀 Health check: ${process.env.APP_URL || `http://localhost:${PORT}`}/health`);
  console.log(`🚀 Shopify Store: ${process.env.SHOPIFY_STORE_URL || 'Not configured'}`);
  console.log(`🚀 Database: ${process.env.MONGODB_URI ? 'configured' : 'not configured'}`);
  console.log(`🚀 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
  console.log('🚀 =================================');
}).on('error', (err) => {
  console.error('❌ [FATAL] Server failed to start:', err);
  process.exit(1);
});