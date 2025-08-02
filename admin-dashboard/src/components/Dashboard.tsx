import React, { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Badge,
  Spinner,
  Banner,
  InlineStack,
  BlockStack
} from '@shopify/polaris';
import { apiService, Analytics, ShopifyOrder } from '../services/api.ts';

interface DashboardStats {
  totalCustomers: number;
  totalPointsIssued: number;
  pointsOutstanding: number;
  recentOrders: number;
}

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [recentOrders, setRecentOrders] = useState<ShopifyOrder[]>([]);
  const [appStatus, setAppStatus] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load multiple data sources
      const [analyticsResponse, ordersResponse, statusResponse] = await Promise.all([
        apiService.getAnalytics().catch(err => {
          console.warn('Analytics failed:', err);
          return null;
        }),
        apiService.getRecentOrders(5).catch(err => {
          console.warn('Orders failed:', err);
          return [];
        }),
        apiService.getAppStatus().catch(err => {
          console.warn('Status failed:', err);
          return null;
        })
      ]);

      setAnalytics(analyticsResponse);
      setRecentOrders(ordersResponse);
      setAppStatus(statusResponse);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTierBadgeStatus = (tier: string) => {
    switch (tier) {
      case 'platinum': return 'success';
      case 'gold': return 'warning';
      case 'silver': return 'info';
      default: return 'new';
    }
  };

  if (loading) {
    return (
      <Page title="Dashboard">
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <Spinner size="large" />
                <Text variant="bodyMd" as="p" tone="subdued">
                  Loading dashboard...
                </Text>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page 
      title="Loyalty Program Dashboard"
      subtitle="Monitor your points system performance and customer activity"
      primaryAction={{
        content: 'Refresh Data',
        onAction: loadDashboardData,
        loading: loading
      }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Error loading dashboard">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* System Status */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">System Status</Text>
              <InlineStack gap="400">
                <Text variant="bodyMd" as="p">
                  Database: {' '}
                  <Badge tone={appStatus?.database_status === 'connected' ? 'success' : 'critical'}>
                    {appStatus?.database_status || 'Unknown'}
                  </Badge>
                </Text>
                <Text variant="bodyMd" as="p">
                  Shopify: {' '}
                  <Badge tone={appStatus?.shopify_status === 'configured' ? 'success' : 'warning'}>
                    {appStatus?.shopify_status || 'Unknown'}
                  </Badge>
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Stats Cards */}
        {analytics && (
          <Layout.Section>
            <Layout>
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text variant="heading2xl" as="h3">{analytics.total_customers.toLocaleString()}</Text>
                    <Text variant="bodyMd" as="p" tone="subdued">Total Customers</Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
              
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text variant="heading2xl" as="h3">{analytics.total_points_issued.toLocaleString()}</Text>
                    <Text variant="bodyMd" as="p" tone="subdued">Points Issued</Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
              
              <Layout.Section variant="oneThird">
                <Card>
                  <BlockStack gap="200">
                    <Text variant="heading2xl" as="h3">{analytics.points_outstanding.toLocaleString()}</Text>
                    <Text variant="bodyMd" as="p" tone="subdued">Points Outstanding</Text>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </Layout.Section>
        )}

        {/* Tier Distribution */}
        {analytics && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Customer Tier Distribution</Text>
                <InlineStack gap="400">
                  {Object.entries(analytics.tier_distribution).map(([tier, count]) => (
                    <BlockStack key={tier} gap="100">
                      <Text variant="headingMd" as="h3">
                        {count}
                      </Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        {tier.charAt(0).toUpperCase() + tier.slice(1)}
                      </Text>
                    </BlockStack>
                  ))}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout>
          {/* Recent Orders */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Recent Orders</Text>
                {recentOrders.length === 0 ? (
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No recent orders found
                  </Text>
                ) : (
                  <ResourceList
                    resourceName={{ singular: 'order', plural: 'orders' }}
                    items={recentOrders}
                    renderItem={(order) => {
                      const { id, order_number, total_price, customer, created_at, financial_status } = order;
                      
                      return (
                        <ResourceItem
                          id={id}
                          onClick={() => {}}
                        >
                          <InlineStack align="space-between">
                            <BlockStack gap="100">
                              <Text variant="bodyMd" fontWeight="bold" as="h3">
                                #{order_number}
                              </Text>
                              <Text variant="bodyMd" as="p" tone="subdued">
                                {customer?.email || 'Guest'} • {formatDate(created_at)}
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200" align="center">
                              <Text variant="bodyMd" as="p">
                                {formatCurrency(parseFloat(total_price))}
                              </Text>
                              <Badge tone={financial_status === 'paid' ? 'success' : 'warning'}>
                                {financial_status}
                              </Badge>
                            </InlineStack>
                          </InlineStack>
                        </ResourceItem>
                      );
                    }}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Recent Activity */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Recent Points Activity</Text>
                {analytics?.recent_activity?.length === 0 ? (
                  <Text variant="bodyMd" as="p" tone="subdued">
                    No recent activity
                  </Text>
                ) : (
                  <ResourceList
                    resourceName={{ singular: 'transaction', plural: 'transactions' }}
                    items={analytics?.recent_activity || []}
                    renderItem={(transaction) => {
                      const { customer_id, transaction_type, points, description, created_at } = transaction;
                      
                      return (
                        <ResourceItem
                          id={transaction.id}
                          onClick={() => {}}
                        >
                          <InlineStack align="space-between">
                            <BlockStack gap="100">
                              <Text variant="bodyMd" fontWeight="bold" as="h3">
                                {description}
                              </Text>
                              <Text variant="bodyMd" as="p" tone="subdued">
                                Customer {customer_id} • {formatDate(created_at)}
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200" align="center">
                              <Text 
                                variant="bodyMd" 
                                as="p" 
                                tone={transaction_type === 'earned' ? 'success' : 'critical'}
                                fontWeight="bold"
                              >
                                {transaction_type === 'earned' ? '+' : '-'}{points} pts
                              </Text>
                              <Badge tone={transaction_type === 'earned' ? 'success' : 'warning'}>
                                {transaction_type}
                              </Badge>
                            </InlineStack>
                          </InlineStack>
                        </ResourceItem>
                      );
                    }}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Layout>
    </Page>
  );
};

export default Dashboard;