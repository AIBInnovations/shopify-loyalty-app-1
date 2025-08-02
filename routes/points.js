const express = require('express');
const router = express.Router();
const PointsService = require('../services/pointsService');
const { CustomerPoints, PointsTransaction, StoreConfig } = require('../models');

// Middleware to check database connection
const requireDatabase = (req, res, next) => {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      error: 'Database not available',
      message: 'MongoDB connection is not established. Please check your MONGODB_URI environment variable.',
      database_status: {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      }[mongoose.connection.readyState] || 'unknown'
    });
  }
  next();
};

// 0. Points system status (works without database)
router.get('/status', async (req, res) => {
  const mongoose = require('mongoose');
  const dbConnected = mongoose.connection.readyState === 1;
  
  res.json({
    success: true,
    points_system: {
      available: dbConnected,
      database_status: {
        0: 'disconnected',
        1: 'connected', 
        2: 'connecting',
        3: 'disconnecting'
      }[mongoose.connection.readyState] || 'unknown',
      mongodb_configured: !!process.env.MONGODB_URI
    },
    message: dbConnected 
      ? 'Points system is fully operational' 
      : 'Points system requires MongoDB connection'
  });
});

// 1. Get customer points balance
router.get('/customer/:customerId', requireDatabase, async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const customerPoints = await PointsService.getCustomerPoints(customerId);
    
    res.json({
      success: true,
      customer: customerPoints
    });
  } catch (error) {
    console.error('[POINTS API] Error getting customer points:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer points',
      message: error.message
    });
  }
});

// 2. Get customer transaction history
router.get('/customer/:customerId/transactions', requireDatabase, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 20 } = req.query;
    
    const transactions = await PointsService.getCustomerTransactions(customerId, parseInt(limit));
    
    res.json({
      success: true,
      customer_id: customerId,
      transactions: transactions.map(t => ({
        id: t._id,
        transaction_type: t.transaction_type,
        points: t.points,
        description: t.description,
        order_total: t.order_total,
        metadata: t.metadata,
        created_at: t.created_at
      })),
      count: transactions.length
    });
  } catch (error) {
    console.error('[POINTS API] Error getting customer transactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer transactions',
      message: error.message
    });
  }
});

// 3. Get customer by email
router.get('/customer/email/:email', requireDatabase, async (req, res) => {
  try {
    const { email } = req.params;
    
    const customerPoints = await CustomerPoints.findOne({ email: email.toLowerCase() });
    
    if (!customerPoints) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        email
      });
    }
    
    // Get recent transactions
    const transactions = await PointsService.getCustomerTransactions(customerPoints.customer_id, 10);
    
    res.json({
      success: true,
      customer: customerPoints,
      recent_transactions: transactions.map(t => ({
        transaction_type: t.transaction_type,
        points: t.points,
        description: t.description,
        created_at: t.created_at
      }))
    });
  } catch (error) {
    console.error('[POINTS API] Error getting customer by email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer by email',
      message: error.message
    });
  }
});

// 4. Manually award points (admin function)
router.post('/award', requireDatabase, async (req, res) => {
  try {
    const { customer_id, points, description, admin_note } = req.body;
    
    if (!customer_id || !points || !description) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customer_id, points, description'
      });
    }
    
    // Get or create customer
    let customerPoints = await CustomerPoints.findOne({ customer_id });
    
    if (!customerPoints) {
      customerPoints = new CustomerPoints({
        customer_id,
        email: `customer_${customer_id}@unknown.com`,
        current_balance: 0,
        total_earned: 0,
        total_redeemed: 0
      });
    }
    
    // Award points
    customerPoints.current_balance += points;
    customerPoints.total_earned += points;
    customerPoints.tier = PointsService.calculateTier(customerPoints.total_earned);
    
    await customerPoints.save();
    
    // Record transaction
    await PointsService.recordTransaction({
      customer_id,
      transaction_type: 'earned',
      points,
      description,
      metadata: {
        admin_note: admin_note || 'Manual points award'
      }
    });
    
    res.json({
      success: true,
      message: 'Points awarded successfully',
      customer_id,
      points_awarded: points,
      new_balance: customerPoints.current_balance,
      new_tier: customerPoints.tier
    });
  } catch (error) {
    console.error('[POINTS API] Error awarding points:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to award points',
      message: error.message
    });
  }
});

// 5. Get store configuration
router.get('/config', requireDatabase, async (req, res) => {
  try {
    const config = await PointsService.getStoreConfig();
    
    res.json({
      success: true,
      config: {
        store_domain: config.store_domain,
        points_settings: config.points_settings,
        tier_settings: config.tier_settings,
        spin_wheel_settings: config.spin_wheel_settings,
        webhooks_configured: config.webhooks_configured,
        active: config.active
      }
    });
  } catch (error) {
    console.error('[POINTS API] Error getting config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get store configuration',
      message: error.message
    });
  }
});

// 6. Update store configuration
router.put('/config', requireDatabase, async (req, res) => {
  try {
    const { points_settings, tier_settings, spin_wheel_settings } = req.body;
    
    const config = await PointsService.getStoreConfig();
    
    if (points_settings) {
      config.points_settings = { ...config.points_settings, ...points_settings };
    }
    
    if (tier_settings) {
      config.tier_settings = { ...config.tier_settings, ...tier_settings };
    }
    
    if (spin_wheel_settings) {
      config.spin_wheel_settings = { ...config.spin_wheel_settings, ...spin_wheel_settings };
    }
    
    await config.save();
    
    res.json({
      success: true,
      message: 'Store configuration updated',
      config: {
        points_settings: config.points_settings,
        tier_settings: config.tier_settings,
        spin_wheel_settings: config.spin_wheel_settings
      }
    });
  } catch (error) {
    console.error('[POINTS API] Error updating config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update store configuration',
      message: error.message
    });
  }
});

