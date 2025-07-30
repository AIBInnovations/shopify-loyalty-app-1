const express = require('express');
const cors = require('cors');
require('dotenv').config();

// Import routes
const shopifyRoutes = require('./routes/shopify');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple error logging
const logError = (error, context = '') => {
  console.error(`[ERROR] ${context}:`, error);
};

// Environment validation
const requiredEnvVars = ['NODE_ENV', 'SHOPIFY_STORE_URL', 'SHOPIFY_ACCESS_TOKEN', 'APP_URL'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.warn(`[WARN] Missing environment variables: ${missingEnvVars.join(', ')}`);
  console.warn('[WARN] Some Shopify features may not work properly');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/shopify', shopifyRoutes);

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

// Enhanced health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
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
    endpoints: {
      health: '/health',
      api: '/api',
      shopify_status: '/api/shopify/status',
      shopify_test: '/api/shopify/test',
      setup_webhooks: '/api/shopify/setup-webhooks',
      orders: '/api/shopify/orders'
    }
  });
});

// API routes placeholder
app.get('/api', (req, res) => {
  res.json({
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
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
});