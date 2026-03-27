# NEXUS TRADER - AI-Powered Crypto Trading Platform

## Project Overview
NEXUS TRADER is a full-stack crypto trading platform built from the GitHub repository https://github.com/nakul500setia-netizen/nexus-trader.git with added authentication, payment system, and database integration.

## Architecture
- **Frontend**: React.js with TailwindCSS, Recharts for charts, Phosphor Icons
- **Backend**: FastAPI (Python) with WebSocket support
- **Database**: MongoDB for users, portfolios, trades, and transactions
- **Auth**: JWT-based authentication
- **Payments**: Stripe integration via emergentintegrations library

## Core Requirements (Static)
1. ✅ User authentication (register/login/logout)
2. ✅ Real-time crypto price data via WebSocket
3. ✅ Trading functionality (buy/sell crypto)
4. ✅ Portfolio management with balance tracking
5. ✅ Technical analysis indicators (RSI, MACD, Bollinger Bands, etc.)
6. ✅ Price charts with candlestick/area visualization
7. ✅ Order book display
8. ✅ Payment system for buying credits (Stripe)
9. ✅ Professional dark-themed trading UI

## What's Been Implemented (March 27, 2026)

### Backend (FastAPI)
- Health check endpoint
- User registration/login with JWT
- Market data endpoints (tickers, OHLCV, orderbook, analysis)
- Portfolio management
- Trade execution (buy/sell)
- Trade history
- Stripe payment integration (checkout, status, webhook)
- WebSocket for real-time price updates

### Frontend (React)
- Auth screens (login/register) with dark theme
- Professional trading dashboard
- Real-time price tickers
- Interactive price chart with Recharts
- Order book visualization
- Trading panel (buy/sell)
- Portfolio display
- Technical indicators panel
- Credits purchase system
- Payment success/cancel pages

### Database (MongoDB)
Collections:
- users (email, password hash, name, credits)
- portfolios (user_id, balances)
- trades (user_id, symbol, side, amount, price, status)
- payment_transactions (session_id, user_id, amount, status)

## User Personas
1. **Retail Trader**: Wants simple interface for buying/selling crypto
2. **Technical Analyst**: Uses indicators and charts for decisions
3. **Pro Trader**: Needs real-time data and quick order execution

## Prioritized Backlog

### P0 (Critical) - DONE
- ✅ Authentication system
- ✅ Trading functionality
- ✅ Real-time price data
- ✅ Payment integration

### P1 (High) - Future
- [ ] Real exchange API integration (Binance/Coinbase keys)
- [ ] AI trading agent with Claude integration
- [ ] Advanced order types (limit, stop-loss, take-profit)
- [ ] Price alerts and notifications

### P2 (Medium) - Future
- [ ] Portfolio analytics and P&L tracking
- [ ] Multiple timeframe charts
- [ ] Social trading features
- [ ] Mobile responsiveness improvements

### P3 (Low) - Future
- [ ] Trading competitions
- [ ] Educational content
- [ ] API documentation
- [ ] Dark/light theme toggle

## Next Tasks
1. Wait for preview URL to wake up for visual testing
2. Add real exchange API keys for live trading
3. Integrate Claude API for AI trading decisions
4. Add email notifications for trades

## Technical Notes
- Market data is currently MOCKED (no real exchange API keys)
- Stripe test key (sk_test_emergent) is configured
- WebSocket updates every 2 seconds
- Demo portfolio starts with $10,000 USDT
