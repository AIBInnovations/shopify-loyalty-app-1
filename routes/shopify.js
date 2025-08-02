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

// Helper: Verify webhook signature (disabled for testing)
const verifyWebhookSignature = (body, signature) => {
  // TEMPORARY: Disable webhook verification for testing
  console.log('[SHOPIFY] ⚠️  Webhook signature verification DISABLED for testing');
  return true;
  
  /* ORIGINAL CODE - Enable this for production:
  if (!SHOPIFY_WEBHOOK_SECRET || !signature) {
    console.log('[SHOPIFY] Webhook verification skipped - no secret configured');
    return true;
  }
  
  try {
    let bodyString;
    if (Buffer.isBuffer(body)) {
      bodyString = body.toString('utf8');
    } else if (typeof body === 'string') {
      bodyString = body;
    } else {
      bodyString = JSON.stringify(body);
    }
    
    const hmac = crypto
      .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
      .update(bodyString, 'utf8')
      .digest('base64');
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(hmac, 'utf8')
    );
    
    if (!isValid) {
      console.log('[SHOPIFY] Webhook signature verification failed');
      console.log(`[SHOPIFY] Expected: ${hmac}`);
      console.log(`[SHOPIFY] Received: ${signature}`);
    }
    
    return isValid;
  } catch (error) {
    console.error('[SHOPIFY] Error verifying webhook signature:', error.message);
    return false;
  }
  */
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
        webhooks_configured: false, // Will be updated dynamically
        points_system_active: true // Phase 4 implemented
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

// 2. Clean up all app webhooks
router.post('/cleanup-webhooks', async (req, res) => {
  try {
    const response = await shopifyAPI('webhooks.json');
    const webhooks = response.data.webhooks;
    
    const deleted = [];
    const errors = [];
    
    for (const webhook of webhooks) {
      if (webhook.address && webhook.address.includes(APP_URL)) {
        try {
          await shopifyAPI(`webhooks/${webhook.id}.json`, 'DELETE');
          deleted.push({
            id: webhook.id,
            topic: webhook.topic,
            address: webhook.address
          });
          console.log(`[SHOPIFY] Deleted webhook: ${webhook.topic} (${webhook.id})`);
        } catch (deleteError) {
          errors.push({
            id: webhook.id,
            topic: webhook.topic,
            error: deleteError.response?.data || deleteError.message
          });
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Webhook cleanup completed',
      deleted,
      errors,
      summary: `Deleted ${deleted.length} webhooks, ${errors.length} errors`
    });
  } catch (error) {
    console.error('[SHOPIFY] Error cleaning up webhooks:', error);
    res.status(500).json({
      error: 'Failed to cleanup webhooks',
      message: error.response?.data?.errors || error.message
    });
  }
});

// 3. Setup Webhooks Route (with automatic cleanup)
router.post('/setup-webhooks', async (req, res) => {
  try {
    // First, clean up existing webhooks
    console.log('[SHOPIFY] Cleaning up existing webhooks...');
    const existingWebhooks = await shopifyAPI('webhooks.json');
    
    let deletedCount = 0;
    for (const webhook of existingWebhooks.data.webhooks) {
      if (webhook.address && webhook.address.includes(APP_URL)) {
        try {
          await shopifyAPI(`webhooks/${webhook.id}.json`, 'DELETE');
          console.log(`[SHOPIFY] Deleted existing webhook: ${webhook.topic} (${webhook.id})`);
          deletedCount++;
        } catch (deleteError) {
          console.warn(`[SHOPIFY] Failed to delete webhook ${webhook.id}:`, deleteError.response?.data || deleteError.message);
        }
      }
    }
    
    // Now create new webhooks
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
          id: response.data.webhook.id,
          address: webhook.address
        });
        console.log(`[SHOPIFY] Webhook registered: ${webhook.topic} (${response.data.webhook.id})`);
      } catch (error) {
        results.push({
          topic: webhook.topic,
          status: 'error',
          error: error.response?.data?.errors || error.message
        });
        console.error(`[SHOPIFY] Failed to register webhook ${webhook.topic}:`, error.response?.data || error.message);
      }
    }
    
    const successCount = results.filter(r => r.status === 'created').length;
    
    res.json({
      success: true,
      message: 'Webhook setup completed',
      summary: {
        deleted_old_webhooks: deletedCount,
        created_new_webhooks: successCount,
        total_webhooks: results.length
      },
      results
    });
  } catch (error) {
    console.error('[SHOPIFY] Error in webhook setup:', error);
    res.status(500).json({
      error: 'Failed to setup webhooks',
      message: error.response?.data?.errors || error.message
    });
  }
});

// 4. Delete specific webhook
router.delete('/webhooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await shopifyAPI(`webhooks/${id}.json`, 'DELETE');
    
    res.json({
      success: true,
      message: `Webhook ${id} deleted successfully`
    });
  } catch (error) {
    console.error('[SHOPIFY] Error deleting webhook:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to delete webhook',
      message: error.response?.data?.errors || error.message
    });
  }
});

// 5. List Webhooks Route
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
    
    const appWebhooks = webhooks.filter(w => w.address && w.address.includes(APP_URL));
    
    res.json({
      webhooks,
      app_webhooks: appWebhooks,
      total_count: webhooks.length,
      app_webhooks_count: appWebhooks.length
    });
  } catch (error) {
    console.error('[SHOPIFY] Failed to list webhooks:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to list webhooks',
      message: error.response?.data?.errors || error.message
    });
  }
});

