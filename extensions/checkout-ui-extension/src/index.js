import {
  extension,
  Banner,
  Button,
  Divider,
  InlineLayout,
  BlockStack,
  Text,
  Select,
  useApi,
  useCustomer,
  useApplyDiscountCodeChange,
  useBuyerJourneyIntercept,
  useState,
  useEffect
} from '@shopify/ui-extensions/checkout';

// Configuration
const LOYALTY_CONFIG = {
  apiUrl: 'https://shopify-loyalty-app-1.onrender.com',
  conversionRate: 100, // 100 points = $1
  minRedemption: 100
};

export default extension('purchase.checkout.block.render', (root, api) => {
  const { i18n } = useApi();
  const customer = useCustomer();
  const applyDiscountCodeChange = useApplyDiscountCodeChange();

  // State management
  const [customerPoints, setCustomerPoints] = useState(null);
  const [selectedPoints, setSelectedPoints] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [isRedeemed, setIsRedeemed] = useState(false);

  // Load customer points when component mounts or customer changes
  useEffect(() => {
    if (customer?.email && !isRedeemed) {
      loadCustomerPoints(customer.email);
    }
  }, [customer?.email, isRedeemed]);

  // Main container
  const loyaltyContainer = root.createComponent(
    BlockStack,
    {
      border: 'base',
      cornerRadius: 'base',
      padding: 'base',
      spacing: 'base'
    }
  );

  // Load customer points function
  async function loadCustomerPoints(email) {
    try {
      setIsLoading(true);
      const response = await fetch(
        `${LOYALTY_CONFIG.apiUrl}/api/points/customer/email/${encodeURIComponent(email)}/redemption-options`
      );

      if (response.ok) {
        const data = await response.json();
        setCustomerPoints(data);
        console.log('[LOYALTY] Customer points loaded:', data);
      } else {
        console.log('[LOYALTY] Customer not found in loyalty system');
        setCustomerPoints(null);
      }
    } catch (error) {
      console.error('[LOYALTY] Error loading customer points:', error);
      setCustomerPoints(null);
    } finally {
      setIsLoading(false);
    }
  }

  // Apply points discount function
  async function applyPointsDiscount() {
    const pointsToRedeem = parseInt(selectedPoints);
    
    if (pointsToRedeem < LOYALTY_CONFIG.minRedemption || !customerPoints) {
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // Step 1: Create discount code
      console.log('[LOYALTY] Creating discount code for', pointsToRedeem, 'points');
      
      const discountResponse = await fetch(
        `${LOYALTY_CONFIG.apiUrl}/api/shopify/create-flexible-discount-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: pointsToRedeem,
            discount_amount: Math.floor(pointsToRedeem / LOYALTY_CONFIG.conversionRate),
            email: customer.email
          })
        }
      );

      const discountData = await discountResponse.json();

      if (!discountData.success) {
        throw new Error(discountData.message || 'Failed to create discount code');
      }

      console.log('[LOYALTY] Discount code created:', discountData.discount_code);

      // Step 2: Apply discount code to checkout
      const applyResult = await applyDiscountCodeChange({
        type: 'addDiscountCode',
        code: discountData.discount_code
      });

      if (applyResult.type === 'error') {
        throw new Error('Failed to apply discount code to checkout');
      }

      console.log('[LOYALTY] Discount code applied to checkout');

      // Step 3: Redeem points in our system
      const redeemResponse = await fetch(
        `${LOYALTY_CONFIG.apiUrl}/api/points/redeem-by-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: customer.email,
            points: pointsToRedeem,
            description: `Checkout redemption - ${discountData.discount_code}`
          })
        }
      );

      const redeemData = await redeemResponse.json();

      if (!redeemData.success) {
        console.warn('[LOYALTY] Points redemption failed but discount was applied');
      }

      console.log('[LOYALTY] Points redeemed successfully');

      // Show success message
      setMessage({
        type: 'success',
        text: `Successfully redeemed ${pointsToRedeem} points for $${discountData.discount_amount.toFixed(2)} discount!`
      });

      setIsRedeemed(true);

      // Hide the component after a delay
      setTimeout(() => {
        if (root.children.includes(loyaltyContainer)) {
          root.removeChild(loyaltyContainer);
        }
      }, 5000);

    } catch (error) {
      console.error('[LOYALTY] Error applying points discount:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Failed to apply points discount. Please try again.'
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Don't render if no customer or already redeemed
  if (!customer || isRedeemed) {
    return;
  }

  // Loading state
  if (isLoading && !customerPoints) {
    loyaltyContainer.replaceChildren(
      loyaltyContainer.createComponent(
        BlockStack,
        { spacing: 'tight', inlineAlignment: 'center' },
        [
          loyaltyContainer.createComponent(
            Text,
            { size: 'medium', emphasis: 'strong' },
            '⭐ Loyalty Points'
          ),
          loyaltyContainer.createComponent(
            Text,
            { size: 'small', appearance: 'subdued' },
            'Loading your points...'
          )
        ]
      )
    );
    root.appendChild(loyaltyContainer);
    return;
  }

  // No points available
  if (!customerPoints || !customerPoints.redemption.available) {
    if (customerPoints && customerPoints.redemption.balance > 0) {
      // Has points but not enough to redeem
      loyaltyContainer.replaceChildren(
        loyaltyContainer.createComponent(
          Banner,
          { status: 'info' },
          `You have ${customerPoints.redemption.balance} loyalty points. You need at least 100 points to redeem for discounts.`
        )
      );
      root.appendChild(loyaltyContainer);
    }
    return;
  }

  // Main UI components
  const headerText = loyaltyContainer.createComponent(
    Text,
    { size: 'medium', emphasis: 'strong' },
    '⭐ Use Your Loyalty Points'
  );

  const balanceText = loyaltyContainer.createComponent(
    Text,
    { size: 'small', appearance: 'subdued' },
    `Available: ${customerPoints.redemption.balance} points • 100 points = $1.00`
  );

  // Create redemption options for Select component
  const redemptionOptions = [
    { value: '0', label: 'Select amount...' },
    ...customerPoints.redemption.options.map(option => ({
      value: option.points.toString(),
      label: `${option.points} points = $${option.discount.toFixed(2)} off`
    }))
  ];

  const selectComponent = loyaltyContainer.createComponent(
    Select,
    {
      label: 'Points to redeem',
      options: redemptionOptions,
      value: selectedPoints,
      onChange: (value) => {
        setSelectedPoints(value);
        setMessage(null); // Clear any previous messages
      }
    }
  );

  // Apply button
  const isValidSelection = parseInt(selectedPoints) >= LOYALTY_CONFIG.minRedemption;
  const discount = isValidSelection ? Math.floor(parseInt(selectedPoints) / LOYALTY_CONFIG.conversionRate) : 0;
  
  const applyButton = loyaltyContainer.createComponent(
    Button,
    {
      kind: isValidSelection ? 'primary' : 'secondary',
      disabled: !isValidSelection || isLoading,
      loading: isLoading,
      onPress: applyPointsDiscount
    },
    isValidSelection 
      ? `Apply ${selectedPoints} Points ($${discount}.00 off)`
      : 'Select points to redeem'
  );

  // Message component (if there's a message to show)
  let messageComponent = null;
  if (message) {
    messageComponent = loyaltyContainer.createComponent(
      Banner,
      { status: message.type === 'success' ? 'success' : 'critical' },
      message.text
    );
  }

  // Assemble the component
  const components = [
    headerText,
    balanceText,
    selectComponent,
    applyButton
  ];

  if (messageComponent) {
    components.push(messageComponent);
  }

  loyaltyContainer.replaceChildren(
    loyaltyContainer.createComponent(
      BlockStack,
      { spacing: 'base' },
      components
    )
  );

  // Add to root if not already added
  if (!root.children.includes(loyaltyContainer)) {
    root.appendChild(loyaltyContainer);
  }
});

// Optional: Add a second extension for order status page
export const orderStatusExtension = extension('customer-account.order-status.block.render', (root, api) => {
  const { i18n } = useApi();
  
  // You can add a summary of points earned from this order here
  const container = root.createComponent(
    BlockStack,
    {
      border: 'base',
      cornerRadius: 'base',
      padding: 'base'
    }
  );

  const thankYouText = container.createComponent(
    Text,
    { size: 'medium', emphasis: 'strong' },
    '🎉 Thank you for your purchase!'
  );

  const pointsText = container.createComponent(
    Text,
    { size: 'small' },
    'You earned loyalty points with this order. Check your account for your updated balance.'
  );

  container.appendChild(
    container.createComponent(
      BlockStack,
      { spacing: 'tight' },
      [thankYouText, pointsText]
    )
  );

  root.appendChild(container);
});