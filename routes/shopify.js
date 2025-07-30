const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const router = express.Router();

// Environment variables validation
const requiredVars = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'APP_URL'];
const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.warn(`[SHOPIFY] Missing env vars: ${missing.join(', ')}`);
}

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET;
const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || 'read_orders,write_script_tags,read_customers,write_customers';
const APP_URL = process.env.APP_URL;

// Temporary storage for access tokens (Phase 4 will use MongoDB)
const stores = new Map();

// Helper: Verify webhook signature
const verifyWebhookSignature = (body, signature) => {
  if (!SHOPIFY_API_SECRET || !signature) return false;
  
  const hmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');
    
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'utf8'),
    Buffer.from(hmac, 'utf8')
  );
};

// Helper: Generate state parameter for OAuth
const generateState = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Temporary state storage (Phase 4 will use MongoDB)
const oauthStates = new Map();

// 1. OAuth Installation Route
router.get('/install', (req, res) => {
  const { shop } = req.query;
  
  if (!shop) {
    return res.status(400).json({ 
      error: 'Missing shop parameter',
      message: 'Please provide shop parameter: ?shop=your-shop.myshopify.com' 
    });
  }
  
  // Validate shop domain
  const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`;
  
  // Generate state for security
  const state = generateState();
  oauthStates.set(state, { shopDomain, timestamp: Date.now() });
  
  // Build OAuth URL
  const authUrl = `https://${shopDomain}/admin/oauth/authorize?` +
    `client_id=${SHOPIFY_API_KEY}&` +
    `scope=${SHOPIFY_SCOPES}&` +
    `redirect_uri=${APP_URL}/api/shopify/callback&` +
    `state=${state}`;
  
  console.log(`[SHOPIFY] OAuth initiated for: ${shopDomain}`);
  res.redirect(authUrl);
});

// 2. OAuth Callback Route
router.get('/callback', async (req, res) => {
  const { code, state, shop, hmac, timestamp } = req.query;
  
  try {
    // Verify state parameter
    const stateData = oauthStates.get(state);
    if (!stateData) {
      throw new Error('Invalid state parameter');
    }
    
    // Clean up used state
    oauthStates.delete(state);
    
    // Verify shop domain matches
    if (stateData.shopDomain !== shop) {
      throw new Error('Shop domain mismatch');
    }
    
    // Exchange code for access token
    const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code: code
    });
    
    const { access_token, scope } = tokenResponse.data;
    
    // Store shop data (Phase 4 will save to MongoDB)
    stores.set(shop, {
      shop,
      access_token,
      scope,
      installed_at: new Date().toISOString()
    });
    
    console.log(`[SHOPIFY] App installed successfully for: ${shop}`);
    console.log(`[SHOPIFY] Granted scopes: ${scope}`);
    
    // Register webhooks
    await registerWebhooks(shop, access_token);
    
    res.json({
      success: true,
      message: 'App installed successfully!',
      shop,
      scopes: scope.split(',')
    });
    
  } catch (error) {
    console.error('[SHOPIFY] OAuth callback error:', error.message);
    res.status(400).json({
      error: 'Installation failed',
      message: error.message
    });
  }
});

// 3. Register Webhooks Helper
const registerWebhooks = async (shop, accessToken) => {
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
      topic: 'app/uninstalled',
      address: `${APP_URL}/api/shopify/webhooks/app/uninstalled`,
      format: 'json'
    }
  ];
  
  for (const webhook of webhooks) {
    try {
      await axios.post(`https://${shop}/admin/api/2023-10/webhooks.json`, 
        { webhook },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );
      console.log(`[SHOPIFY] Webhook registered: ${webhook.topic} for ${shop}`);
    } catch (error) {
      console.error(`[SHOPIFY] Failed to register webhook ${webhook.topic}:`, error.response?.data || error.message);
    }
  }
};

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
    console.log(`[SHOPIFY] New order received from ${shop}: #${order.order_number} - $${order.total_price}`);
    
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
    console.log(`[SHOPIFY] Order updated from ${shop}: #${order.order_number}`);
    
    // Phase 4: Handle order updates (refunds, cancellations)
    console.log(`[SHOPIFY] TODO: Handle order update for ${order.id}`);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('[SHOPIFY] Error processing order update webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// App Uninstalled Webhook
router.post('/webhooks/app/uninstalled', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.get('X-Shopify-Hmac-Sha256');
  const shop = req.get('X-Shopify-Shop-Domain');
  
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn(`[SHOPIFY] Invalid webhook signature from ${shop}`);
    return res.status(401).send('Unauthorized');
  }
  
  console.log(`[SHOPIFY] App uninstalled from ${shop}`);
  
  // Clean up store data
  stores.delete(shop);
  
  // Phase 4: Clean up database records
  console.log(`[SHOPIFY] TODO: Clean up database for ${shop}`);
  
  res.status(200).send('OK');
});

// 5. Store Status Route
router.get('/store/:shop', (req, res) => {
  const { shop } = req.params;
  const storeData = stores.get(shop);
  
  if (!storeData) {
    return res.status(404).json({
      error: 'Store not found',
      message: 'This store has not installed the app'
    });
  }
  
  res.json({
    shop: storeData.shop,
    installed_at: storeData.installed_at,
    scopes: storeData.scope.split(','),
    status: 'active'
  });
});

// 6. Test Shopify API Route
router.get('/test/:shop', async (req, res) => {
  const { shop } = req.params;
  const storeData = stores.get(shop);
  
  if (!storeData) {
    return res.status(404).json({ error: 'Store not found' });
  }
  
  try {
    const response = await axios.get(`https://${shop}/admin/api/2023-10/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': storeData.access_token
      }
    });
    
    res.json({
      success: true,
      shop_info: {
        name: response.data.shop.name,
        domain: response.data.shop.domain,
        email: response.data.shop.email,
        plan: response.data.shop.plan_name
      }
    });
  } catch (error) {
    console.error('[SHOPIFY] API test error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'API test failed',
      message: error.response?.data?.errors || error.message
    });
  }
});

module.exports = router;