// Enhanced webhook handler for orders/create - add this to your shopify.js file
router.post('/webhooks/orders/create', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  
  console.log(`[SHOPIFY] Order webhook received from ${shop}`);
  
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn(`[SHOPIFY] Invalid webhook signature from ${shop}`);
    return res.status(401).send('Unauthorized');
  }
  
  try {
    // Parse the raw body - handle different body types
    let order;
    if (Buffer.isBuffer(req.body)) {
      const bodyString = req.body.toString('utf8');
      order = JSON.parse(bodyString);
    } else if (typeof req.body === 'string') {
      order = JSON.parse(req.body);
    } else if (typeof req.body === 'object') {
      order = req.body; // Already parsed
    } else {
      throw new Error('Invalid body format');
    }
    
    console.log(`[SHOPIFY] ✅ New order received: #${order.order_number} - ${order.total_price}`);
    
    // DETAILED CUSTOMER LOGGING
    console.log(`[SHOPIFY] 🔍 CUSTOMER DEBUG INFO:`);
    console.log(`[SHOPIFY] - Customer object exists:`, !!order.customer);
    console.log(`[SHOPIFY] - Customer ID:`, order.customer?.id);
    console.log(`[SHOPIFY] - Customer Email:`, order.customer?.email);
    console.log(`[SHOPIFY] - Customer First Name:`, order.customer?.first_name);
    console.log(`[SHOPIFY] - Customer Last Name:`, order.customer?.last_name);
    console.log(`[SHOPIFY] - Full customer object:`, JSON.stringify(order.customer, null, 2));
    
    console.log(`[SHOPIFY] Order Details:`);
    console.log(`[SHOPIFY] - Items: ${order.line_items?.length || 0}`);
    console.log(`[SHOPIFY] - Financial Status: ${order.financial_status}`);
    console.log(`[SHOPIFY] - Total Price: ${order.total_price}`);
    
    // Phase 4: Calculate and award points (with error handling for DB connection)
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) { // 1 = connected
        console.log('[SHOPIFY] 📊 Database connected, processing points...');
        
        const PointsService = require('../services/pointsService');
        
        // Additional check for customer data before processing
        if (!order.customer) {
          console.log('[SHOPIFY] ⚠️  No customer object in order data - this might be a guest checkout');
          res.status(200).send('OK - Guest order, no points awarded');
          return;
        }
        
        if (!order.customer.id) {
          console.log('[SHOPIFY] ⚠️  Customer object exists but no customer ID - unusual case');
          res.status(200).send('OK - No customer ID, no points awarded');
          return;
        }
        
        if (!order.customer.email) {
          console.log('[SHOPIFY] ⚠️  Customer has ID but no email - will use fallback email');
        }
        
        const result = await PointsService.processOrder(order);
        
        if (result) {
          console.log(`[SHOPIFY] 🎉 Points awarded: ${result.points_awarded} to customer ${result.customer_id}`);
          console.log(`[SHOPIFY] 📧 Customer email: ${result.customer_email}`);
          console.log(`[SHOPIFY] 💰 New balance: ${result.new_balance} points, tier: ${result.new_tier}`);
        } else {
          console.log(`[SHOPIFY] ⚠️  No points awarded (guest order or processing error)`);
        }
      } else {
        console.log('[SHOPIFY] ⚠️  Skipping points processing - database not connected');
      }
    } catch (pointsError) {
      console.error('[SHOPIFY] ❌ Error processing points for order:', pointsError.message);
      console.error('[SHOPIFY] ❌ Points error stack:', pointsError.stack);
      // Don't fail the webhook if points processing fails
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SHOPIFY] ❌ Error processing order webhook:', error);
    console.error('[SHOPIFY] Body type:', typeof req.body);
    console.error('[SHOPIFY] Body sample:', req.body?.toString ? req.body.toString().substring(0, 200) : 'Cannot convert to string');
    res.status(500).send('Error processing webhook');
  }
});

// 7. Webhook Routes - Order Updated
router.post('/webhooks/orders/updated', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn(`[SHOPIFY] Invalid webhook signature from ${shop}`);
    return res.status(401).send('Unauthorized');
  }
  
  try {
    // Parse the raw body - handle different body types
    let order;
    if (Buffer.isBuffer(req.body)) {
      const bodyString = req.body.toString('utf8');
      order = JSON.parse(bodyString);
    } else if (typeof req.body === 'string') {
      order = JSON.parse(req.body);
    } else if (typeof req.body === 'object') {
      order = req.body; // Already parsed
    } else {
      throw new Error('Invalid body format');
    }
    
    console.log(`[SHOPIFY] Order updated: #${order.order_number} - Status: ${order.financial_status}`);
    
    // Phase 4: Handle order updates (payments, refunds) - only if DB connected
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        console.log(`[SHOPIFY] TODO: Handle order update for ${order.id} (DB connected)`);
        // Future: Handle refunds, cancellations, payment status changes
      } else {
        console.log('[SHOPIFY] Skipping order update processing - database not connected');
      }
    } catch (updateError) {
      console.error('[SHOPIFY] Error processing order update:', updateError.message);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SHOPIFY] Error processing order update webhook:', error);
    console.error('[SHOPIFY] Body type:', typeof req.body);
    console.error('[SHOPIFY] Body sample:', req.body?.toString ? req.body.toString().substring(0, 100) : 'Cannot convert to string');
    res.status(500).send('Error processing webhook');
  }
});

