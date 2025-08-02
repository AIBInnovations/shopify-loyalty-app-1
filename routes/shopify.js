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

module.exports = router;