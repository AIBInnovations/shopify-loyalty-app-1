import React, { useState } from 'react';
import {
  Page,
  Layout,
  Card,
  Form,
  FormLayout,
  TextField,
  Button,
  Select,
  InlineStack,
  BlockStack,
  Banner,
  Text,
  Badge,
  Toast,
  Frame
} from '@shopify/polaris';
import { apiService, CustomerPoints } from '../services/api.ts';

const PointsManager: React.FC = () => {
  const [customerId, setCustomerId] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [points, setPoints] = useState('');
  const [description, setDescription] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [operation, setOperation] = useState('add');
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [customer, setCustomer] = useState<CustomerPoints | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toastActive, setToastActive] = useState(false);

  const operationOptions = [
    { label: 'Add Points', value: 'add' },
    { label: 'Deduct Points', value: 'deduct' }
  ];

  const handleSearchCustomer = async () => {
    if (!searchEmail) {
      setError('Please enter a customer email');
      return;
    }

    try {
      setSearchLoading(true);
      setError(null);
      setCustomer(null);

      const customerData = await apiService.getCustomerByEmail(searchEmail);
      setCustomer(customerData);
      setCustomerId(customerData.customer_id);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('Customer not found');
      } else {
        setError(err.message || 'Failed to search customer');
      }
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!customerId || !points || !description) {
      setError('Please fill in all required fields');
      return;
    }

    const pointsValue = parseInt(points);
    if (isNaN(pointsValue) || pointsValue <= 0) {
      setError('Points must be a positive number');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const finalPoints = operation === 'deduct' ? -pointsValue : pointsValue;
      const finalDescription = operation === 'deduct' 
        ? `Manual deduction: ${description}` 
        : `Manual award: ${description}`;

      const result = await apiService.awardPoints(
        customerId,
        finalPoints,
        finalDescription,
        adminNote || undefined
      );

      setSuccess(`Successfully ${operation === 'add' ? 'awarded' : 'deducted'} ${pointsValue} points!`);
      setToastActive(true);

      // Update customer data
      if (customer) {
        const updatedCustomer = await apiService.getCustomerPoints(customerId);
        setCustomer(updatedCustomer);
      }

      // Clear form
      setPoints('');
      setDescription('');
      setAdminNote('');
    } catch (err: any) {
      setError(err.message || 'Failed to update points');
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
      day: 'numeric'
    });
  };

  const toastMarkup = toastActive ? (
    <Toast
      content={success || ''}
      onDismiss={() => setToastActive(false)}
    />
  ) : null;

  return (
    <Frame>
      {toastMarkup}
      <Page 
        title="Points Manager"
        subtitle="Manually award or deduct points from customer accounts"
      >
        <Layout>
          {/* Customer Search */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Find Customer</Text>
                <Form onSubmit={handleSearchCustomer}>
                  <FormLayout>
                    <InlineStack gap="400" align="end">
                      <TextField
                        label="Customer Email"
                        value={searchEmail}
                        onChange={setSearchEmail}
                        placeholder="customer@example.com"
                        type="email"
                        autoComplete="email"
                      />
                      <Button 
                        variant="primary"
                        onClick={handleSearchCustomer}
                        loading={searchLoading}
                        disabled={!searchEmail}
                      >
                        Search Customer
                      </Button>
                    </InlineStack>
                  </FormLayout>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Error Banner */}
          {error && (
            <Layout.Section>
              <Banner tone="critical" title="Error">
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
                    <Layout.Section variant="oneHalf">
                      <BlockStack gap="200">
                        <Text variant="headingLg" as="h3">
                          {customer.first_name} {customer.last_name}
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          {customer.email}
                        </Text>
                        <Text variant="bodyMd" as="p" tone="subdued">
                          ID: {customer.customer_id} • Member since {formatDate(customer.created_at)}
                        </Text>
                      </BlockStack>
                    </Layout.Section>

                    <Layout.Section variant="oneHalf">
                      <InlineStack gap="400" align="center">
                        <BlockStack gap="100">
                          <Text variant="headingLg" as="h3">{customer.current_balance.toLocaleString()}</Text>
                          <Text variant="bodyMd" as="p" tone="subdued">Current Balance</Text>
                        </BlockStack>
                        <Badge tone={getTierBadgeStatus(customer.tier)}>
                          {customer.tier.toUpperCase()}
                        </Badge>
                      </InlineStack>
                    </Layout.Section>
                  </Layout>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Points Management Form */}
          {customer && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Manage Points</Text>
                  <Form onSubmit={handleSubmit}>
                    <FormLayout>
                      <Select
                        label="Operation"
                        options={operationOptions}
                        value={operation}
                        onChange={setOperation}
                      />

                      <TextField
                        label="Points Amount"
                        value={points}
                        onChange={setPoints}
                        type="number"
                        min="1"
                        placeholder="Enter number of points"
                        helpText={`This will ${operation === 'add' ? 'add to' : 'subtract from'} the customer's current balance`}
                        autoComplete="off"
                      />

                      <TextField
                        label="Description"
                        value={description}
                        onChange={setDescription}
                        placeholder="Reason for points adjustment"
                        helpText="This will be visible to the customer in their transaction history"
                        autoComplete="off"
                      />

                      <TextField
                        label="Admin Note (Optional)"
                        value={adminNote}
                        onChange={setAdminNote}
                        placeholder="Internal note for admin reference"
                        helpText="This note is for internal use only and won't be visible to the customer"
                        multiline={2}
                        autoComplete="off"
                      />

                      <InlineStack align="end">
                        <Button
                          variant="primary"
                          onClick={handleSubmit}
                          loading={loading}
                          disabled={!points || !description}
                        >
                          {operation === 'add' ? 'Award Points' : 'Deduct Points'}
                        </Button>
                      </InlineStack>
                    </FormLayout>
                  </Form>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* Preview */}
          {customer && points && description && (
            <Layout.Section>
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Preview</Text>
                  <Text variant="bodyMd" as="p">
                    <strong>Customer:</strong> {customer.first_name} {customer.last_name} ({customer.email})
                  </Text>
                  <Text variant="bodyMd" as="p">
                    <strong>Current Balance:</strong> {customer.current_balance.toLocaleString()} points
                  </Text>
                  <Text variant="bodyMd" as="p">
                    <strong>Operation:</strong> {operation === 'add' ? 'Add' : 'Deduct'} {points} points
                  </Text>
                  <Text variant="bodyMd" as="p">
                    <strong>New Balance:</strong> {' '}
                    <Text 
                      variant="bodyMd" 
                      as="span" 
                      tone={operation === 'add' ? 'success' : 'critical'}
                      fontWeight="bold"
                    >
                      {(customer.current_balance + (operation === 'add' ? parseInt(points) : -parseInt(points))).toLocaleString()} points
                    </Text>
                  </Text>
                  <Text variant="bodyMd" as="p">
                    <strong>Description:</strong> {operation === 'add' ? 'Manual award' : 'Manual deduction'}: {description}
                  </Text>
                  {adminNote && (
                    <Text variant="bodyMd" as="p" tone="subdued">
                      <strong>Admin Note:</strong> {adminNote}
                    </Text>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>
      </Page>
    </Frame>
  );
};

export default PointsManager;