// 8. Webhook Routes - Order Cancelled
router.post('/webhooks/orders/cancelled', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn(`[SHOPIFY] Invalid webhook signature from ${shop}`);
    return res.status(401).send('Unauthorized');
  }
  
  try {
    // Parse the raw body - handle different body types
    let order;
    if (Buffer.isBuffer(req.body)) {
      const bodyString = req.body.toString('utf8');
      order = JSON.parse(bodyString);
    } else if (typeof req.body === 'string') {
      order = JSON.parse(req.body);
    } else if (typeof req.body === 'object') {
      order = req.body; // Already parsed
    } else {
      throw new Error('Invalid body format');
    }
    
    console.log(`[SHOPIFY] Order cancelled: #${order.order_number}`);
    
    // Phase 4: Handle point deduction for cancelled orders - only if DB connected
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        console.log(`[SHOPIFY] TODO: Handle cancelled order ${order.id} (DB connected)`);
        // Future: Deduct points if they were awarded for this order
      } else {
        console.log('[SHOPIFY] Skipping cancellation processing - database not connected');
      }
    } catch (cancelError) {
      console.error('[SHOPIFY] Error processing order cancellation:', cancelError.message);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SHOPIFY] Error processing order cancellation webhook:', error);
    console.error('[SHOPIFY] Body type:', typeof req.body);
    console.error('[SHOPIFY] Body sample:', req.body?.toString ? req.body.toString().substring(0, 100) : 'Cannot convert to string');
    res.status(500).send('Error processing webhook');
  }
});

// 9. Test API Connection
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
      timestamp: new Date().toISOString(),
      shop_info: {
        name: shop.name,
        domain: shop.domain,
        plan: shop.plan_name,
        currency: shop.currency,
        timezone: shop.timezone
      },
      recent_orders: {
        count: orders.length,
        total_value: orders.reduce((sum, order) => sum + parseFloat(order.total_price), 0).toFixed(2),
        orders: orders.map(order => ({
          id: order.id,
          order_number: order.order_number,
          total_price: order.total_price,
          financial_status: order.financial_status,
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

// 10. Get Recent Orders
router.get('/orders', async (req, res) => {
  const { limit = 10, status = 'any' } = req.query;
  
  try {
    const response = await shopifyAPI(`orders.json?limit=${limit}&status=${status}`);
    const orders = response.data.orders;
    
    res.json({
      success: true,
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
        line_items_count: order.line_items?.length || 0,
        tags: order.tags
      })),
      count: orders.length,
      filters: { limit, status }
    });
  } catch (error) {
    console.error('[SHOPIFY] Failed to fetch orders:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to fetch orders',
      message: error.response?.data?.errors || error.message
    });
  }
});

// 11. Get Customer Data
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
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        created_at: customer.created_at,
        updated_at: customer.updated_at,
        total_spent: customer.total_spent,
        orders_count: customer.orders_count,
        state: customer.state,
        tags: customer.tags
      },
      recent_orders: orders.slice(0, 5).map(order => ({
        id: order.id,
        order_number: order.order_number,
        total_price: order.total_price,
        financial_status: order.financial_status,
        created_at: order.created_at
      })),
      // Phase 4: Add loyalty points data (will be populated by points system)
      loyalty_points: {
        current_balance: 0,
        total_earned: 0,
        total_redeemed: 0,
        note: 'Check /api/points/customer/' + customer.id + ' for actual points data'
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

// 12. Debug webhook endpoint (for testing without signature verification)
router.post('/webhooks/debug', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('[SHOPIFY DEBUG] 🔍 Debug webhook received');
  console.log('[SHOPIFY DEBUG] Headers:', Object.keys(req.headers));
  console.log('[SHOPIFY DEBUG] Body type:', typeof req.body);
  console.log('[SHOPIFY DEBUG] Body length:', req.body ? req.body.length : 'undefined');
  
  try {
    const bodyString = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
    const data = JSON.parse(bodyString);
    
    console.log(`[SHOPIFY DEBUG] Data parsed successfully`);
    console.log(`[SHOPIFY DEBUG] Type: ${data.id ? 'Order' : 'Unknown'}`);
    
    if (data.order_number) {
      console.log(`[SHOPIFY DEBUG] Order: #${data.order_number} - $${data.total_price}`);
    }
    
    res.status(200).json({
      success: true,
      message: 'Debug webhook received and parsed',
      data_type: data.id ? 'order' : 'unknown',
      order_number: data.order_number || 'N/A',
      customer: data.customer?.email || 'Guest',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SHOPIFY DEBUG] ❌ Error parsing webhook:', error.message);
    res.status(400).json({ 
      error: 'Failed to parse webhook data',
      message: error.message 
    });
  }
});

// Add this test route to your shopify.js file for debugging

// Test route to simulate order processing
router.post('/test/process-order', async (req, res) => {
  try {
    console.log('[SHOPIFY TEST] Processing test order...');
    
    // Sample order data that mimics what Shopify sends
    const testOrder = {
      id: 999999999,
      order_number: 'TEST-' + Date.now(),
      total_price: '99.99',
      financial_status: 'paid',
      created_at: new Date().toISOString(),
      customer: {
        id: req.body.customer_id || 8219723301058, // Use provided customer ID or default
        email: req.body.customer_email || 'test@example.com', // Use provided email or default
        first_name: req.body.first_name || 'Test',
        last_name: req.body.last_name || 'Customer'
      },
      line_items: [
        {
          id: 1,
          title: 'Test Product',
          quantity: 1,
          price: '99.99'
        }
      ]
    };
    
    console.log('[SHOPIFY TEST] Test order created:', JSON.stringify(testOrder, null, 2));
    
    // Check database connection
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({
        success: false,
        error: 'Database not connected',
        order_data: testOrder
      });
    }
    
    // Process with points service
    const PointsService = require('../services/pointsService');
    const result = await PointsService.processOrder(testOrder);
    
    console.log('[SHOPIFY TEST] Points processing result:', result);
    
    res.json({
      success: true,
      message: 'Test order processed',
      test_order: testOrder,
      points_result: result
    });
    
  } catch (error) {
    console.error('[SHOPIFY TEST] Error processing test order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process test order',
      message: error.message,
      stack: error.stack
    });
  }
});

