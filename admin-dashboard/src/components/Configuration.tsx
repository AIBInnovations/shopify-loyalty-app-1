import React, { useState, useEffect } from 'react';
import {
  Page,
  Layout,
  Card,
  Form,
  FormLayout,
  TextField,
  Button,
  Banner,
  Text,
  InlineStack,
  BlockStack,
  Checkbox,
  Spinner,
  Toast,
  Frame,
  Divider
} from '@shopify/polaris';
import { apiService, StoreConfig } from '../services/api.ts';

const Configuration: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<StoreConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [toastActive, setToastActive] = useState(false);

  // Form state
  const [staticPointsPerOrder, setStaticPointsPerOrder] = useState('50');
  const [useStaticPoints, setUseStaticPoints] = useState(true);
  const [pointsPerDollar, setPointsPerDollar] = useState('1');
  const [minimumOrderAmount, setMinimumOrderAmount] = useState('0');
  const [welcomeBonus, setWelcomeBonus] = useState('100');
  const [pointsExpiryDays, setPointsExpiryDays] = useState('365');

  // Tier settings
  const [bronzeThreshold, setBronzeThreshold] = useState('0');
  const [silverThreshold, setSilverThreshold] = useState('500');
  const [goldThreshold, setGoldThreshold] = useState('1500');
  const [platinumThreshold, setPlatinumThreshold] = useState('5000');

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      setLoading(true);
      setError(null);

      const configData = await apiService.getPointsConfig();
      setConfig(configData);

      // Populate form fields
      const { points_settings, tier_settings } = configData;
      
      setStaticPointsPerOrder(points_settings.static_points_per_order?.toString() || '50');
      setUseStaticPoints(points_settings.use_static_points ?? true);
      setPointsPerDollar(points_settings.points_per_dollar?.toString() || '1');
      setMinimumOrderAmount(points_settings.minimum_order_amount?.toString() || '0');
      setWelcomeBonus(points_settings.welcome_bonus?.toString() || '100');
      setPointsExpiryDays(points_settings.points_expiry_days?.toString() || '365');

      setBronzeThreshold(tier_settings.bronze_threshold?.toString() || '0');
      setSilverThreshold(tier_settings.silver_threshold?.toString() || '500');
      setGoldThreshold(tier_settings.gold_threshold?.toString() || '1500');
      setPlatinumThreshold(tier_settings.platinum_threshold?.toString() || '5000');
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const updatedConfig = {
        points_settings: {
          static_points_per_order: parseInt(staticPointsPerOrder) || 50,
          use_static_points: useStaticPoints,
          points_per_dollar: parseInt(pointsPerDollar) || 1,
          minimum_order_amount: parseInt(minimumOrderAmount) || 0,
          welcome_bonus: parseInt(welcomeBonus) || 100,
          points_expiry_days: parseInt(pointsExpiryDays) || 365
        },
        tier_settings: {
          bronze_threshold: parseInt(bronzeThreshold) || 0,
          silver_threshold: parseInt(silverThreshold) || 500,
          gold_threshold: parseInt(goldThreshold) || 1500,
          platinum_threshold: parseInt(platinumThreshold) || 5000
        }
      };

      await apiService.updatePointsConfig(updatedConfig);
      
      setSuccess('Configuration saved successfully!');
      setToastActive(true);
      
      // Reload configuration to get latest data
      await loadConfiguration();
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const toastMarkup = toastActive ? (
    <Toast
      content={success || ''}
      onDismiss={() => setToastActive(false)}
    />
  ) : null;

  if (loading) {
    return (
      <Page title="Configuration">
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <Spinner size="large" />
                <Text variant="bodyMd" as="p" tone="subdued">
                  Loading configuration...
                </Text>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Frame>
      {toastMarkup}
      <Page 
        title="Loyalty Program Configuration"
        subtitle="Manage points system settings and customer tiers"
        primaryAction={{
          content: 'Save Changes',
          onAction: handleSave,
          loading: saving
        }}
      >
        <Layout>
          {error && (
            <Layout.Section>
              <Banner tone="critical" title="Configuration Error">
                <p>{error}</p>
              </Banner>
            </Layout.Section>
          )}

          {/* Points System Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Points System Settings</Text>
                <Form onSubmit={handleSave}>
                  <FormLayout>
                    <Checkbox
                      label="Use Static Points System"
                      checked={useStaticPoints}
                      onChange={setUseStaticPoints}
                      helpText="Award a fixed number of points per order regardless of order value"
                    />

                    {useStaticPoints ? (
                      <TextField
                        label="Points Per Order"
                        value={staticPointsPerOrder}
                        onChange={setStaticPointsPerOrder}
                        type="number"
                        min="0"
                        helpText="Fixed number of points awarded for each order (currently: 50 points per order)"
                        suffix="points"
                        autoComplete="off"
                      />
                    ) : (
                      <InlineStack gap="400">
                        <TextField
                          label="Points Per Dollar"
                          value={pointsPerDollar}
                          onChange={setPointsPerDollar}
                          type="number"
                          min="0"
                          step={0.1}
                          helpText="Points earned per dollar spent"
                          suffix="points per $1"
                          autoComplete="off"
                        />
                        <TextField
                          label="Minimum Order Amount"
                          value={minimumOrderAmount}
                          onChange={setMinimumOrderAmount}
                          type="number"
                          min="0"
                          step={0.01}
                          helpText="Minimum order value to earn points"
                          prefix="$"
                          autoComplete="off"
                        />
                      </InlineStack>
                    )}

                    <InlineStack gap="400">
                      <TextField
                        label="Welcome Bonus"
                        value={welcomeBonus}
                        onChange={setWelcomeBonus}
                        type="number"
                        min="0"
                        helpText="Points awarded to new customers"
                        suffix="points"
                        autoComplete="off"
                      />
                      <TextField
                        label="Points Expiry"
                        value={pointsExpiryDays}
                        onChange={setPointsExpiryDays}
                        type="number"
                        min="0"
                        helpText="Days until points expire (0 = no expiry)"
                        suffix="days"
                        autoComplete="off"
                      />
                    </InlineStack>
                  </FormLayout>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Customer Tier Settings */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Customer Tier Thresholds</Text>
                <Form onSubmit={handleSave}>
                  <FormLayout>
                    <Text variant="bodyMd" as="p" tone="subdued">
                      Set the minimum points required for each customer tier. Customers automatically move between tiers based on their total earned points.
                    </Text>
                    
                    <InlineStack gap="400">
                      <TextField
                        label="Bronze Tier"
                        value={bronzeThreshold}
                        onChange={setBronzeThreshold}
                        type="number"
                        min="0"
                        helpText="Starting tier for all customers"
                        suffix="points"
                        disabled
                        autoComplete="off"
                      />
                      <TextField
                        label="Silver Tier"
                        value={silverThreshold}
                        onChange={setSilverThreshold}
                        type="number"
                        min="0"
                        helpText="Points needed for Silver tier"
                        suffix="points"
                        autoComplete="off"
                      />
                    </InlineStack>

                    <InlineStack gap="400">
                      <TextField
                        label="Gold Tier"
                        value={goldThreshold}
                        onChange={setGoldThreshold}
                        type="number"
                        min="0"
                        helpText="Points needed for Gold tier"
                        suffix="points"
                        autoComplete="off"
                      />
                      <TextField
                        label="Platinum Tier"
                        value={platinumThreshold}
                        onChange={setPlatinumThreshold}
                        type="number"
                        min="0"
                        helpText="Points needed for Platinum tier"
                        suffix="points"
                        autoComplete="off"
                      />
                    </InlineStack>
                  </FormLayout>
                </Form>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Current Configuration Summary */}
          {config && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Current Configuration Summary</Text>
                  <BlockStack gap="300">
                    <BlockStack gap="200">
                      <Text variant="headingMd" as="h3">Points System</Text>
                      <Text variant="bodyMd" as="p">
                        <strong>Method:</strong> {useStaticPoints ? 'Static Points' : 'Value-based Points'}
                      </Text>
                      {useStaticPoints ? (
                        <Text variant="bodyMd" as="p">
                          <strong>Points per Order:</strong> {staticPointsPerOrder} points (regardless of order value)
                        </Text>
                      ) : (
                        <>
                          <Text variant="bodyMd" as="p">
                            <strong>Points per Dollar:</strong> {pointsPerDollar} points per $1 spent
                          </Text>
                          <Text variant="bodyMd" as="p">
                            <strong>Minimum Order:</strong> ${minimumOrderAmount}
                          </Text>
                        </>
                      )}
                      <Text variant="bodyMd" as="p">
                        <strong>Welcome Bonus:</strong> {welcomeBonus} points
                      </Text>
                    </BlockStack>

                    <Divider />

                    <BlockStack gap="200">
                      <Text variant="headingMd" as="h3">Customer Tiers</Text>
                      <InlineStack gap="400">
                        <Text variant="bodyMd" as="p">Bronze: {bronzeThreshold}+ points</Text>
                        <Text variant="bodyMd" as="p">Silver: {silverThreshold}+ points</Text>
                        <Text variant="bodyMd" as="p">Gold: {goldThreshold}+ points</Text>
                        <Text variant="bodyMd" as="p">Platinum: {platinumThreshold}+ points</Text>
                      </InlineStack>
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            </Layout.Section>
          )}

          {/* System Information */}
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">System Information</Text>
                <Text variant="bodyMd" as="p">
                  <strong>Store Domain:</strong> {config?.store_domain || 'Unknown'}
                </Text>
                <Text variant="bodyMd" as="p" tone="subdued">
                  Changes to the configuration will take effect immediately for new orders. Existing customer points and tiers will be recalculated automatically.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
};

export default Configuration;