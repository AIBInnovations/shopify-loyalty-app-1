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

// Get redemption options for customer
router.get('/customer/:customerId/redemption-options', requireDatabase, async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const options = await PointsService.getRedemptionOptions(customerId);
    
    res.json({
      success: true,
      customer_id: customerId,
      redemption: options
    });
  } catch (error) {
    console.error('[POINTS API] Error getting redemption options:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get redemption options',
      message: error.message
    });
  }
});

// Get redemption options by email
router.get('/customer/email/:email/redemption-options', requireDatabase, async (req, res) => {
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
    
    const options = await PointsService.getRedemptionOptions(customerPoints.customer_id);
    
    res.json({
      success: true,
      customer_id: customerPoints.customer_id,
      email: customerPoints.email,
      redemption: options
    });
  } catch (error) {
    console.error('[POINTS API] Error getting redemption options by email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get redemption options',
      message: error.message
    });
  }
});

// Validate redemption before processing
router.post('/validate-redemption', requireDatabase, async (req, res) => {
  try {
    const { customer_id, points } = req.body;
    
    if (!customer_id || !points) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customer_id, points'
      });
    }
    
    const validation = await PointsService.validateRedemption(customer_id, parseInt(points));
    
    res.json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('[POINTS API] Error validating redemption:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate redemption',
      message: error.message
    });
  }
});

// Redeem points for discount
router.post('/redeem', requireDatabase, async (req, res) => {
  try {
    const { customer_id, points, order_id, description } = req.body;
    
    if (!customer_id || !points) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customer_id, points'
      });
    }
    
    const result = await PointsService.redeemPoints(
      customer_id,
      parseInt(points),
      order_id,
      description
    );
    
    res.json({
      success: true,
      message: 'Points redeemed successfully',
      redemption: result
    });
  } catch (error) {
    console.error('[POINTS API] Error redeeming points:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to redeem points',
      message: error.message
    });
  }
});

// Redeem points by email
router.post('/redeem-by-email', requireDatabase, async (req, res) => {
  try {
    const { email, points, order_id, description } = req.body;
    
    if (!email || !points) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, points'
      });
    }
    
    // Find customer by email
    const customerPoints = await CustomerPoints.findOne({ email: email.toLowerCase() });
    
    if (!customerPoints) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        email
      });
    }
    
    const result = await PointsService.redeemPoints(
      customerPoints.customer_id,
      parseInt(points),
      order_id,
      description
    );
    
    res.json({
      success: true,
      message: 'Points redeemed successfully',
      redemption: result
    });
  } catch (error) {
    console.error('[POINTS API] Error redeeming points by email:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to redeem points',
      message: error.message
    });
  }
});

// Enhanced points redemption for coupon system
// Add these routes to your routes/points.js file

// Complete coupon redemption flow
router.post('/redeem-for-coupon', requireDatabase, async (req, res) => {
  try {
    const { customer_email, points, redemption_source = 'cart' } = req.body;
    
    if (!customer_email || !points) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customer_email, points'
      });
    }

    console.log(`[POINTS] Processing coupon redemption: ${points} points for ${customer_email}`);

    // Step 1: Find customer
    const customer = await CustomerPoints.findOne({ email: customer_email.toLowerCase() });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found in loyalty system',
        customer_email
      });
    }

    // Step 2: Validate redemption
    const validation = await PointsService.validateRedemption(customer.customer_id, points);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        customer_balance: customer.current_balance,
        points_requested: points
      });
    }

    // Step 3: Create Shopify discount code
    const axios = require('axios');
    const discountResponse = await axios.post(
      `${process.env.APP_URL}/api/shopify/create-loyalty-discount`,
      {
        customer_id: customer.customer_id,
        customer_email: customer_email,
        points: points,
        redemption_source: redemption_source
      }
    );

    if (!discountResponse.data.success) {
      throw new Error('Failed to create discount code: ' + discountResponse.data.error);
    }

    const discountData = discountResponse.data;
    console.log(`[POINTS] Discount code created: ${discountData.discount_code}`);

    // Step 4: Deduct points from customer account
    customer.current_balance -= points;
    customer.total_redeemed += points;
    customer.tier = PointsService.calculateTier(customer.total_earned);
    
    await customer.save();

    // Step 5: Record transaction
    await PointsService.recordTransaction({
      customer_id: customer.customer_id,
      transaction_type: 'redeemed',
      points: points,
      description: `Coupon redemption: ${discountData.discount_code}`,
      metadata: {
        discount_code: discountData.discount_code,
        discount_amount: discountData.discount_amount,
        price_rule_id: discountData.price_rule_id,
        redemption_source: redemption_source,
        expires_at: discountData.expires_at
      }
    });

    console.log(`[POINTS] Successfully redeemed ${points} points for ${customer_email}`);

    // Step 6: Return complete response
    res.json({
      success: true,
      message: 'Points redeemed successfully for discount code',
      redemption: {
        customer_id: customer.customer_id,
        customer_email: customer_email,
        points_redeemed: points,
        new_balance: customer.current_balance,
        new_tier: customer.tier,
        total_redeemed: customer.total_redeemed
      },
      discount: {
        code: discountData.discount_code,
        amount: discountData.discount_amount,
        expires_at: discountData.expires_at,
        instructions: discountData.instructions,
        minimum_cart_value: discountData.minimum_cart_value
      },
      redemption_source: redemption_source,
      created_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('[POINTS] Error in coupon redemption:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process coupon redemption',
      message: error.message
    });
  }
});