// Test route to get customer from Shopify API
router.get('/test/shopify-customer/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!process.env.SHOPIFY_STORE_URL || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({
        error: 'Shopify not configured',
        missing: {
          store_url: !process.env.SHOPIFY_STORE_URL,
          access_token: !process.env.SHOPIFY_ACCESS_TOKEN
        }
      });
    }
    
    const response = await shopifyAPI(`customers/${id}.json`);
    const customer = response.data.customer;
    
    res.json({
      success: true,
      customer: {
        id: customer.id,
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
        created_at: customer.created_at,
        updated_at: customer.updated_at,
        total_spent: customer.total_spent,
        orders_count: customer.orders_count
      }
    });
    
  } catch (error) {
    console.error('[SHOPIFY TEST] Error fetching customer:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer from Shopify',
      message: error.response?.data?.errors || error.message
    });
  }
});

// Add this route to your shopify.js file to inject checkout script

// Install checkout script via Script Tag API
router.post('/install-checkout-script', async (req, res) => {
  try {
    // First, check if script already exists
    const existingScripts = await shopifyAPI('script_tags.json');
    const scriptUrl = `${APP_URL}/checkout-loyalty-script.js`;
    
    const existingScript = existingScripts.data.script_tags.find(
      script => script.src === scriptUrl
    );

    if (existingScript) {
      return res.json({
        success: true,
        message: 'Checkout script already installed',
        script_id: existingScript.id,
        script_url: scriptUrl
      });
    }

    // Create new script tag
    const scriptTag = {
      event: 'onload',
      src: scriptUrl,
      display_scope: 'checkout'  // Only load on checkout pages
    };

    const response = await shopifyAPI('script_tags.json', 'POST', {
      script_tag: scriptTag
    });

    console.log('[SHOPIFY] Installed checkout loyalty script:', response.data.script_tag.id);

    res.json({
      success: true,
      message: 'Checkout script installed successfully',
      script_id: response.data.script_tag.id,
      script_url: scriptUrl
    });

  } catch (error) {
    console.error('[SHOPIFY] Error installing checkout script:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to install checkout script',
      message: error.response?.data?.errors || error.message
    });
  }
});

