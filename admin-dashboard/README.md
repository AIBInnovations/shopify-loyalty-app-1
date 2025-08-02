# Shopify Loyalty Program Admin Dashboard

A React-based admin interface for managing the Shopify loyalty program with points system and customer insights.

## 🚀 Features

### Dashboard
- **System Status** - Monitor database and Shopify connections
- **Key Metrics** - Total customers, points issued, outstanding balance
- **Recent Activity** - Latest orders and point transactions
- **Tier Distribution** - Customer tier breakdown

### Analytics
- **Visual Charts** - Bar charts for tier distribution, pie charts for points overview
- **Leaderboard** - Top customers by points balance
- **Program Insights** - Redemption rates and performance metrics

### Customer Management
- **Customer Lookup** - Search by email or customer ID
- **Point History** - Complete transaction history for each customer
- **Customer Details** - Balance, tier, and account information

### Points Manager
- **Manual Point Awards** - Add or deduct points with custom descriptions
- **Bulk Operations** - Process multiple customer adjustments
- **Admin Notes** - Internal tracking for point adjustments

### Configuration
- **Points System Settings** - Configure static or value-based points
- **Tier Management** - Set threshold requirements for each tier
- **Welcome Bonuses** - Configure new customer rewards
- **System Preferences** - Adjust program behavior

## 🛠️ Tech Stack

- **React 18** with TypeScript
- **Shopify Polaris** for UI components
- **React Router** for navigation
- **Recharts** for data visualization
- **Axios** for API communication

## 📦 Installation

```bash
# Navigate to admin dashboard directory
cd admin-dashboard

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start development server
npm start
```

## 🔧 Environment Variables

Create `.env` file in the admin-dashboard directory:

```bash
REACT_APP_API_URL=https://shopify-loyalty-app-1.onrender.com
```

## 🚀 Development

```bash
# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test
```

## 📱 Pages & Components

### Main Pages
- **Dashboard** (`/`) - Overview and system status
- **Analytics** (`/analytics`) - Charts and insights
- **Customer Lookup** (`/customers`) - Search and view customers
- **Points Manager** (`/points`) - Manual point management
- **Configuration** (`/settings`) - System settings

### Key Components
- **Dashboard.tsx** - Main dashboard with metrics and activity
- **CustomerLookup.tsx** - Customer search and details
- **PointsManager.tsx** - Manual points award/deduct interface
- **Analytics.tsx** - Charts and program insights
- **Configuration.tsx** - Settings management

### Services
- **api.ts** - Centralized API service with TypeScript types
- Handles all communication with the backend API
- Includes error handling and request/response logging

## 🎨 UI/UX Features

- **Responsive Design** - Works on desktop and tablet
- **Shopify Polaris** - Native Shopify look and feel
- **Real-time Data** - Live updates from the loyalty system
- **Error Handling** - Graceful error states and messages
- **Loading States** - Smooth loading indicators
- **Toast Notifications** - Success/error feedback

## 🔍 API Integration

The dashboard connects to your backend API at:
```
https://shopify-loyalty-app-1.onrender.com
```

### Key Endpoints Used:
- `GET /health` - System health check
- `GET /api/points/analytics` - Program analytics
- `GET /api/points/config` - Configuration settings
- `GET /api/points/customer/:id` - Customer details
- `POST /api/points/award` - Manual point awards
- `GET /api/shopify/orders` - Recent orders

## 📊 Charts & Visualizations

- **Tier Distribution** - Bar chart showing customer tiers
- **Points Overview** - Pie chart of issued/redeemed/outstanding points
- **Leaderboard** - Top customers by points balance
- **Activity Timeline** - Recent point transactions

## 🔒 Security

- Environment-based API configuration
- Error boundary handling
- Input validation on forms
- Secure API communication

## 🚀 Deployment

### Build for Production
```bash
npm run build
```

### Deploy to Netlify/Vercel
1. Build the project
2. Deploy the `build` folder
3. Set environment variables in deployment platform
4. Configure redirects for SPA routing

### Environment Variables for Production
```bash
REACT_APP_API_URL=https://shopify-loyalty-app-1.onrender.com
```

## 📈 Performance

- **Code Splitting** - Automatic route-based code splitting
- **Lazy Loading** - Components loaded on demand
- **Memoization** - Optimized re-renders with React hooks
- **Chart Optimization** - Efficient data visualization

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run tests in watch mode
npm test -- --watch
```

## 📝 Contributing

1. Follow TypeScript best practices
2. Use Shopify Polaris components consistently
3. Add proper error handling for all API calls
4. Include loading states for async operations
5. Write descriptive commit messages

## 🔗 Links

- [Shopify Polaris Documentation](https://polaris.shopify.com/)
- [React Router Documentation](https://reactrouter.com/)
- [Recharts Documentation](https://recharts.org/)
- [Backend API Documentation](../README.md)