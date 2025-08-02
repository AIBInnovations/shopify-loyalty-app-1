import React, { useState } from 'react';
import {
  Page,
  Layout,
  Card,
  Form,
  FormLayout,
  TextField,
  Button,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  Divider,
  ResourceList,
  ResourceItem,
  Banner
} from '@shopify/polaris';
import { apiService, CustomerPoints, PointsTransaction } from '../services/api.ts';

const CustomerLookup: React.FC = () => {
  const [searchEmail, setSearchEmail] = useState('');
  const [searchCustomerId, setSearchCustomerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [customer, setCustomer] = useState<CustomerPoints | null>(null);
  const [transactions, setTransactions] = useState<PointsTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchMethod, setSearchMethod] = useState<'email' | 'id'>('email');

  const handleSearch = async () => {
    if (!searchEmail && !searchCustomerId) {
      setError('Please enter an email or customer ID');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setCustomer(null);
      setTransactions([]);

      let customerData: CustomerPoints;

      if (searchMethod === 'email' && searchEmail) {
        customerData = await apiService.getCustomerByEmail(searchEmail);
      } else if (searchMethod === 'id' && searchCustomerId) {
        customerData = await apiService.getCustomerPoints(searchCustomerId);
      } else {
        throw new Error('Invalid search parameters');
      }

      setCustomer(customerData);

      // Load transactions if customer exists
      if (customerData.customer_id) {
        const transactionData = await apiService.getCustomerTransactions(customerData.customer_id, 20);
        setTransactions(transactionData);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('Customer not found');
      } else {
        setError(err.message || 'Failed to search customer');
      }
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
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Page 
      title="Customer Lookup"
      subtitle="Search and view customer loyalty points and transaction history"
    >
      <Layout>
        {/* Search Form */}
        <Layout.Section>
          <Card>
            <Form onSubmit={handleSearch}>
              <FormLayout>
                <InlineStack gap="400" align="end">
                  <BlockStack gap="200">
                    <Button
                      variant={searchMethod === 'email' ? 'primary' : 'secondary'}
                      onClick={() => setSearchMethod('email')}
                    >
                      Search by Email
                    </Button>
                    <Button
                      variant={searchMethod === 'id' ? 'primary' : 'secondary'}
                      onClick={() => setSearchMethod('id')}
                    >
                      Search by Customer ID
                    </Button>
                  </BlockStack>
                  
                  {searchMethod === 'email' ? (
                    <TextField
                      label="Customer Email"
                      value={searchEmail}
                      onChange={(value) => setSearchEmail(value)}
                      placeholder="customer@example.com"
                      type="email"
                      autoComplete="email"
                    />
                  ) : (
                    <TextField
                      label="Customer ID"
                      value={searchCustomerId}
                      onChange={(value) => setSearchCustomerId(value)}
                      placeholder="12345"
                      autoComplete="off"
                    />
                  )}
                  
                  <Button 
                    variant="primary"
                    onClick={handleSearch} 
                    loading={loading}
                    disabled={searchMethod === 'email' ? !searchEmail : !searchCustomerId}
                  >
                    Search
                  </Button>
                </InlineStack>
              </FormLayout>
            </Form>
          </Card>
        </Layout.Section>

        {/* Error Banner */}
        {error && (
          <Layout.Section>
            <Banner tone="critical" title="Search Error">
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Customer Information */}
        {customer && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Customer Information</Text>
                <Layout>
                  <Layout.Section variant="oneThird">
                    <BlockStack gap="300">
                      <Text variant="headingLg" as="h3">
                        {customer.first_name} {customer.last_name}
                      </Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        {customer.email}
                      </Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        Customer ID: {customer.customer_id}
                      </Text>
                      <Text variant="bodyMd" as="p" tone="subdued">
                        Member since: {formatDate(customer.created_at)}
                      </Text>
                    </BlockStack>
                  </Layout.Section>

                  <Layout.Section variant="oneThird">
                    <BlockStack gap="200">
                      <BlockStack gap="100">
                        <Text variant="headingLg" as="h3">{customer.current_balance.toLocaleString()}</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">Current Points Balance</Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text variant="headingLg" as="h3">{customer.total_earned.toLocaleString()}</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">Total Points Earned</Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text variant="headingLg" as="h3">{customer.total_redeemed.toLocaleString()}</Text>
                        <Text variant="bodyMd" as="p" tone="subdued">Total Points Redeemed</Text>
                      </BlockStack>
                    </BlockStack>
                  </Layout.Section>

                  <Layout.Section variant="oneThird">
                    <BlockStack gap="300" align="center">
                      <Badge tone={getTierBadgeStatus(customer.tier)} size="large">
                        {customer.tier.toUpperCase() + ' TIER'}
                      </Badge>
                      <Text variant="bodyMd" as="p">
                        Last updated: {formatDate(customer.updated_at)}
                      </Text>
                    </BlockStack>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Transaction History */}
        {customer && transactions.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Transaction History ({transactions.length} transactions)</Text>
                <ResourceList
                  resourceName={{ singular: 'transaction', plural: 'transactions' }}
                  items={transactions}
                  renderItem={(transaction) => {
                    const { id, transaction_type, points, description, order_total, created_at, metadata } = transaction;
                    
                    return (
                      <ResourceItem id={id} onClick={() => {}}>
                        <InlineStack align="space-between">
                          <BlockStack gap="100">
                            <Text variant="bodyMd" fontWeight="bold" as="h3">
                              {description}
                            </Text>
                            <Text variant="bodyMd" as="p" tone="subdued">
                              {formatDate(created_at)}
                              {order_total && ` • Order Total: ${order_total}`}
                              {metadata?.order_number && ` • Order #${metadata.order_number}`}
                            </Text>
                            {metadata?.admin_note && (
                              <Text variant="bodyMd" as="p" tone="subdued">
                                Note: {metadata.admin_note}
                              </Text>
                            )}
                          </BlockStack>
                          <InlineStack gap="200" align="center">
                            <Text 
                              variant="headingMd" 
                              as="h3"
                              tone={transaction_type === 'earned' ? 'success' : 'critical'}
                            >
                              {transaction_type === 'earned' ? '+' : '-'}{points}
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
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* No Transactions Message */}
        {customer && transactions.length === 0 && (
          <Layout.Section>
            <Card>
              <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
                No transaction history found for this customer.
              </Text>
            </Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
};

export default CustomerLookup;