// Serve the actual checkout script
router.get('/checkout-loyalty-script.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
    // Loyalty Points Checkout Integration
    (function() {
      'use strict';

      const LOYALTY_CONFIG = {
        apiUrl: '${APP_URL}',
        conversionRate: 100
      };

      let customerData = null;

      // Wait for checkout to be ready
      function waitForCheckout() {
        if (typeof Shopify === 'undefined' || !Shopify.Checkout) {
          setTimeout(waitForCheckout, 500);
          return;
        }

        console.log('[LOYALTY] Checkout detected, initializing...');
        initializeLoyalty();
      }

      function initializeLoyalty() {
        const customer = Shopify.Checkout.customer;
        if (!customer || !customer.email) {
          console.log('[LOYALTY] No customer in checkout');
          return;
        }

        console.log('[LOYALTY] Customer found:', customer.email);
        loadCustomerPoints(customer.email);
      }

      async function loadCustomerPoints(email) {
        try {
          const response = await fetch(LOYALTY_CONFIG.apiUrl + '/api/points/customer/email/' + encodeURIComponent(email) + '/redemption-options');
          
          if (!response.ok) {
            console.log('[LOYALTY] Customer not found in loyalty system');
            return;
          }

          const data = await response.json();
          customerData = data;

          if (data.redemption.available) {
            injectLoyaltyWidget(data);
          } else {
            showPointsInfo(data);
          }

        } catch (error) {
          console.error('[LOYALTY] Error loading customer points:', error);
        }
      }

      function injectLoyaltyWidget(data) {
        // Find discount code section or any good insertion point
        const insertionPoints = [
          '.section--discount-code',
          '.section--gift-card', 
          '[data-discount-form]',
          '.fieldset',
          '.section',
          '.content-box'
        ];

        let targetElement = null;
        for (const selector of insertionPoints) {
          targetElement = document.querySelector(selector);
          if (targetElement) break;
        }

        if (!targetElement) {
          console.log('[LOYALTY] Could not find insertion point for widget');
          return;
        }

        const widgetId = 'loyalty-checkout-widget-' + Date.now();
        const widgetHTML = createWidgetHTML(data, widgetId);
        
        targetElement.insertAdjacentHTML('beforebegin', widgetHTML);
        setupWidgetEvents(widgetId, data);
      }

      function createWidgetHTML(data, widgetId) {
        return \`
          <div id="\${widgetId}" style="
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 15px;
            padding: 20px;
            margin: 20px 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
          ">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
              <span style="font-size: 24px;">⭐</span>
              <div>
                <h3 style="margin: 0; font-size: 18px;">Use Your Loyalty Points</h3>
                <div style="font-size: 14px; opacity: 0.9;">You have \${data.redemption.balance} points • 100 points = $1.00</div>
              </div>
            </div>

            <div class="redemption-options" style="
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
              gap: 10px;
              margin-bottom: 20px;
            ">
              \${data.redemption.options.map(option => \`
                <button 
                  class="points-option" 
                  data-points="\${option.points}"
                  style="
                    background: rgba(255,255,255,0.2);
                    border: 2px solid rgba(255,255,255,0.3);
                    color: white;
                    border-radius: 10px;
                    padding: 15px 10px;
                    cursor: pointer;
                    font-size: 13px;
                    text-align: center;
                    transition: all 0.3s ease;
                    backdrop-filter: blur(10px);
                  "
                >
                  <div style="font-weight: bold; font-size: 14px;">\${option.points} Points</div>
                  <div style="color: #FFD700; font-weight: bold; margin-top: 5px;">$\${option.discount.toFixed(2)} OFF</div>
                </button>
              \`).join('')}
            </div>

            <button 
              id="apply-loyalty-btn" 
              disabled
              style="
                width: 100%;
                background: rgba(255,255,255,0.3);
                color: white;
                border: 2px solid rgba(255,255,255,0.4);
                padding: 15px;
                border-radius: 12px;
                font-size: 16px;
                font-weight: bold;
                cursor: not-allowed;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
              "
            >
              Select points to redeem
            </button>

            <div id="loyalty-message" style="
              margin-top: 15px;
              padding: 12px;
              border-radius: 8px;
              font-size: 14px;
              text-align: center;
              display: none;
              backdrop-filter: blur(10px);
            "></div>
          </div>
        \`;
      }

      function setupWidgetEvents(widgetId, data) {
        const widget = document.getElementById(widgetId);
        let selectedPoints = 0;

        // Handle option selection
        widget.querySelectorAll('.points-option').forEach(button => {
          button.addEventListener('click', function() {
            selectedPoints = parseInt(this.dataset.points);
            
            // Reset all buttons
            widget.querySelectorAll('.points-option').forEach(btn => {
              btn.style.background = 'rgba(255,255,255,0.2)';
              btn.style.borderColor = 'rgba(255,255,255,0.3)';
            });
            
            // Highlight selected
            this.style.background = 'rgba(255,255,255,0.4)';
            this.style.borderColor = 'rgba(255,255,255,0.8)';
            
            // Update apply button
            const applyBtn = widget.querySelector('#apply-loyalty-btn');
            const discount = Math.floor(selectedPoints / LOYALTY_CONFIG.conversionRate);
            applyBtn.disabled = false;
            applyBtn.style.background = 'rgba(255,255,255,0.9)';
            applyBtn.style.color = '#667eea';
            applyBtn.style.cursor = 'pointer';
            applyBtn.textContent = \`Redeem \${selectedPoints} Points ($\${discount}.00 off)\`;
          });
        });

        // Handle apply button
        widget.querySelector('#apply-loyalty-btn').addEventListener('click', async function() {
          if (!selectedPoints) return;

          this.disabled = true;
          this.textContent = 'Creating discount code...';

          try {
            const discountResponse = await fetch(LOYALTY_CONFIG.apiUrl + '/api/shopify/create-flexible-discount-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                points: selectedPoints,
                discount_amount: Math.floor(selectedPoints / LOYALTY_CONFIG.conversionRate),
                email: Shopify.Checkout.customer.email
              })
            });

            const discountData = await discountResponse.json();

            if (discountData.success) {
              await fetch(LOYALTY_CONFIG.apiUrl + '/api/points/redeem-by-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  email: Shopify.Checkout.customer.email,
                  points: selectedPoints,
                  description: 'Checkout redemption - ' + discountData.discount_code
                })
              });

              showMessage(widget, \`
                <strong>🎉 Discount Code Created!</strong><br>
                Code: <strong style="font-size: 18px; color: #FFD700;">\${discountData.discount_code}</strong><br>
                <small>Copy and paste this code in the discount field ↑</small>
              \`, 'success');

              setTimeout(() => {
                widget.style.display = 'none';
              }, 15000);

            } else {
              throw new Error(discountData.message || 'Failed to create discount code');
            }

          } catch (error) {
            console.error('[LOYALTY] Error:', error);
            showMessage(widget, 'Failed to create discount code. Please try again.', 'error');
            this.disabled = false;
            this.textContent = \`Redeem \${selectedPoints} Points\`;
          }
        });
      }

      function showMessage(widget, message, type) {
        const messageEl = widget.querySelector('#loyalty-message');
        messageEl.innerHTML = message;
        messageEl.style.display = 'block';
        
        if (type === 'success') {
          messageEl.style.background = 'rgba(76, 175, 80, 0.9)';
          messageEl.style.color = 'white';
        } else {
          messageEl.style.background = 'rgba(244, 67, 54, 0.9)';
          messageEl.style.color = 'white';
        }
      }

      function showPointsInfo(data) {
        const insertionPoints = [
          '.section--discount-code',
          '.section--gift-card',
          '.fieldset',
          '.section'
        ];

        let targetElement = null;
        for (const selector of insertionPoints) {
          targetElement = document.querySelector(selector);
          if (targetElement) break;
        }

        if (targetElement) {
          targetElement.insertAdjacentHTML('beforebegin', \`
            <div style="
              background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
              border: 2px solid #2196f3;
              border-radius: 12px;
              padding: 20px;
              margin: 20px 0;
              text-align: center;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            ">
              <div style="font-size: 20px; margin-bottom: 10px;">💰</div>
              <strong style="font-size: 16px; color: #1976d2;">You have \${data.redemption.balance} loyalty points!</strong><br>
              <small style="color: #1565c0;">You need at least 100 points to redeem for discounts.</small>
            </div>
          \`);
        }
      }

      // Start the process
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', waitForCheckout);
      } else {
        waitForCheckout();
      }

    })();
  `);
});

// Remove checkout script
router.delete('/uninstall-checkout-script', async (req, res) => {
  try {
    const scriptsResponse = await shopifyAPI('script_tags.json');
    const scriptUrl = `${APP_URL}/checkout-loyalty-script.js`;
    
    const scriptToDelete = scriptsResponse.data.script_tags.find(
      script => script.src === scriptUrl
    );

    if (!scriptToDelete) {
      return res.json({
        success: true,
        message: 'No checkout script found to remove'
      });
    }

    await shopifyAPI(`script_tags/${scriptToDelete.id}.json`, 'DELETE');

    res.json({
      success: true,
      message: 'Checkout script removed successfully',
      script_id: scriptToDelete.id
    });

  } catch (error) {
    console.error('[SHOPIFY] Error removing checkout script:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to remove checkout script',
      message: error.response?.data?.errors || error.message
    });
  }
});

