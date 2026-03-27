/**
 * agent/executor.js
 * Autonomous agent loop — polls markets, runs analysis, executes orders
 * Supports: spot, futures, portfolio rebalancing, stop-loss management
 */

import cron from 'node-cron';
import { tradingBrain } from './brain.js';
import { exchangeManager } from '../exchanges/manager.js';
import { computeIndicators } from '../strategies/indicators.js';
import { logger } from '../utils/logger.js';

export class AgentExecutor {
  constructor(wsBroadcast) {
    this.wsBroadcast = wsBroadcast; // fn to push updates to frontend
    this.running = false;
    this.config = {
      enabled: false,
      exchange: 'binance',
      symbols: ['BTC/USDT', 'ETH/USDT'],
      marketType: 'spot',
      leverage: 1,
      interval: '*/15 * * * *', // Every 15 minutes
      customStrategy: '',
      targetAllocation: { BTC: 60, ETH: 25, USDT: 15 },
    };
    this.activePositions = new Map();
    this.cronJob = null;
    this.analysisCache = new Map();
  }

  /** Update agent config from API */
  configure(cfg) {
    this.config = { ...this.config, ...cfg };
    logger.info('Agent configured:', this.config);
    this.emit('config_updated', this.config);
  }

  /** Start the agent loop */
  start() {
    if (this.running) return { status: 'already_running' };

    this.running = true;
    this.config.enabled = true;

    // Run immediately on start, then on schedule
    this._runCycle();

    this.cronJob = cron.schedule(this.config.interval, () => {
      this._runCycle();
    });

    logger.info(`Agent started — interval: ${this.config.interval}`);
    this.emit('agent_status', { status: 'running', config: this.config });

    return { status: 'started', config: this.config };
  }

  /** Stop the agent loop */
  stop() {
    this.running = false;
    this.config.enabled = false;
    if (this.cronJob) { this.cronJob.stop(); this.cronJob = null; }

    logger.info('Agent stopped');
    this.emit('agent_status', { status: 'stopped' });

    return { status: 'stopped' };
  }

  /** One analysis + execution cycle */
  async _runCycle() {
    if (!this.running) return;

    logger.info(`Agent cycle starting — ${this.config.symbols.join(', ')}`);

    const results = [];

    for (const symbol of this.config.symbols) {
      try {
        const result = await this._analyzeAndAct(symbol);
        results.push(result);
        // Stagger between symbols to avoid rate limits
        await sleep(2000);
      } catch (err) {
        logger.error(`Cycle error for ${symbol}:`, err.message);
        results.push({ symbol, error: err.message });
      }
    }

    // Portfolio rebalancing (runs less frequently — every 4 hours)
    const hour = new Date().getHours();
    if (hour % 4 === 0 && new Date().getMinutes() < 15) {
      await this._rebalancePortfolio();
    }

    this.emit('cycle_complete', { timestamp: Date.now(), results });
  }

  /** Analyze a single symbol and act on decision */
  async _analyzeAndAct(symbol) {
    const { exchange, marketType, leverage, customStrategy } = this.config;

    // 1. Fetch market data
    const [candles, ticker, balance] = await Promise.all([
      exchangeManager.fetchOHLCV(exchange, symbol, '1h', 200),
      exchangeManager.fetchTicker(exchange, symbol),
      exchangeManager.fetchBalance(exchange),
    ]);

    // 2. Compute technical indicators
    const technicals = computeIndicators(candles);

    // 3. AI brain analysis
    const decision = await tradingBrain.analyze({
      symbol, exchange, technicals, ticker, balance, customStrategy, marketType, leverage
    });

    // Cache for API/frontend access
    this.analysisCache.set(symbol, {
      technicals, ticker, decision,
      timestamp: Date.now(),
    });

    // Emit to frontend
    this.emit('analysis', { symbol, technicals, ticker, decision });

    // 4. Act on decision
    if (decision.action !== 'HOLD' && decision.confidence >= 60) {
      await this._executeDecision(symbol, decision, ticker, balance);
    } else {
      logger.info(`${symbol}: HOLD (confidence: ${decision.confidence}%)`);
    }

    return { symbol, decision, technicals: { signals: technicals.signals } };
  }

