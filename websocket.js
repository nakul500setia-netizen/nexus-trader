{
  "name": "nexus-trader-backend",
  "version": "1.0.0",
  "description": "AI-powered crypto trading backend for Binance & Coinbase",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "ccxt": "^4.3.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "ws": "^8.16.0",
    "node-cron": "^3.0.3",
    "technicalindicators": "^3.1.0",
    "axios": "^1.6.7",
    "winston": "^3.11.0",
    "express-rate-limit": "^7.1.5"
  }
}
