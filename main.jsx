/**
 * exchanges/manager.js
 * Unified exchange interface for Binance & Coinbase via ccxt
 * Supports: spot, futures, stop-loss, take-profit, portfolio queries
 */

import ccxt from 'ccxt';
import { logger } from '../utils/logger.js';

export class ExchangeManager {
  constructor() {
    this.exchanges = {};
    this.initialized = false;
  }

  async initialize() {
    try {
      await this._initBinance();
      await this._initCoinbase();
      this.initialized = true;
      logger.info('ExchangeManager: all exchanges initialized');
    } catch (err) {
      logger.error('ExchangeManager init error:', err.message);
      // Continue with mock mode if keys missing
      this.initialized = true;
    }
  }

  // ─── Binance ──────────────────────────────────────────────
  async _initBinance() {
    const apiKey = process.env.BINANCE_API_KEY;
    const secret = process.env.BINANCE_SECRET;

    if (!apiKey || apiKey === 'your_binance_api_key_here') {
      logger.warn('Binance: No API key — running in read-only mock mode');
      this.exchanges.binance = null;
      return;
    }

    const config = {
      apiKey,
      secret,
      enableRateLimit: true,
      options: { defaultType: 'spot' },
    };

    if (process.env.BINANCE_TESTNET === 'true') {
      config.urls = { api: { public: process.env.BINANCE_TESTNET_URL, private: process.env.BINANCE_TESTNET_URL } };
      logger.info('Binance: connected to TESTNET');
    }

    const spot = new ccxt.binance(config);
    const futures = new ccxt.binanceusdm({ ...config, options: { defaultType: 'future' } });

    await spot.loadMarkets();
    await futures.loadMarkets();

    this.exchanges.binance = { spot, futures };
    logger.info('Binance: connected ✓');
  }

  // ─── Coinbase ─────────────────────────────────────────────
  async _initCoinbase() {
    const apiKey = process.env.COINBASE_API_KEY;
    const secret = process.env.COINBASE_SECRET;

    if (!apiKey || apiKey === 'your_coinbase_api_key_here') {
      logger.warn('Coinbase: No API key — running in read-only mock mode');
      this.exchanges.coinbase = null;
      return;
    }

    const config = {
      apiKey,
      secret,
      enableRateLimit: true,
    };

    if (process.env.COINBASE_SANDBOX === 'true') {
      config.urls = { api: 'https://api-public.sandbox.exchange.coinbase.com' };
      logger.info('Coinbase: connected to SANDBOX');
    }

    const spot = new ccxt.coinbaseadvanced(config);
    await spot.loadMarkets();
    this.exchanges.coinbase = { spot };
    logger.info('Coinbase: connected ✓');
  }

  // ─── Public API ───────────────────────────────────────────

  /** Fetch OHLCV candles from either exchange */
  async fetchOHLCV(exchange, symbol, timeframe = '1h', limit = 200) {
    const ex = this._getSpot(exchange);
    if (!ex) return this._mockOHLCV(symbol, limit);

    try {
      const data = await ex.fetchOHLCV(symbol, timeframe, undefined, limit);
      return data.map(([ts, o, h, l, c, v]) => ({ ts, open: o, high: h, low: l, close: c, volume: v }));
    } catch (err) {
      logger.error(`fetchOHLCV(${exchange}, ${symbol}):`, err.message);
      return this._mockOHLCV(symbol, limit);
    }
  }

  /** Fetch current ticker */
  async fetchTicker(exchange, symbol) {
    const ex = this._getSpot(exchange);
    if (!ex) return this._mockTicker(symbol);
    try {
      return await ex.fetchTicker(symbol);
    } catch (err) {
      logger.error(`fetchTicker(${exchange}, ${symbol}):`, err.message);
      return this._mockTicker(symbol);
    }
  }

  /** Fetch order book */
  async fetchOrderBook(exchange, symbol, limit = 20) {
    const ex = this._getSpot(exchange);
    if (!ex) return this._mockOrderBook(symbol);
    try {
      return await ex.fetchOrderBook(symbol, limit);
    } catch (err) {
      return this._mockOrderBook(symbol);
    }
  }

  /** Fetch portfolio balances */
  async fetchBalance(exchange) {
    const ex = this._getSpot(exchange);
    if (!ex) return this._mockBalance();
    try {
      const bal = await ex.fetchBalance();
      const result = {};
      for (const [asset, info] of Object.entries(bal.total)) {
        if (info > 0) result[asset] = { free: bal.free[asset] || 0, used: bal.used[asset] || 0, total: info };
      }
      return result;
    } catch (err) {
      logger.error(`fetchBalance(${exchange}):`, err.message);
      return this._mockBalance();
    }
  }

  /** Place a SPOT order */
  async placeSpotOrder(exchange, symbol, side, type, amount, price = undefined, params = {}) {
    if (process.env.ENABLE_LIVE_TRADING !== 'true') {
      logger.info(`[DRY RUN] SPOT ${side} ${amount} ${symbol} @ ${price || 'market'}`);
      return this._mockOrder(symbol, side, type, amount, price);
    }

    const ex = this._getSpot(exchange);
    if (!ex) throw new Error('Exchange not configured');

    const order = await ex.createOrder(symbol, type, side, amount, price, params);
    logger.info(`SPOT order placed: ${order.id} — ${side} ${amount} ${symbol}`);
    return order;
  }

