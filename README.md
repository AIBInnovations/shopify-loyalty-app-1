# Shopify Loyalty App AIB-1

A comprehensive Shopify loyalty app with points system and spin wheel rewards.

## 🚀 Quick Start

### Local Development

1. Clone the repository
```bash
git clone <your-repo-url>
cd shopify-loyalty-app-aib-1
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start development server
```bash
npm run dev
```

5. Test the server
```bash
curl http://localhost:3000/health
```

### Deploy to Render

1. Connect your GitHub repository to Render
2. Set the following environment variables in Render:
   - `NODE_ENV=production`
   - `PORT=10000` (Render default)
3. Deploy!

## 📋 Development Phases

### ✅ Phase 1: Minimal Deploy (CURRENT)
- [x] Basic Express server
- [x] Health check endpoint
- [x] Ready for Render deployment

### 🔄 Phase 2: CI/CD Setup (NEXT)
- [ ] GitHub Actions
- [ ] Auto-deployment
- [ ] Error monitoring

### 📦 Phase 3: Shopify Connection
- [ ] OAuth endpoints
- [ ] Webhook handlers
- [ ] Development store testing

### 🗄️ Phase 4: Database & APIs
- [ ] MongoDB Atlas setup
- [ ] Points calculation
- [ ] Order processing

### 🎨 Phase 5: UI Development
- [ ] Admin dashboard
- [ ] Customer widget
- [ ] Spin wheel component

## 🔗 API Endpoints

### Health & Status
- `GET /` - Root endpoint with app info
- `GET /health` - Health check with system status
- `GET /api` - API status check

## 🛠️ Tech Stack

**Backend:**
- Node.js + Express.js
- MongoDB + Mongoose
- Shopify REST Admin API

**Frontend:**
- React + TypeScript
- Shopify Polaris (Admin)
- Tailwind CSS (Customer)

**Infrastructure:**
- Render (hosting)
- MongoDB Atlas (database)
- GitHub Actions (CI/CD)

## 📈 Monitoring

- Health endpoint: `/health`
- Logs: Check Render dashboard
- Uptime: Monitor via health checks

## 🔧 Environment Variables

```bash
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://...
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
```

## 📝 License

MIT License