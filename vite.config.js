/**
 * routes/api.js
 * REST API routes for the trading dashboard
 */

import { Router } from 'express';
import { exchangeManager } from '../exchanges/manager.js';
import { computeIndicators } from '../strategies/indicators.js';
import { tradingBrain } from '../agent/brain.js';
import { logger } from '../utils/logger.js';

export function createRoutes(agentExecutor) {
  const router = Router();

  // ─── Health ──────────────────────────────────────────────────
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      version: '1.0.0',
      exchanges: {
        binance: !!exchangeManager.exchanges.binance,
        coinbase: !!exchangeManager.exchanges.coinbase,
      },
      agent: agentExecutor.getStatus(),
      liveTrading: process.env.ENABLE_LIVE_TRADING === 'true',
      timestamp: Date.now(),
    });
  });

  // ─── Market Data ─────────────────────────────────────────────

  /** GET /api/ticker?exchange=binance&symbol=BTC/USDT */
  router.get('/ticker', async (req, res) => {
    try {
      const { exchange = 'binance', symbol = 'BTC/USDT' } = req.query;
      const ticker = await exchangeManager.fetchTicker(exchange, symbol);
      res.json({ symbol, exchange, ticker });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/tickers?exchange=binance&symbols=BTC/USDT,ETH/USDT */
  router.get('/tickers', async (req, res) => {
    try {
      const { exchange = 'binance', symbols = 'BTC/USDT,ETH/USDT,SOL/USDT,BNB/USDT,XRP/USDT' } = req.query;
      const symList = symbols.split(',');
      const results = await Promise.all(
        symList.map(s => exchangeManager.fetchTicker(exchange, s.trim()).catch(() => null))
      );
      res.json({ exchange, tickers: results.filter(Boolean) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/ohlcv?exchange=binance&symbol=BTC/USDT&timeframe=1h&limit=200 */
  router.get('/ohlcv', async (req, res) => {
    try {
      const { exchange = 'binance', symbol = 'BTC/USDT', timeframe = '1h', limit = '200' } = req.query;
      const candles = await exchangeManager.fetchOHLCV(exchange, symbol, timeframe, parseInt(limit));
      res.json({ symbol, exchange, timeframe, candles });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/orderbook?exchange=binance&symbol=BTC/USDT */
  router.get('/orderbook', async (req, res) => {
    try {
      const { exchange = 'binance', symbol = 'BTC/USDT', limit = '20' } = req.query;
      const book = await exchangeManager.fetchOrderBook(exchange, symbol, parseInt(limit));
      res.json({ symbol, exchange, orderbook: book });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Technical Analysis ──────────────────────────────────────

  /** GET /api/indicators?exchange=binance&symbol=BTC/USDT&timeframe=1h */
  router.get('/indicators', async (req, res) => {
    try {
      const { exchange = 'binance', symbol = 'BTC/USDT', timeframe = '1h' } = req.query;

      // Use cached analysis if fresh (< 5 mins)
      const cached = agentExecutor.getAnalysis(symbol);
      if (cached && Date.now() - cached.timestamp < 300000) {
        return res.json({ symbol, exchange, ...cached });
      }

      const candles = await exchangeManager.fetchOHLCV(exchange, symbol, timeframe, 200);
      const analysis = computeIndicators(candles);
      res.json({ symbol, exchange, timeframe, ...analysis });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/sentiment */
  router.get('/sentiment', async (req, res) => {
    try {
      const fearGreed = await tradingBrain.fetchFearGreed();
      res.json({ fearGreed, timestamp: Date.now() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Trading ─────────────────────────────────────────────────

  /** GET /api/balance?exchange=binance */
  router.get('/balance', async (req, res) => {
    try {
      const { exchange = 'binance' } = req.query;
      const balance = await exchangeManager.fetchBalance(exchange);
      res.json({ exchange, balance });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** POST /api/order — Place manual order */
  router.post('/order', async (req, res) => {
    try {
      const {
        exchange = 'binance',
        symbol,
        side,         // 'buy' | 'sell'
        type,         // 'market' | 'limit' | 'stop-limit' | 'trailing-stop'
        marketType = 'spot', // 'spot' | 'futures'
        amount,
        price,
        stopPrice,
        takeProfit,
        leverage = 1,
      } = req.body;

      if (!symbol || !side || !amount) {
        return res.status(400).json({ error: 'symbol, side, amount are required' });
      }

      let order;

      if (marketType === 'futures') {
        order = await exchangeManager.placeFuturesOrder(
          exchange, symbol, side, type || 'market',
          parseFloat(amount), price ? parseFloat(price) : undefined,
          { leverage: parseInt(leverage) }
        );
      } else {
        order = await exchangeManager.placeSpotOrder(
          exchange, symbol, side, type || 'market',
          parseFloat(amount), price ? parseFloat(price) : undefined
        );
      }

      // Attach OCO if SL/TP provided
      if (stopPrice && takeProfit && side === 'buy' && exchange === 'binance') {
        try {
          await exchangeManager.placeOCOOrder(
            exchange, symbol, 'sell', parseFloat(amount),
            parseFloat(takeProfit), parseFloat(stopPrice), parseFloat(stopPrice) * 0.999
          );
        } catch (ocoErr) {
          logger.warn('OCO failed but base order placed:', ocoErr.message);
        }
      }

      res.json({ success: true, order });
    } catch (err) {
      logger.error('Order placement error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/orders?exchange=binance&symbol=BTC/USDT */
  router.get('/orders', async (req, res) => {
    try {
      const { exchange = 'binance', symbol } = req.query;
      const orders = await exchangeManager.fetchOpenOrders(exchange, symbol);
      res.json({ exchange, orders });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** DELETE /api/order/:id */
  router.delete('/order/:id', async (req, res) => {
    try {
      const { exchange = 'binance', symbol } = req.query;
      const result = await exchangeManager.cancelOrder(exchange, req.params.id, symbol);
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/trades?exchange=binance&symbol=BTC/USDT */
  router.get('/trades', async (req, res) => {
    try {
      const { exchange = 'binance', symbol = 'BTC/USDT', limit = '50' } = req.query;
      const trades = await exchangeManager.fetchTradeHistory(exchange, symbol, parseInt(limit));
      res.json({ exchange, symbol, trades });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── AI Agent ────────────────────────────────────────────────

  /** GET /api/agent/status */
  router.get('/agent/status', (req, res) => {
    res.json(agentExecutor.getStatus());
  });

  /** POST /api/agent/start */
  router.post('/agent/start', (req, res) => {
    agentExecutor.configure(req.body);
    const result = agentExecutor.start();
    res.json(result);
  });

  /** POST /api/agent/stop */
  router.post('/agent/stop', (req, res) => {
    res.json(agentExecutor.stop());
  });

  /** POST /api/agent/configure */
  router.post('/agent/configure', (req, res) => {
    agentExecutor.configure(req.body);
    res.json({ success: true, config: agentExecutor.config });
  });

  /** POST /api/agent/analyze — one-shot analysis without trading */
  router.post('/agent/analyze', async (req, res) => {
    try {
      const { exchange = 'binance', symbol = 'BTC/USDT', timeframe = '1h', customStrategy = '', marketType = 'spot', leverage = 1 } = req.body;

      const [candles, ticker, balance] = await Promise.all([
        exchangeManager.fetchOHLCV(exchange, symbol, timeframe, 200),
        exchangeManager.fetchTicker(exchange, symbol),
        exchangeManager.fetchBalance(exchange),
      ]);

      const technicals = computeIndicators(candles);

      const decision = await tradingBrain.analyze({
        symbol, exchange, technicals, ticker, balance,
        customStrategy, marketType, leverage: parseInt(leverage),
      });

      res.json({ symbol, exchange, technicals, ticker, decision });
    } catch (err) {
      logger.error('Analysis error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  /** GET /api/agent/positions */
  router.get('/agent/positions', (req, res) => {
    res.json({ positions: agentExecutor.getPositions() });
  });

  return router;
}