  /** Place a FUTURES order (Binance only) */
  async placeFuturesOrder(exchange, symbol, side, type, amount, price = undefined, params = {}) {
    if (exchange !== 'binance') throw new Error('Futures only available on Binance');

    if (process.env.ENABLE_LIVE_TRADING !== 'true') {
      logger.info(`[DRY RUN] FUTURES ${side} ${amount} ${symbol} @ ${price || 'market'}`);
      return this._mockOrder(symbol, side, type, amount, price);
    }

    const ex = this.exchanges.binance?.futures;
    if (!ex) throw new Error('Binance futures not configured');

    const order = await ex.createOrder(symbol, type, side, amount, price, params);
    logger.info(`FUTURES order placed: ${order.id}`);
    return order;
  }

  /** Place OCO (stop-loss + take-profit) on Binance */
  async placeOCOOrder(exchange, symbol, side, amount, price, stopPrice, stopLimitPrice) {
    if (process.env.ENABLE_LIVE_TRADING !== 'true') {
      logger.info(`[DRY RUN] OCO ${side} ${amount} ${symbol} stop:${stopPrice} tp:${price}`);
      return { type: 'oco', symbol, side, amount, stopPrice, limitPrice: price };
    }

    const ex = this._getSpot(exchange);
    if (!ex) throw new Error('Exchange not configured');

    return await ex.createOrder(symbol, 'oco', side, amount, price, {
      stopPrice,
      stopLimitPrice: stopLimitPrice || stopPrice,
    });
  }

  /** Cancel an order */
  async cancelOrder(exchange, orderId, symbol) {
    if (process.env.ENABLE_LIVE_TRADING !== 'true') {
      return { id: orderId, status: 'canceled' };
    }
    const ex = this._getSpot(exchange);
    return await ex.cancelOrder(orderId, symbol);
  }

  /** Fetch open orders */
  async fetchOpenOrders(exchange, symbol = undefined) {
    const ex = this._getSpot(exchange);
    if (!ex) return [];
    try {
      return await ex.fetchOpenOrders(symbol);
    } catch (err) {
      return [];
    }
  }

  /** Fetch trade history */
  async fetchTradeHistory(exchange, symbol, limit = 50) {
    const ex = this._getSpot(exchange);
    if (!ex) return this._mockTradeHistory(symbol, limit);
    try {
      return await ex.fetchMyTrades(symbol, undefined, limit);
    } catch (err) {
      return this._mockTradeHistory(symbol, limit);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  _getSpot(exchange) {
    return this.exchanges[exchange]?.spot || null;
  }

  // ─── Mock Data (when no API keys) ─────────────────────────

  _mockOHLCV(symbol, limit) {
    const prices = { 'BTC/USDT': 94800, 'ETH/USDT': 3280, 'SOL/USDT': 178, 'BNB/USDT': 612 };
    let price = prices[symbol] || 1000;
    const now = Date.now();
    return Array.from({ length: limit }, (_, i) => {
      const ts = now - (limit - i) * 3600000;
      const vol = price * 0.018;
      const open = price;
      const close = price + (Math.random() - 0.49) * vol;
      const high = Math.max(open, close) + Math.random() * vol * 0.4;
      const low = Math.min(open, close) - Math.random() * vol * 0.4;
      price = close;
      return { ts, open, high, low, close, volume: Math.random() * 500 + 100 };
    });
  }

  _mockTicker(symbol) {
    const prices = { 'BTC/USDT': 94800, 'ETH/USDT': 3280, 'SOL/USDT': 178, 'BNB/USDT': 612, 'XRP/USDT': 2.34 };
    const price = prices[symbol] || 100;
    return {
      symbol, last: price, bid: price * 0.9998, ask: price * 1.0002,
      high: price * 1.025, low: price * 0.968,
      baseVolume: Math.random() * 10000 + 5000,
      percentage: (Math.random() * 6 - 2).toFixed(2),
    };
  }

  _mockOrderBook(symbol) {
    const prices = { 'BTC/USDT': 94800, 'ETH/USDT': 3280, 'SOL/USDT': 178 };
    const mid = prices[symbol] || 1000;
    const asks = Array.from({ length: 15 }, (_, i) => [mid * (1 + 0.0002 * (i + 1)), Math.random() * 2 + 0.05]);
    const bids = Array.from({ length: 15 }, (_, i) => [mid * (1 - 0.0002 * (i + 1)), Math.random() * 2 + 0.05]);
    return { asks, bids, timestamp: Date.now() };
  }

  _mockBalance() {
    return {
      USDT: { free: 8220.50, used: 1500, total: 9720.50 },
      BTC:  { free: 0.1821, used: 0, total: 0.1821 },
      ETH:  { free: 1.52, used: 0, total: 1.52 },
      SOL:  { free: 20.5, used: 0, total: 20.5 },
      BNB:  { free: 2.3, used: 0, total: 2.3 },
    };
  }

  _mockOrder(symbol, side, type, amount, price) {
    return {
      id: 'mock_' + Date.now(),
      symbol, side, type, amount,
      price: price || null,
      status: 'closed',
      filled: amount,
      timestamp: Date.now(),
      mock: true,
    };
  }

  _mockTradeHistory(symbol, limit) {
    const prices = { 'BTC/USDT': 94800, 'ETH/USDT': 3280 };
    const price = prices[symbol] || 1000;
    return Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
      id: `mock_${i}`,
      symbol,
      side: i % 2 === 0 ? 'buy' : 'sell',
      price: price * (1 + (Math.random() - 0.5) * 0.02),
      amount: Math.random() * 0.1 + 0.001,
      cost: price * 0.05,
      timestamp: Date.now() - i * 3600000 * 4,
      fee: { cost: price * 0.0001, currency: 'USDT' },
    }));
  }
}

export const exchangeManager = new ExchangeManager();
