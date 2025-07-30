const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();

// Environment variables validation for CUSTOM APP
const requiredVars = ['SHOPIFY_STORE_URL', 'SHOPIFY_ACCESS_TOKEN', 'APP_URL'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.warn(`[SHOPIFY] Missing env vars: ${missing.join(', ')}`);
}

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL; // your-store.myshopify.com
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET; // Optional for webhook verification
const APP_URL = process.env.APP_URL;

// Helper: Verify webhook signature (if webhook secret is configured)
const verifyWebhookSignature = (body, signature) => {
  if (!SHOPIFY_WEBHOOK_SECRET || !signature) {
    console.log('[SHOPIFY] Webhook verification skipped - no secret configured');
    return true; // Allow webhooks without verification for development
  }
  
  const hmac = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(hmac, 'utf8')
  );
};

// Helper: Make Shopify API request
const shopifyAPI = async (endpoint, method = 'GET', data = null) => {
  if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
    throw new Error('Shopify store URL and access token are required');
  }
  
  const config = {
    method,
    url: `https://${SHOPIFY_STORE_URL}/admin/api/2023-10/${endpoint}`,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    }
  };
  
  if (data) {
    config.data = data;
  }
  
  return axios(config);
};

// 1. App Status Route
router.get('/status', async (req, res) => {
  try {
    // Test API connection
    const response = await shopifyAPI('shop.json');
    const shop = response.data.shop;
    
    res.json({
      status: 'connected',
      store: {
        name: shop.name,
        domain: shop.domain,
        email: shop.email,
        plan: shop.plan_name,
        timezone: shop.timezone
      },
      app_config: {
        webhooks_configured: false, // Phase 4 will track this
        points_system_active: false // Phase 4 will implement this
      }
    });
  } catch (error) {
    console.error('[SHOPIFY] Status check failed:', error.response?.data || error.message);
    res.status(500).json({
      status: 'error',
      error: 'Failed to connect to Shopify',
      message: error.response?.data?.errors || error.message
    });
  }
});

// 2. Setup Webhooks Route
router.post('/setup-webhooks', async (req, res) => {
  const webhooks = [
    {
      topic: 'orders/create',
      address: `${APP_URL}/api/shopify/webhooks/orders/create`,
      format: 'json'
    },
    {
      topic: 'orders/updated', 
      address: `${APP_URL}/api/shopify/webhooks/orders/updated`,
      format: 'json'
    },
    {
      topic: 'orders/cancelled',
      address: `${APP_URL}/api/shopify/webhooks/orders/cancelled`,
      format: 'json'
    }
  ];
  
  const results = [];
  
  for (const webhook of webhooks) {
    try {
      const response = await shopifyAPI('webhooks.json', 'POST', { webhook });
      results.push({
        topic: webhook.topic,
        status: 'created',
        id: response.data.webhook.id
      });
      console.log(`[SHOPIFY] Webhook registered: ${webhook.topic}`);
    } catch (error) {
      results.push({
        topic: webhook.topic,
        status: 'error',
        error: error.response?.data?.errors || error.message
      });
      console.error(`[SHOPIFY] Failed to register webhook ${webhook.topic}:`, error.response?.data || error.message);
    }
  }
  
  res.json({
    message: 'Webhook setup completed',
    results
  });
});

// 3. List Webhooks Route
router.get('/webhooks', async (req, res) => {
  try {
    const response = await shopifyAPI('webhooks.json');
    const webhooks = response.data.webhooks.map(webhook => ({
      id: webhook.id,
      topic: webhook.topic,
      address: webhook.address,
      format: webhook.format,
      created_at: webhook.created_at
    }));
    
    res.json({
      webhooks,
      count: webhooks.length
    });
  } catch (error) {
    console.error('[SHOPIFY] Failed to list webhooks:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to list webhooks',
      message: error.response?.data?.errors || error.message
    });
  }
});

// 4. Webhook Routes
// Order Created Webhook
router.post('/webhooks/orders/create', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn(`[SHOPIFY] Invalid webhook signature from ${shop}`);
    return res.status(401).send('Unauthorized');
  }
  
  try {
    const order = JSON.parse(req.body);
    console.log(`[SHOPIFY] New order received: #${order.order_number} - $${order.total_price}`);
    console.log(`[SHOPIFY] Customer: ${order.customer?.email || 'Guest'}`);
    console.log(`[SHOPIFY] Items: ${order.line_items?.length || 0}`);
    
    // Phase 4: Calculate and award points
    console.log(`[SHOPIFY] TODO: Calculate points for order ${order.id}`);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SHOPIFY] Error processing order webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Order Updated Webhook
