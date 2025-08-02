import axios from 'axios';

// Base API URL - adjust based on your deployment
const API_BASE_URL = (window as any)?.process?.env?.REACT_APP_API_URL || 'https://shopify-loyalty-app-1.onrender.com';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('[API] Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`[API] ✅ ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    return response;
  },
  (error) => {
    console.error(`[API] ❌ ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status}`, error.response?.data);
    return Promise.reject(error);
  }
);

// Types
export interface CustomerPoints {
  customer_id: string;
  email: string;
  first_name: string;
  last_name: string;
  current_balance: number;
  total_earned: number;
  total_redeemed: number;
  tier: string;
  created_at: string;
  updated_at: string;
}

export interface PointsTransaction {
  id: string;
  customer_id: string;
  transaction_type: 'earned' | 'redeemed' | 'expired' | 'adjusted';
  points: number;
  description: string;
  order_total?: number;
  metadata?: any;
  created_at: string;
}

export interface StoreConfig {
  store_domain: string;
  points_settings: {
    points_per_dollar: number;
    minimum_order_amount: number;
    points_expiry_days: number;
    welcome_bonus: number;
    static_points_per_order: number;
    use_static_points: boolean;
  };
  tier_settings: {
    bronze_threshold: number;
    silver_threshold: number;
    gold_threshold: number;
    platinum_threshold: number;
  };
  spin_wheel_settings: any;
}

export interface Analytics {
  total_customers: number;
  total_points_issued: number;
  total_points_redeemed: number;
  points_outstanding: number;
  tier_distribution: Record<string, number>;
  recent_activity: PointsTransaction[];
}

export interface ShopifyOrder {
  id: string;
  order_number: string;
  total_price: string;
  financial_status: string;
  created_at: string;
  customer: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
}

// API Service Class
class ApiService {
  // Health & Status
  async getHealth() {
    const response = await api.get('/health');
    return response.data;
  }

  async getAppStatus() {
    const response = await api.get('/');
    return response.data;
  }

  // Points System
  async getPointsStatus() {
    const response = await api.get('/api/points/status');
    return response.data;
  }

  async getPointsConfig(): Promise<StoreConfig> {
    const response = await api.get('/api/points/config');
    return response.data.config;
  }

  async updatePointsConfig(config: Partial<StoreConfig>) {
    const response = await api.put('/api/points/config', config);
    return response.data;
  }

  async getAnalytics(): Promise<Analytics> {
    const response = await api.get('/api/points/analytics');
    return response.data.analytics;
  }

  async getLeaderboard(limit: number = 10) {
    const response = await api.get(`/api/points/leaderboard?limit=${limit}`);
    return response.data.leaderboard;
  }

  // Customer Management
  async getCustomerPoints(customerId: string): Promise<CustomerPoints> {
    const response = await api.get(`/api/points/customer/${customerId}`);
    return response.data.customer;
  }

  async getCustomerByEmail(email: string): Promise<CustomerPoints> {
    const response = await api.get(`/api/points/customer/email/${email}`);
    return response.data.customer;
  }

  async getCustomerTransactions(customerId: string, limit: number = 20): Promise<PointsTransaction[]> {
    const response = await api.get(`/api/points/customer/${customerId}/transactions?limit=${limit}`);
    return response.data.transactions;
  }

  async awardPoints(customerId: string, points: number, description: string, adminNote?: string) {
    const response = await api.post('/api/points/award', {
      customer_id: customerId,
      points,
      description,
      admin_note: adminNote
    });
    return response.data;
  }

  // Shopify Integration
  async getShopifyStatus() {
    const response = await api.get('/api/shopify/status');
    return response.data;
  }

  async testShopifyConnection() {
    const response = await api.get('/api/shopify/test');
    return response.data;
  }

  async getRecentOrders(limit: number = 10): Promise<ShopifyOrder[]> {
    const response = await api.get(`/api/shopify/orders?limit=${limit}`);
    return response.data.orders;
  }

  async getShopifyCustomer(email: string) {
    const response = await api.get(`/api/shopify/customer/${email}`);
    return response.data;
  }

  // Webhook Management
  async getWebhooks() {
    const response = await api.get('/api/shopify/webhooks');
    return response.data;
  }

  async setupWebhooks() {
    const response = await api.post('/api/shopify/setup-webhooks');
    return response.data;
  }

  async cleanupWebhooks() {
    const response = await api.post('/api/shopify/cleanup-webhooks');
    return response.data;
  }
}

// Export singleton instance
export const apiService = new ApiService();
export default apiService;