  /** Execute a trade decision */
  async _executeDecision(symbol, decision, ticker, balance) {
    const { exchange, marketType, leverage } = this.config;
    const { action, positionSizePct, entryType, limitPrice, stopLoss, takeProfit } = decision;

    const currentPrice = ticker.last;
    const usdtAvail = balance.USDT?.free || 0;
    const positionUSD = usdtAvail * (positionSizePct / 100);
    const [base, quote] = symbol.split('/');
    const amount = positionUSD / currentPrice;

    logger.info(`Executing ${action} ${amount.toFixed(6)} ${base} @ ${currentPrice} (${positionSizePct}% position)`);

    try {
      let order;

      if (marketType === 'futures') {
        // Futures order with leverage
        order = await exchangeManager.placeFuturesOrder(
          exchange, symbol,
          action === 'BUY' ? 'buy' : 'sell',
          entryType,
          amount,
          entryType === 'limit' ? limitPrice : undefined,
          { leverage }
        );
      } else {
        // Spot order
        order = await exchangeManager.placeSpotOrder(
          exchange, symbol,
          action === 'BUY' ? 'buy' : 'sell',
          entryType,
          amount,
          entryType === 'limit' ? limitPrice : undefined
        );
      }

      // Place stop-loss + take-profit (OCO on Binance)
      if (stopLoss && takeProfit && action === 'BUY' && exchange === 'binance') {
        try {
          await exchangeManager.placeOCOOrder(
            exchange, symbol, 'sell', amount,
            takeProfit, stopLoss, stopLoss * 0.999
          );
          logger.info(`OCO placed: SL=${stopLoss} TP=${takeProfit}`);
        } catch (ocoErr) {
          logger.warn('OCO placement failed (order still filled):', ocoErr.message);
        }
      }

      // Track position
      this.activePositions.set(symbol, {
        order, action, amount, entryPrice: currentPrice,
        stopLoss, takeProfit, openedAt: Date.now(),
      });

      const tradeEvent = {
        id: order.id,
        symbol,
        side: action,
        amount: +amount.toFixed(6),
        price: currentPrice,
        positionSizePct,
        stopLoss,
        takeProfit,
        riskRewardRatio: decision.riskRewardRatio,
        reasoning: decision.reasoning,
        source: 'agent',
        timestamp: Date.now(),
      };

      this.emit('trade_executed', tradeEvent);
      logger.info('Trade executed:', tradeEvent);

      return tradeEvent;
    } catch (err) {
      logger.error(`Order execution failed for ${symbol}:`, err.message);
      this.emit('trade_error', { symbol, error: err.message, timestamp: Date.now() });
      throw err;
    }
  }

  /** Portfolio rebalancing */
  async _rebalancePortfolio() {
    const { exchange, targetAllocation } = this.config;
    const balance = await exchangeManager.fetchBalance(exchange);

    // Fetch prices for held assets
    const prices = {};
    for (const asset of Object.keys(balance)) {
      if (asset !== 'USDT') {
        try {
          const ticker = await exchangeManager.fetchTicker(exchange, `${asset}/USDT`);
          prices[`${asset}/USDT`] = ticker.last;
          await sleep(300);
        } catch {}
      }
    }

    const totalUSD = Object.entries(balance).reduce((sum, [asset, info]) => {
      const price = asset === 'USDT' ? 1 : (prices[`${asset}/USDT`] || 0);
      return sum + info.free * price;
    }, 0);

    const rebalance = await tradingBrain.analyzePortfolio({
      balance, prices, targetAllocation, totalValueUSD: totalUSD
    });

    if (rebalance.trades?.length > 0) {
      this.emit('rebalance_suggestion', { ...rebalance, totalUSD, timestamp: Date.now() });
      logger.info(`Rebalance: ${rebalance.trades.length} trades suggested`);
    }
  }

  /** Get cached analysis for a symbol */
  getAnalysis(symbol) {
    return this.analysisCache.get(symbol) || null;
  }

  /** Get all active positions */
  getPositions() {
    return Object.fromEntries(this.activePositions);
  }

  /** Get agent status */
  getStatus() {
    return {
      running: this.running,
      config: this.config,
      positionCount: this.activePositions.size,
      dailyTradeCount: tradingBrain.dailyTradeCount,
      fearGreedIndex: tradingBrain.fearGreedIndex,
    };
  }

  /** Broadcast via WebSocket */
  emit(event, data) {
    if (this.wsBroadcast) {
      this.wsBroadcast({ event, data, timestamp: Date.now() });
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
