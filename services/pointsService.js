const { CustomerPoints, PointsTransaction, StoreConfig } = require('../models');

class PointsService {
  
  // Calculate points for an order
  static async calculateOrderPoints(orderData, storeConfig = null) {
    try {
      // Get store configuration
      const config = storeConfig || await this.getStoreConfig();
      const { minimum_order_amount } = config.points_settings;
      
      const orderTotal = parseFloat(orderData.total_price);
      
      // STATIC POINTS: Award 50 points for every order regardless of value
      const staticPoints = 50;
      
      console.log(`[POINTS] Static points calculation: ${staticPoints} points for order #${orderData.order_number}`);
      console.log(`[POINTS] Order value: ${orderTotal} (value ignored for points calculation)`);
      
      return {
        points: staticPoints,
        base_points: staticPoints,
        order_total: orderTotal,
        calculation_method: 'static',
        note: 'Fixed 50 points per order regardless of order value'
      };
    } catch (error) {
      console.error('[POINTS] Error calculating order points:', error);
      return { points: 0, error: error.message };
    }
  }
  
  // Award points to customer
  static async awardPoints(customerId, orderData, pointsCalculation) {
    try {
      if (pointsCalculation.points <= 0) {
        console.log(`[POINTS] No points to award for order ${orderData.id}`);
        return null;
      }
      
      // Find or create customer points record
      let customerPoints = await CustomerPoints.findOne({ customer_id: customerId });
      
      if (!customerPoints) {
        // Create new customer record with PROPER email handling
        const customerEmail = orderData.customer?.email || orderData.email || `customer_${customerId}@unknown.com`;
        const firstName = orderData.customer?.first_name || orderData.first_name || '';
        const lastName = orderData.customer?.last_name || orderData.last_name || '';
        
        console.log(`[POINTS] Creating new customer record:`);
        console.log(`[POINTS] - Customer ID: ${customerId}`);
        console.log(`[POINTS] - Email: ${customerEmail}`);
        console.log(`[POINTS] - Name: ${firstName} ${lastName}`);
        
        customerPoints = new CustomerPoints({
          customer_id: customerId,
          email: customerEmail,
          first_name: firstName,
          last_name: lastName,
          current_balance: 0,
          total_earned: 0,
          total_redeemed: 0
        });
        
        // Add welcome bonus for new customers
        const config = await this.getStoreConfig();
        const welcomeBonus = config.points_settings.welcome_bonus;
        
        if (welcomeBonus > 0) {
          customerPoints.current_balance += welcomeBonus;
          customerPoints.total_earned += welcomeBonus;
          
          // Record welcome bonus transaction
          await this.recordTransaction({
            customer_id: customerId,
            transaction_type: 'earned',
            points: welcomeBonus,
            description: 'Welcome bonus for new customer',
            metadata: {
              order_number: orderData.order_number
            }
          });
          
          console.log(`[POINTS] Welcome bonus awarded: ${welcomeBonus} points to ${customerId} (${customerEmail})`);
        }
      } else {
        // Update existing customer's email if it was previously unknown
        if (customerPoints.email.includes('@unknown.com') && orderData.customer?.email) {
          console.log(`[POINTS] Updating customer email from ${customerPoints.email} to ${orderData.customer.email}`);
          customerPoints.email = orderData.customer.email;
          customerPoints.first_name = orderData.customer.first_name || customerPoints.first_name;
          customerPoints.last_name = orderData.customer.last_name || customerPoints.last_name;
        }
      }
      
      // Award order points
      customerPoints.current_balance += pointsCalculation.points;
      customerPoints.total_earned += pointsCalculation.points;
      
      // Update tier if needed
      customerPoints.tier = this.calculateTier(customerPoints.total_earned);
      
      await customerPoints.save();
      
      // Record points transaction
      await this.recordTransaction({
        customer_id: customerId,
        order_id: orderData.id.toString(),
        transaction_type: 'earned',
        points: pointsCalculation.points,
        order_total: pointsCalculation.order_total,
        description: `Points earned from order #${orderData.order_number} (${pointsCalculation.calculation_method})`,
        metadata: {
          order_number: orderData.order_number,
          calculation_method: pointsCalculation.calculation_method,
          note: pointsCalculation.note
        }
      });
      
      console.log(`[POINTS] Awarded ${pointsCalculation.points} points to customer ${customerId} (${customerPoints.email}) for order ${orderData.order_number} (${pointsCalculation.calculation_method})`);
      
      return {
        customer_id: customerId,
        points_awarded: pointsCalculation.points,
        new_balance: customerPoints.current_balance,
        new_tier: customerPoints.tier,
        total_earned: customerPoints.total_earned,
        calculation_method: pointsCalculation.calculation_method,
        customer_email: customerPoints.email
      };
      
    } catch (error) {
      console.error('[POINTS] Error awarding points:', error);
      throw error;
    }
  }
  
