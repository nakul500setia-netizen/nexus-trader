# ============================================================
#  NEXUS TRADER — Environment Configuration
#  Copy this file to .env and fill in your real API keys
# ============================================================

# --- Server ---
PORT=4000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# --- Binance API ---
# Get keys from: https://www.binance.com/en/my/settings/api-management
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_SECRET=your_binance_secret_here
BINANCE_TESTNET=true          # Set to false for live trading!
BINANCE_TESTNET_URL=https://testnet.binance.vision

# --- Coinbase Advanced Trade API ---
# Get keys from: https://www.coinbase.com/settings/api
COINBASE_API_KEY=your_coinbase_api_key_here
COINBASE_SECRET=your_coinbase_secret_here
COINBASE_PASSPHRASE=your_coinbase_passphrase_here
COINBASE_SANDBOX=true         # Set to false for live trading!

# --- Anthropic (AI Agent Brain) ---
# Get key from: https://console.anthropic.com
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# --- Fear & Greed Index (free) ---
FEAR_GREED_URL=https://api.alternative.me/fng/

# --- Trading Safety ---
MAX_POSITION_SIZE_PCT=5       # Max % of portfolio per trade
MAX_DAILY_TRADES=20           # Circuit breaker
MAX_DAILY_LOSS_PCT=3          # Stop all trading if daily loss hits this
ENABLE_LIVE_TRADING=false     # Master kill-switch — MUST be true to place real orders

# --- WebSocket ---
WS_HEARTBEAT_INTERVAL=30000