router.post('/webhooks/orders/updated', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn(`[SHOPIFY] Invalid webhook signature from ${shop}`);
    return res.status(401).send('Unauthorized');
  }
  
  try {
    const order = JSON.parse(req.body);
    console.log(`[SHOPIFY] Order updated: #${order.order_number} - Status: ${order.financial_status}`);
    
    // Phase 4: Handle order updates (payments, refunds)
    console.log(`[SHOPIFY] TODO: Handle order update for ${order.id}`);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SHOPIFY] Error processing order update webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Order Cancelled Webhook
router.post('/webhooks/orders/cancelled', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn(`[SHOPIFY] Invalid webhook signature from ${shop}`);
    return res.status(401).send('Unauthorized');
  }
  
  try {
    const order = JSON.parse(req.body);
    console.log(`[SHOPIFY] Order cancelled: #${order.order_number}`);
    
    // Phase 4: Handle point deduction for cancelled orders
    console.log(`[SHOPIFY] TODO: Handle cancelled order ${order.id}`);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SHOPIFY] Error processing order cancellation webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// 5. Test API Connection
router.get('/test', async (req, res) => {
  try {
    // Test multiple API endpoints
    const [shopResponse, ordersResponse] = await Promise.all([
      shopifyAPI('shop.json'),
      shopifyAPI('orders.json?limit=5&status=any')
    ]);
    
    const shop = shopResponse.data.shop;
    const orders = ordersResponse.data.orders;
    
    res.json({
      success: true,
      api_connection: 'working',
      shop_info: {
        name: shop.name,
        domain: shop.domain,
        plan: shop.plan_name
      },
      recent_orders: {
        count: orders.length,
        total_value: orders.reduce((sum, order) => sum + parseFloat(order.total_price), 0).toFixed(2),
        orders: orders.map(order => ({
          id: order.id,
          order_number: order.order_number,
          total_price: order.total_price,
          created_at: order.created_at,
          customer_email: order.customer?.email || 'Guest'
        }))
      }
    });
  } catch (error) {
    console.error('[SHOPIFY] API test error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'API test failed',
      message: error.response?.data?.errors || error.message
    });
  }
});

// 6. Get Recent Orders
router.get('/orders', async (req, res) => {
  const { limit = 10, status = 'any' } = req.query;
  
  try {
    const response = await shopifyAPI(`orders.json?limit=${limit}&status=${status}`);
    const orders = response.data.orders;
    
    res.json({
      orders: orders.map(order => ({
        id: order.id,
        order_number: order.order_number,
        total_price: order.total_price,
        financial_status: order.financial_status,
        fulfillment_status: order.fulfillment_status,
        created_at: order.created_at,
        customer: {
          id: order.customer?.id,
          email: order.customer?.email,
          first_name: order.customer?.first_name,
          last_name: order.customer?.last_name
        },
        line_items_count: order.line_items?.length || 0
      })),
      count: orders.length
    });
  } catch (error) {
    console.error('[SHOPIFY] Failed to fetch orders:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch orders',
      message: error.response?.data?.errors || error.message
    });
  }
});

// 7. Get Customer Data
router.get('/customer/:email', async (req, res) => {
  const { email } = req.params;
  
  try {
    // Search for customer by email
    const response = await shopifyAPI(`customers/search.json?query=email:${email}`);
    const customers = response.data.customers;
    
    if (customers.length === 0) {
      return res.status(404).json({
        error: 'Customer not found',
        email
      });
    }
    
    const customer = customers[0];
    
    // Get customer's orders
    const ordersResponse = await shopifyAPI(`customers/${customer.id}/orders.json`);
    const orders = ordersResponse.data.orders;
    
    res.json({
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        created_at: customer.created_at,
        total_spent: customer.total_spent,
        orders_count: customer.orders_count
      },
      recent_orders: orders.slice(0, 5).map(order => ({
        id: order.id,
        order_number: order.order_number,
        total_price: order.total_price,
        created_at: order.created_at
      })),
      // Phase 4: Add loyalty points data
      loyalty_points: {
        current_balance: 0,
        total_earned: 0,
        total_redeemed: 0
      }
    });
  } catch (error) {
    console.error('[SHOPIFY] Failed to fetch customer:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch customer data',
      message: error.response?.data?.errors || error.message
    });
  }
});

module.exports = router;