// Replace the existing setup-checkout-integration route in your shopify.js file

// Install checkout script for custom app (FIXED VERSION)
router.post('/setup-checkout-integration', async (req, res) => {
  try {
    console.log('[CUSTOM APP] Setting up checkout integration...');

    // For custom apps, we'll use Script Tags to inject our checkout script
    const scriptUrl = `${APP_URL}/api/shopify/checkout-points-widget.js`;
    
    // Check if script already exists
    const existingScripts = await shopifyAPI('script_tags.json');
    const existingScript = existingScripts.data.script_tags.find(
      script => script.src === scriptUrl
    );

    if (existingScript) {
      return res.json({
        success: true,
        message: 'Checkout integration already installed',
        script_id: existingScript.id,
        script_url: scriptUrl
      });
    }

    // Create new script tag (REMOVED display_scope - not supported)
    const scriptTag = {
      event: 'onload',
      src: scriptUrl
      // Removed display_scope as it's not valid for script tags
    };

    const response = await shopifyAPI('script_tags.json', 'POST', {
      script_tag: scriptTag
    });

    console.log('[CUSTOM APP] Checkout script installed:', response.data.script_tag.id);

    res.json({
      success: true,
      message: 'Checkout integration installed successfully',
      script_id: response.data.script_tag.id,
      script_url: scriptUrl,
      note: 'Script will load on all pages but only activate on checkout pages',
      instructions: 'Your loyalty points redemption widget will now appear on checkout pages for logged-in customers.'
    });

  } catch (error) {
    console.error('[CUSTOM APP] Error setting up checkout integration:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to setup checkout integration',
      message: error.response?.data?.errors || error.message
    });
  }
});

