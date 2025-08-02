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
  BlockStack,
  Button
} from '@shopify/polaris';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { apiService, Analytics } from '../services/api.ts';

interface LeaderboardCustomer {
  rank: number;
  customer_id: string;
  name: string;
  email: string;
  current_balance: number;
  tier: string;
  total_earned: number;
}

const AnalyticsComponent: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardCustomer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [analyticsResponse, leaderboardResponse] = await Promise.all([
        apiService.getAnalytics(),
        apiService.getLeaderboard(10)
      ]);

      setAnalytics(analyticsResponse);
      setLeaderboard(leaderboardResponse);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const getTierBadgeStatus = (tier: string) => {
    switch (tier) {
      case 'platinum': return 'success';
      case 'gold': return 'warning';
      case 'silver': return 'info';
      default: return 'new';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Chart data preparation
  const tierChartData = analytics ? Object.entries(analytics.tier_distribution).map(([tier, count]) => ({
    tier: tier.charAt(0).toUpperCase() + tier.slice(1),
    customers: count
  })) : [];

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c'];

  const pointsData = analytics ? [
    { name: 'Issued', value: analytics.total_points_issued, color: '#82ca9d' },
    { name: 'Redeemed', value: analytics.total_points_redeemed, color: '#ff7c7c' },
    { name: 'Outstanding', value: analytics.points_outstanding, color: '#8884d8' }
  ] : [];

  if (loading) {
    return (
      <Page title="Analytics">
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <Spinner size="large" />
                <Text variant="bodyMd" as="p" tone="subdued">
                  Loading analytics...
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
      title="Analytics & Insights"
      subtitle="Monitor loyalty program performance and customer engagement"
      primaryAction={{
        content: 'Refresh Data',
        onAction: loadAnalyticsData,
        loading: loading
      }}
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Error loading analytics">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Key Metrics */}
        {analytics && (
          <Layout.Section>
            <Layout>
              <Layout.Section variant="oneHalf">
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="heading2xl" as="h3">{analytics.total_customers.toLocaleString()}</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">Total Customers</Text>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="heading2xl" as="h3">{analytics.total_points_issued.toLocaleString()}</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">Points Issued</Text>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </Layout.Section>
              
              <Layout.Section variant="oneHalf">
                <Layout>
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="heading2xl" as="h3">{analytics.total_points_redeemed.toLocaleString()}</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">Points Redeemed</Text>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                  
                  <Layout.Section variant="oneHalf">
                    <Card>
                      <BlockStack gap="200">
                        <Text variant="heading2xl" as="h3">{analytics.points_outstanding.toLocaleString()}</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">Points Outstanding</Text>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </Layout.Section>
            </Layout>
          </Layout.Section>
        )}

        {/* Charts Section */}
        {analytics && (
          <Layout.Section>
            <Layout>
              {/* Tier Distribution Chart */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Customer Tier Distribution</Text>
                    {tierChartData.length > 0 ? (
                      <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                          <BarChart data={tierChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="tier" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="customers" fill="#8884d8" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
                        No tier data available
                      </Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>

              {/* Points Overview Pie Chart */}
              <Layout.Section variant="oneHalf">
                <Card>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h2">Points Overview</Text>
                    {pointsData.length > 0 ? (
                      <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              data={pointsData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              outerRadius={80}
                              fill="#8884d8"
                              dataKey="value"
                            >
                              {pointsData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [value.toLocaleString(), 'Points']} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
                        No points data available
                      </Text>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </Layout.Section>
        )}

        {/* Leaderboard and Recent Activity */}
        <Layout.Section>
          <Layout>
            {/* Top Customers Leaderboard */}
            <Layout.Section variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Top Customers</Text>
                  {leaderboard.length === 0 ? (
                    <Text variant="bodyMd" as="p" tone="subdued">
                      No customers found
                    </Text>
                  ) : (
                    <ResourceList
                      resourceName={{ singular: 'customer', plural: 'customers' }}
                      items={leaderboard}
                      renderItem={(customer) => {
                        const { rank, name, email, current_balance, tier, total_earned } = customer;
                        
                        return (
                          <ResourceItem
                            id={customer.customer_id}
                            onClick={() => {}}
                          >
                            <InlineStack align="space-between">
                              <InlineStack gap="400" align="center">
                                <Text variant="headingMd" as="h3" tone="subdued">
                                  #{rank}
                                </Text>
                                <BlockStack gap="100">
                                  <Text variant="bodyMd" fontWeight="bold" as="h3">
                                    {name || 'Unknown'}
                                  </Text>
                                  <Text variant="bodyMd" as="p" tone="subdued">
                                    {email}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                              <InlineStack gap="200" align="center">
                                <BlockStack gap="100">
                                  <Text variant="bodyMd" fontWeight="bold" as="p">
                                    {current_balance.toLocaleString()} pts
                                  </Text>
                                  <Text variant="bodyMd" as="p" tone="subdued">
                                    {total_earned.toLocaleString()} earned
                                  </Text>
                                </BlockStack>
                                <Badge tone={getTierBadgeStatus(tier)}>
                                  {tier}
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
                  <Text variant="headingMd" as="h2">Recent Activity</Text>
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
        </Layout.Section>

        {/* Summary Stats */}
        {analytics && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Program Summary</Text>
                <InlineStack gap="600">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" tone="subdued">Redemption Rate</Text>
                    <Text variant="headingLg" as="h3">
                      {analytics.total_points_issued > 0 
                        ? ((analytics.total_points_redeemed / analytics.total_points_issued) * 100).toFixed(1)
                        : '0'
                      }%
                    </Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" tone="subdued">Avg Points per Customer</Text>
                    <Text variant="headingLg" as="h3">
                      {analytics.total_customers > 0 
                        ? Math.round(analytics.points_outstanding / analytics.total_customers).toLocaleString()
                        : '0'
                      }
                    </Text>
                  </BlockStack>
                  
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p" tone="subdued">Active Tiers</Text>
                    <Text variant="headingLg" as="h3">
                      {Object.keys(analytics.tier_distribution).length}
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
};

export default AnalyticsComponent;