// Get customer's discount code history
router.get('/customer/:customerId/discount-codes', requireDatabase, async (req, res) => {
  try {
    const { customerId } = req.params;
    const { limit = 10, status = 'all' } = req.query;
    
    // Get transactions that created discount codes
    const transactions = await PointsTransaction
      .find({ 
        customer_id: customerId,
        transaction_type: 'redeemed',
        'metadata.discount_code': { $exists: true }
      })
      .sort({ created_at: -1 })
      .limit(parseInt(limit));

    // Enrich with current status of discount codes
    const enrichedCodes = await Promise.all(
      transactions.map(async (transaction) => {
        const discountCode = transaction.metadata.discount_code;
        let codeStatus = 'unknown';
        
        try {
          // Check current status via Shopify API
          const axios = require('axios');
          const statusResponse = await axios.get(
            `${process.env.APP_URL}/api/shopify/validate-discount/${discountCode}`
          );
          
          if (statusResponse.data.success) {
            if (statusResponse.data.is_expired) {
              codeStatus = 'expired';
            } else if (statusResponse.data.is_used) {
              codeStatus = 'used';
            } else {
              codeStatus = 'active';
            }
          }
        } catch (err) {
          console.warn(`[POINTS] Could not validate discount code ${discountCode}:`, err.message);
        }

        return {
          transaction_id: transaction._id,
          discount_code: discountCode,
          points_redeemed: transaction.points,
          discount_amount: transaction.metadata.discount_amount,
          status: codeStatus,
          created_at: transaction.created_at,
          expires_at: transaction.metadata.expires_at,
          redemption_source: transaction.metadata.redemption_source || 'unknown'
        };
      })
    );

    // Filter by status if requested
    const filteredCodes = status === 'all' 
      ? enrichedCodes 
      : enrichedCodes.filter(code => code.status === status);

    res.json({
      success: true,
      customer_id: customerId,
      discount_codes: filteredCodes,
      count: filteredCodes.length,
      filter: { limit: parseInt(limit), status }
    });

  } catch (error) {
    console.error('[POINTS] Error getting customer discount codes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get customer discount codes',
      message: error.message
    });
  }
});

// Get redemption analytics
router.get('/redemption-analytics', requireDatabase, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get redemption transactions
    const redemptions = await PointsTransaction.find({
      transaction_type: 'redeemed',
      created_at: { $gte: startDate },
      'metadata.discount_code': { $exists: true }
    });

    // Calculate analytics
    const totalRedemptions = redemptions.length;
    const totalPointsRedeemed = redemptions.reduce((sum, txn) => sum + txn.points, 0);
    const totalDiscountValue = redemptions.reduce((sum, txn) => sum + (txn.metadata.discount_amount || 0), 0);

    // Group by redemption source
    const sourceBreakdown = redemptions.reduce((acc, txn) => {
      const source = txn.metadata.redemption_source || 'unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});

    // Group by day
    const dailyRedemptions = redemptions.reduce((acc, txn) => {
      const date = txn.created_at.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    // Get top customers
    const customerStats = redemptions.reduce((acc, txn) => {
      const customerId = txn.customer_id;
      if (!acc[customerId]) {
        acc[customerId] = { redemptions: 0, points: 0, discount_value: 0 };
      }
      acc[customerId].redemptions++;
      acc[customerId].points += txn.points;
      acc[customerId].discount_value += txn.metadata.discount_amount || 0;
      return acc;
    }, {});

    const topCustomers = Object.entries(customerStats)
      .map(([customerId, stats]) => ({ customer_id: customerId, ...stats }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);

    res.json({
      success: true,
      period: {
        days: parseInt(days),
        start_date: startDate.toISOString(),
        end_date: new Date().toISOString()
      },
      summary: {
        total_redemptions: totalRedemptions,
        total_points_redeemed: totalPointsRedeemed,
        total_discount_value: totalDiscountValue,
        average_redemption_size: totalRedemptions > 0 ? Math.round(totalPointsRedeemed / totalRedemptions) : 0,
        average_discount_value: totalRedemptions > 0 ? (totalDiscountValue / totalRedemptions).toFixed(2) : '0.00'
      },
      breakdowns: {
        by_source: sourceBreakdown,
        by_day: dailyRedemptions,
        top_customers: topCustomers
      }
    });

  } catch (error) {
    console.error('[POINTS] Error getting redemption analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get redemption analytics',
      message: error.message
    });
  }
});

// Bulk redemption validation (for cart widget)
router.post('/validate-bulk-redemption', requireDatabase, async (req, res) => {
  try {
    const { customer_email, point_options } = req.body;
    
    if (!customer_email || !Array.isArray(point_options)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: customer_email, point_options (array)'
      });
    }

    // Find customer
    const customer = await CustomerPoints.findOne({ email: customer_email.toLowerCase() });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found',
        customer_email
      });
    }

    // Validate each option
    const validatedOptions = await Promise.all(
      point_options.map(async (points) => {
        const validation = await PointsService.validateRedemption(customer.customer_id, points);
        return {
          points: points,
          valid: validation.valid,
          discount_amount: validation.valid ? Math.floor(points / 100) : 0,
          error: validation.error || null
        };
      })
    );

    res.json({
      success: true,
      customer_id: customer.customer_id,
      customer_email: customer_email,
      current_balance: customer.current_balance,
      options: validatedOptions.filter(option => option.valid),
      invalid_options: validatedOptions.filter(option => !option.valid)
    });

  } catch (error) {
    console.error('[POINTS] Error validating bulk redemption:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate redemption options',
      message: error.message
    });
  }
});

module.exports = router;