// 7. Points leaderboard
router.get('/leaderboard', requireDatabase, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const topCustomers = await CustomerPoints
      .find({ current_balance: { $gt: 0 } })
      .sort({ current_balance: -1 })
      .limit(parseInt(limit))
      .select('customer_id email first_name last_name current_balance tier total_earned');
    
    res.json({
      success: true,
      leaderboard: topCustomers.map((customer, index) => ({
        rank: index + 1,
        customer_id: customer.customer_id,
        name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown',
        email: customer.email,
        current_balance: customer.current_balance,
        tier: customer.tier,
        total_earned: customer.total_earned
      })),
      count: topCustomers.length
    });
  } catch (error) {
    console.error('[POINTS API] Error getting leaderboard:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get leaderboard',
      message: error.message
    });
  }
});

// 8. Points analytics
router.get('/analytics', requireDatabase, async (req, res) => {
  try {
    const [
      totalCustomers,
      totalPointsIssued,
      totalPointsRedeemed,
      recentTransactions
    ] = await Promise.all([
      CustomerPoints.countDocuments(),
      PointsTransaction.aggregate([
        { $match: { transaction_type: 'earned' } },
        { $group: { _id: null, total: { $sum: '$points' } } }
      ]),
      PointsTransaction.aggregate([
        { $match: { transaction_type: 'redeemed' } },
        { $group: { _id: null, total: { $sum: '$points' } } }
      ]),
      PointsTransaction
        .find()
        .sort({ created_at: -1 })
        .limit(5)
        .select('customer_id transaction_type points description created_at')
    ]);
    
    const tierDistribution = await CustomerPoints.aggregate([
      { $group: { _id: '$tier', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      analytics: {
        total_customers: totalCustomers,
        total_points_issued: totalPointsIssued[0]?.total || 0,
        total_points_redeemed: totalPointsRedeemed[0]?.total || 0,
        points_outstanding: (totalPointsIssued[0]?.total || 0) - (totalPointsRedeemed[0]?.total || 0),
        tier_distribution: tierDistribution.reduce((acc, tier) => {
          acc[tier._id] = tier.count;
          return acc;
        }, {}),
        recent_activity: recentTransactions
      }
    });
  } catch (error) {
    console.error('[POINTS API] Error getting analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get analytics',
      message: error.message
    });
  }
});

// Add this new route to your points.js file to help debug customer issues

// Debug route - Get all customers (for debugging)
router.get('/debug/customers', requireDatabase, async (req, res) => {
  try {
    const customers = await CustomerPoints.find({})
      .sort({ created_at: -1 })
      .limit(20)
      .select('customer_id email first_name last_name current_balance tier created_at');
    
    res.json({
      success: true,
      message: 'Recent customers (last 20)',
      customers: customers.map(customer => ({
        customer_id: customer.customer_id,
        email: customer.email,
        name: `${customer.first_name} ${customer.last_name}`.trim(),
        current_balance: customer.current_balance,
        tier: customer.tier,
        created_at: customer.created_at,
        is_unknown_email: customer.email.includes('@unknown.com')
      })),
      count: customers.length,
      unknown_emails: customers.filter(c => c.email.includes('@unknown.com')).length
    });
  } catch (error) {
    console.error('[POINTS API] Error getting debug customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customers for debugging',
      message: error.message
    });
  }
});

// Debug route - Fix unknown emails (manual fix)
router.post('/debug/fix-emails', requireDatabase, async (req, res) => {
  try {
    const customersWithUnknownEmail = await CustomerPoints.find({
      email: { $regex: '@unknown.com$' }
    });

    if (customersWithUnknownEmail.length === 0) {
      return res.json({
        success: true,
        message: 'No customers with unknown emails found',
        fixed: 0
      });
    }

    const fixResults = [];
    
    // For each customer with unknown email, try to get their real email from Shopify
    for (const customer of customersWithUnknownEmail) {
      try {
        // Try to get customer from Shopify API
        const shopifyAPI = require('axios').create({
          baseURL: `https://${process.env.SHOPIFY_STORE_URL}/admin/api/2023-10`,
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN
          }
        });

        const shopifyResponse = await shopifyAPI.get(`/customers/${customer.customer_id}.json`);
        const shopifyCustomer = shopifyResponse.data.customer;

        if (shopifyCustomer && shopifyCustomer.email) {
          // Update the customer record
          customer.email = shopifyCustomer.email;
          customer.first_name = shopifyCustomer.first_name || customer.first_name;
          customer.last_name = shopifyCustomer.last_name || customer.last_name;
          
          await customer.save();
          
          fixResults.push({
            customer_id: customer.customer_id,
            old_email: `customer_${customer.customer_id}@unknown.com`,
            new_email: shopifyCustomer.email,
            status: 'fixed'
          });
          
          console.log(`[DEBUG] Fixed email for customer ${customer.customer_id}: ${shopifyCustomer.email}`);
        }
      } catch (shopifyError) {
        fixResults.push({
          customer_id: customer.customer_id,
          old_email: customer.email,
          new_email: null,
          status: 'failed',
          error: shopifyError.message
        });
        console.error(`[DEBUG] Failed to fix email for customer ${customer.customer_id}:`, shopifyError.message);
      }
    }

    res.json({
      success: true,
      message: `Attempted to fix ${customersWithUnknownEmail.length} customers`,
      results: fixResults,
      fixed: fixResults.filter(r => r.status === 'fixed').length,
      failed: fixResults.filter(r => r.status === 'failed').length
    });

  } catch (error) {
    console.error('[POINTS API] Error fixing emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fix emails',
      message: error.message
    });
  }
});

module.exports = router;