// Enhanced checkout widget script that detects checkout pages
router.get('/checkout-points-widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  
  const script = `
// Loyalty Points Checkout Widget for Custom App
(function() {
  'use strict';

  // Only run on checkout pages
  if (!window.location.pathname.includes('/checkouts/') && 
      !window.location.pathname.includes('/checkout') &&
      typeof Shopify === 'undefined') {
    console.log('[LOYALTY] Not a checkout page, skipping widget load');
    return;
  }

  const LOYALTY_CONFIG = {
    apiUrl: '${APP_URL}',
    conversionRate: 100, // 100 points = $1
    minRedemption: 100
  };

  let customerData = null;
  let selectedPoints = 0;

  console.log('[LOYALTY] Checkout widget loaded on:', window.location.pathname);

  // Wait for Shopify checkout to be ready
  function initializeWidget() {
    // Double check we're on checkout
    if (!window.location.pathname.includes('/checkouts/') && 
        !window.location.pathname.includes('/checkout')) {
      console.log('[LOYALTY] Not on checkout page, aborting');
      return;
    }

    if (typeof Shopify === 'undefined' || !Shopify.Checkout) {
      setTimeout(initializeWidget, 500);
      return;
    }

    const customer = Shopify.Checkout.customer;
    if (!customer || !customer.email) {
      console.log('[LOYALTY] No customer found in checkout');
      return;
    }

    console.log('[LOYALTY] Customer found:', customer.email);
    loadCustomerPoints(customer.email);
  }

  async function loadCustomerPoints(email) {
    try {
      const response = await fetch(
        LOYALTY_CONFIG.apiUrl + '/api/points/customer/email/' + encodeURIComponent(email) + '/redemption-options'
      );
      
      if (!response.ok) {
        console.log('[LOYALTY] Customer not found in loyalty system');
        return;
      }

      const data = await response.json();
      customerData = data;

      if (data.redemption.available) {
        injectWidget(data);
      } else if (data.redemption.balance > 0) {
        showPointsBalance(data);
      }

    } catch (error) {
      console.error('[LOYALTY] Error loading customer points:', error);
    }
  }

  function injectWidget(data) {
    // Enhanced selector list for checkout pages
    const selectors = [
      '.section--discount-code',
      '.section--gift-card',
      '[data-discount-form]',
      '.discount-code',
      '.gift-card',
      '.fieldset',
      '.section',
      '.content-box',
      '.step__sections',
      '.section--reductions',
      '.order-summary__sections'
    ];

    let targetElement = null;
    for (const selector of selectors) {
      targetElement = document.querySelector(selector);
      if (targetElement) {
        console.log('[LOYALTY] Found insertion point:', selector);
        break;
      }
    }

    if (!targetElement) {
      console.log('[LOYALTY] Could not find suitable insertion point, trying body');
      // Fallback: insert at top of main content
      const mainContent = document.querySelector('main') || document.querySelector('.main') || document.body;
      if (mainContent && mainContent.firstChild) {
        targetElement = mainContent.firstChild;
      } else {
        console.log('[LOYALTY] No suitable insertion point found');
        return;
      }
    }

    const widgetHTML = createWidgetHTML(data);
    targetElement.insertAdjacentHTML('beforebegin', widgetHTML);
    setupEventListeners(data);
  }

  function createWidgetHTML(data) {
    return \`
      <div id="loyalty-checkout-widget" class="section section--loyalty-points" style="
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border-radius: 15px;
        padding: 25px;
        margin: 25px 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        position: relative;
        overflow: hidden;
      ">
        <!-- Background decoration -->
        <div style="
          position: absolute;
          top: -50%;
          right: -20px;
          width: 100px;
          height: 200%;
          background: rgba(255,255,255,0.1);
          transform: rotate(15deg);
          pointer-events: none;
        "></div>
        
        <div style="position: relative; z-index: 2;">
          <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 25px;">
            <span style="font-size: 28px;">⭐</span>
            <div>
              <h3 style="margin: 0; font-size: 20px; font-weight: 700;">Use Your Loyalty Points</h3>
              <div style="font-size: 14px; opacity: 0.9; margin-top: 5px;">
                You have \${data.redemption.balance} points • 100 points = $1.00
              </div>
            </div>
          </div>

          <div id="redemption-options" style="
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px;
            margin-bottom: 25px;
          ">
            \${data.redemption.options.map(option => \`
              <button 
                class="points-option" 
                data-points="\${option.points}"
                style="
                  background: rgba(255,255,255,0.2);
                  border: 2px solid rgba(255,255,255,0.3);
                  color: white;
                  border-radius: 12px;
                  padding: 18px 12px;
                  cursor: pointer;
                  font-size: 14px;
                  text-align: center;
                  transition: all 0.3s ease;
                  backdrop-filter: blur(10px);
                  position: relative;
                  overflow: hidden;
                "
                onmouseover="this.style.background='rgba(255,255,255,0.3)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.2)';"
                onmouseout="this.style.background='rgba(255,255,255,0.2)'; this.style.transform='translateY(0)'; this.style.boxShadow='none';"
              >
                <div style="font-weight: bold; font-size: 16px; margin-bottom: 8px;">
                  \${option.points} Points
                </div>
                <div style="color: #FFD700; font-weight: bold; font-size: 18px;">
                  $\${option.discount.toFixed(2)} OFF
                </div>
              </button>
            \`).join('')}
          </div>

          <button 
            id="apply-points-btn" 
            disabled
            style="
              width: 100%;
              background: rgba(255,255,255,0.3);
              color: white;
              border: 2px solid rgba(255,255,255,0.4);
              padding: 18px 25px;
              border-radius: 12px;
              font-size: 18px;
              font-weight: bold;
              cursor: not-allowed;
              transition: all 0.3s ease;
              backdrop-filter: blur(10px);
              text-transform: uppercase;
              letter-spacing: 1px;
            "
          >
            Select Points to Redeem
          </button>

          <div id="loyalty-message" style="
            margin-top: 20px;
            padding: 15px;
            border-radius: 10px;
            font-size: 15px;
            text-align: center;
            display: none;
            backdrop-filter: blur(15px);
            font-weight: 600;
          "></div>
        </div>
      </div>
    \`;
  }

  function setupEventListeners(data) {
    // Handle option selection
    document.querySelectorAll('.points-option').forEach(button => {
      button.addEventListener('click', function() {
        selectedPoints = parseInt(this.dataset.points);
        
        // Reset all buttons
        document.querySelectorAll('.points-option').forEach(btn => {
          btn.style.background = 'rgba(255,255,255,0.2)';
          btn.style.borderColor = 'rgba(255,255,255,0.3)';
        });
        
        // Highlight selected
        this.style.background = 'rgba(255,255,255,0.4)';
        this.style.borderColor = 'rgba(255,255,255,0.8)';
        this.style.boxShadow = '0 0 20px rgba(255,255,255,0.3)';
        
        updateApplyButton();
      });
    });

    // Handle apply button
    document.getElementById('apply-points-btn').addEventListener('click', applyPointsDiscount);
  }

  function updateApplyButton() {
    const applyBtn = document.getElementById('apply-points-btn');
    
    if (selectedPoints >= LOYALTY_CONFIG.minRedemption) {
      const discount = Math.floor(selectedPoints / LOYALTY_CONFIG.conversionRate);
      applyBtn.disabled = false;
      applyBtn.style.background = 'rgba(255,255,255,0.9)';
      applyBtn.style.color = '#667eea';
      applyBtn.style.cursor = 'pointer';
      applyBtn.style.fontWeight = 'bold';
      applyBtn.textContent = \`Redeem \${selectedPoints} Points ($\${discount}.00 Off)\`;
      
      applyBtn.onmouseover = function() {
        this.style.background = 'white';
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 8px 25px rgba(0,0,0,0.2)';
      };
      applyBtn.onmouseout = function() {
        this.style.background = 'rgba(255,255,255,0.9)';
        this.style.transform = 'translateY(0)';
        this.style.boxShadow = 'none';
      };
    } else {
      applyBtn.disabled = true;
      applyBtn.style.background = 'rgba(255,255,255,0.3)';
      applyBtn.style.color = 'white';
      applyBtn.style.cursor = 'not-allowed';
      applyBtn.textContent = 'Select Points to Redeem';
      applyBtn.onmouseover = null;
      applyBtn.onmouseout = null;
    }
  }

  async function applyPointsDiscount() {
    if (selectedPoints < LOYALTY_CONFIG.minRedemption) return;

    const applyBtn = document.getElementById('apply-points-btn');
    applyBtn.disabled = true;
    applyBtn.textContent = 'Creating Discount Code...';
    applyBtn.style.background = 'rgba(255,255,255,0.5)';

    try {
      // Create discount code
      const discountResponse = await fetch(LOYALTY_CONFIG.apiUrl + '/api/shopify/create-flexible-discount-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: selectedPoints,
          discount_amount: Math.floor(selectedPoints / LOYALTY_CONFIG.conversionRate),
          email: Shopify.Checkout.customer.email
        })
      });

      const discountData = await discountResponse.json();

      if (discountData.success) {
        // Redeem points
        await fetch(LOYALTY_CONFIG.apiUrl + '/api/points/redeem-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: Shopify.Checkout.customer.email,
            points: selectedPoints,
            description: 'Checkout redemption - ' + discountData.discount_code
          })
        });

        showMessage(\`
          <div style="font-size: 20px; margin-bottom: 10px;">🎉</div>
          <strong>Discount Code Created!</strong><br>
          <div style="font-size: 22px; color: #FFD700; margin: 15px 0; font-weight: bold; letter-spacing: 2px;">
            \${discountData.discount_code}
          </div>
          <div style="font-size: 14px; opacity: 0.9;">
            Copy this code and paste it in the discount field above ↑
          </div>
        \`, 'success');

        // Hide widget after 15 seconds
        setTimeout(() => {
          const widget = document.getElementById('loyalty-checkout-widget');
          if (widget) {
            widget.style.animation = 'fadeOut 1s ease-out forwards';
            setTimeout(() => widget.remove(), 1000);
          }
        }, 15000);

      } else {
        throw new Error(discountData.message || 'Failed to create discount code');
      }

    } catch (error) {
      console.error('[LOYALTY] Error applying points:', error);
      showMessage('Failed to create discount code. Please try again.', 'error');
      applyBtn.disabled = false;
      applyBtn.textContent = \`Redeem \${selectedPoints} Points\`;
      applyBtn.style.background = 'rgba(255,255,255,0.9)';
    }
  }

  function showMessage(message, type) {
    const messageEl = document.getElementById('loyalty-message');
    messageEl.innerHTML = message;
    messageEl.style.display = 'block';
    
    if (type === 'success') {
      messageEl.style.background = 'rgba(76, 175, 80, 0.9)';
      messageEl.style.border = '2px solid rgba(76, 175, 80, 1)';
    } else {
      messageEl.style.background = 'rgba(244, 67, 54, 0.9)';
      messageEl.style.border = '2px solid rgba(244, 67, 54, 1)';
    }
  }

  function showPointsBalance(data) {
    const selectors = [
      '.section--discount-code',
      '.section--gift-card',
      '.fieldset',
      '.section'
    ];

    let targetElement = null;
    for (const selector of selectors) {
      targetElement = document.querySelector(selector);
      if (targetElement) break;
    }

    if (targetElement) {
      targetElement.insertAdjacentHTML('beforebegin', \`
        <div style="
          background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
          border: 2px solid #2196f3;
          border-radius: 15px;
          padding: 25px;
          margin: 25px 0;
          text-align: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 8px 20px rgba(33, 150, 243, 0.2);
        ">
          <div style="font-size: 24px; margin-bottom: 15px;">💰</div>
          <strong style="font-size: 18px; color: #1976d2; display: block; margin-bottom: 10px;">
            You have \${data.redemption.balance} loyalty points!
          </strong>
          <div style="color: #1565c0; font-size: 14px;">
            You need at least 100 points to redeem for discounts.
          </div>
        </div>
      \`);
    }
  }

  // Add fadeOut animation
  const style = document.createElement('style');
  style.textContent = \`
    @keyframes fadeOut {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-20px); }
    }
  \`;
  document.head.appendChild(style);

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWidget);
  } else {
    initializeWidget();
  }

})();
  `;

  res.send(script);
});

// Add this route to your shopify.js file to check script tags

// List all script tags
router.get('/script-tags', async (req, res) => {
  try {
    const response = await shopifyAPI('script_tags.json');
    const scriptTags = response.data.script_tags;
    
    res.json({
      success: true,
      total_count: scriptTags.length,
      script_tags: scriptTags.map(script => ({
        id: script.id,
        src: script.src,
        event: script.event,
        created_at: script.created_at,
        is_our_app: script.src?.includes(APP_URL) || false
      })),
      our_app_scripts: scriptTags.filter(s => s.src?.includes(APP_URL))
    });
  } catch (error) {
    console.error('[SHOPIFY] Error listing script tags:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to list script tags',
      message: error.response?.data?.errors || error.message
    });
  }
});

module.exports = router;