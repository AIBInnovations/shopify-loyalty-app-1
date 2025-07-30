const express = require('express');
const router = express.Router();
const PointsService = require('../services/pointsService');
const { CustomerPoints, PointsTransaction, StoreConfig } = require('../models');

// 1. Get customer points balance
router.get('/customer/:customerId', async (req, res) => {
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
router.get('/customer/:customerId/transactions', async (req, res) => {
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
router.get('/customer/email/:email', async (req, res) => {
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
router.post('/award', async (req, res) => {
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
router.get('/config', async (req, res) => {
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
router.put('/config', async (req, res) => {
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
router.get('/leaderboard', async (req, res) => {
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
router.get('/analytics', async (req, res) => {
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

module.exports = router;