  // Get customer points balance
  static async getCustomerPoints(customerId) {
    try {
      const customerPoints = await CustomerPoints.findOne({ customer_id: customerId });
      
      if (!customerPoints) {
        return {
          customer_id: customerId,
          current_balance: 0,
          total_earned: 0,
          total_redeemed: 0,
          tier: 'bronze',
          exists: false
        };
      }
      
      return {
        ...customerPoints.toObject(),
        exists: true
      };
    } catch (error) {
      console.error('[POINTS] Error getting customer points:', error);
      throw error;
    }
  }
  
  // Get customer transaction history
  static async getCustomerTransactions(customerId, limit = 20) {
    try {
      const transactions = await PointsTransaction
        .find({ customer_id: customerId })
        .sort({ created_at: -1 })
        .limit(limit);
      
      return transactions;
    } catch (error) {
      console.error('[POINTS] Error getting customer transactions:', error);
      throw error;
    }
  }
  
  // Record points transaction
  static async recordTransaction(transactionData) {
    try {
      const transaction = new PointsTransaction(transactionData);
      await transaction.save();
      return transaction;
    } catch (error) {
      console.error('[POINTS] Error recording transaction:', error);
      throw error;
    }
  }
  
  // Calculate customer tier based on total points earned
  static calculateTier(totalEarned) {
    if (totalEarned >= 5000) return 'platinum';
    if (totalEarned >= 1500) return 'gold';
    if (totalEarned >= 500) return 'silver';
    return 'bronze';
  }
  
  // Get or create store configuration
  static async getStoreConfig(storeDomain = null) {
    try {
      const domain = storeDomain || process.env.SHOPIFY_STORE_URL || 'default.myshopify.com';
      
      let config = await StoreConfig.findOne({ store_domain: domain });
      
      if (!config) {
        // Create default configuration with static points
        config = new StoreConfig({
          store_domain: domain,
          points_settings: {
            points_per_dollar: 0, // Not used with static points
            minimum_order_amount: 0, // No minimum for static points
            points_expiry_days: 365,
            welcome_bonus: 100,
            static_points_per_order: 50 // New setting for static points
          },
          tier_settings: {
            bronze_threshold: 0,
            silver_threshold: 500,
            gold_threshold: 1500,
            platinum_threshold: 5000
          },
          spin_wheel_settings: {
            enabled: true,
            min_order_amount: 0, // No minimum for spin wheel with static points
            prizes: [
              { type: 'points', value: 50, label: '50 Points', probability: 30, color: '#3B82F6' },
              { type: 'points', value: 100, label: '100 Points', probability: 25, color: '#10B981' },
              { type: 'points', value: 200, label: '200 Points', probability: 15, color: '#F59E0B' },
              { type: 'discount', value: 10, label: '10% Off', probability: 20, color: '#EF4444' },
              { type: 'free_shipping', value: 1, label: 'Free Shipping', probability: 10, color: '#8B5CF6' }
            ],
            daily_limit: 1
          }
        });
        
        await config.save();
        console.log(`[POINTS] Created default store configuration for ${domain} with static points`);
      }
      
      return config;
    } catch (error) {
      console.error('[POINTS] Error getting store config:', error);
      throw error;
    }
  }
  
  // Process order for points (main entry point)
  static async processOrder(orderData) {
    try {
      console.log(`[POINTS] Processing order ${orderData.order_number} for points`);
      console.log(`[POINTS] Order data customer:`, {
        id: orderData.customer?.id,
        email: orderData.customer?.email,
        first_name: orderData.customer?.first_name,
        last_name: orderData.customer?.last_name
      });
      
      // Skip if no customer
      if (!orderData.customer || !orderData.customer.id) {
        console.log(`[POINTS] Skipping order ${orderData.order_number} - no customer data`);
        return null;
      }
      
      const customerId = orderData.customer.id.toString();
      
      // Calculate points
      const pointsCalculation = await this.calculateOrderPoints(orderData);
      
      if (pointsCalculation.error) {
        console.error(`[POINTS] Error calculating points for order ${orderData.order_number}:`, pointsCalculation.error);
        return null;
      }
      
      // Award points
      const result = await this.awardPoints(customerId, orderData, pointsCalculation);
      
      return result;
    } catch (error) {
      console.error('[POINTS] Error processing order:', error);
      throw error;
    }
  }
}

module.exports = PointsService;