const mongoose = require('mongoose');

// Customer Points Schema
const customerPointsSchema = new mongoose.Schema({
  customer_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    index: true
  },
  first_name: String,
  last_name: String,
  current_balance: {
    type: Number,
    default: 0,
    min: 0
  },
  total_earned: {
    type: Number,
    default: 0,
    min: 0
  },
  total_redeemed: {
    type: Number,
    default: 0,
    min: 0
  },
  tier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum'],
    default: 'bronze'
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Points Transaction Schema
const pointsTransactionSchema = new mongoose.Schema({
  customer_id: {
    type: String,
    required: true,
    index: true
  },
  order_id: {
    type: String,
    index: true
  },
  transaction_type: {
    type: String,
    enum: ['earned', 'redeemed', 'expired', 'adjusted'],
    required: true
  },
  points: {
    type: Number,
    required: true
  },
  order_total: {
    type: Number
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    order_number: String,
    promotion_id: String,
    spin_wheel_result: String,
    admin_note: String
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Store Configuration Schema
const storeConfigSchema = new mongoose.Schema({
  store_domain: {
    type: String,
    required: true,
    unique: true
  },
  points_settings: {
    points_per_dollar: {
      type: Number,
      default: 0, // Not used with static points
      min: 0
    },
    minimum_order_amount: {
      type: Number,
      default: 0,
      min: 0
    },
    points_expiry_days: {
      type: Number,
      default: 365,
      min: 0
    },
    welcome_bonus: {
      type: Number,
      default: 100,
      min: 0
    },
    static_points_per_order: {
      type: Number,
      default: 50,
      min: 0,
      description: 'Fixed points awarded per order regardless of order value'
    },
    use_static_points: {
      type: Boolean,
      default: true,
      description: 'Use static points per order instead of value-based calculation'
    }
  },
  tier_settings: {
    bronze_threshold: {
      type: Number,
      default: 0
    },
    silver_threshold: {
      type: Number,
      default: 500
    },
    gold_threshold: {
      type: Number,
      default: 1500
    },
    platinum_threshold: {
      type: Number,
      default: 5000
    }
  },
  spin_wheel_settings: {
    enabled: {
      type: Boolean,
      default: true
    },
    min_order_amount: {
      type: Number,
      default: 50
    },
    prizes: [{
      type: {
        type: String,
        enum: ['points', 'discount', 'free_shipping'],
        required: true
      },
      value: {
        type: Number,
        required: true
      },
      label: {
        type: String,
        required: true
      },
      probability: {
        type: Number,
        required: true,
        min: 0,
        max: 100
      },
      color: {
        type: String,
        default: '#3B82F6'
      }
    }],
    daily_limit: {
      type: Number,
      default: 1
    }
  },
  webhooks_configured: {
    type: Boolean,
    default: false
  },
  active: {
    type: Boolean,
    default: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Spin Wheel Attempts Schema
const spinWheelAttemptSchema = new mongoose.Schema({
  customer_id: {
    type: String,
    required: true,
    index: true
  },
  order_id: {
    type: String,
    required: true
  },
  prize_type: {
    type: String,
    enum: ['points', 'discount', 'free_shipping'],
    required: true
  },
  prize_value: {
    type: Number,
    required: true
  },
  prize_label: {
    type: String,
    required: true
  },
  redeemed: {
    type: Boolean,
    default: false
  },
  redeemed_at: Date,
  expires_at: {
    type: Date,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: false }
});

// Create indexes for better performance
customerPointsSchema.index({ email: 1, customer_id: 1 });
pointsTransactionSchema.index({ customer_id: 1, created_at: -1 });
spinWheelAttemptSchema.index({ customer_id: 1, created_at: -1 });
spinWheelAttemptSchema.index({ expires_at: 1 });

// Create models
const CustomerPoints = mongoose.model('CustomerPoints', customerPointsSchema);
const PointsTransaction = mongoose.model('PointsTransaction', pointsTransactionSchema);
const StoreConfig = mongoose.model('StoreConfig', storeConfigSchema);
const SpinWheelAttempt = mongoose.model('SpinWheelAttempt', spinWheelAttemptSchema);

module.exports = {
  CustomerPoints,
  PointsTransaction,
  StoreConfig,
  SpinWheelAttempt
};