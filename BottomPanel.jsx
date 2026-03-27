/**
 * utils/websocket.js
 * WebSocket server — real-time price updates, agent events, trade notifications
 */

import { WebSocketServer, WebSocket } from 'ws';
import { exchangeManager } from '../exchanges/manager.js';
import { logger } from '../utils/logger.js';

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set();

  // Track subscriptions per client
  const subscriptions = new Map(); // client -> { symbols, exchange }

  wss.on('connection', (ws, req) => {
    clients.add(ws);
    subscriptions.set(ws, { symbols: ['BTC/USDT', 'ETH/USDT'], exchange: 'binance' });

    logger.info(`WS client connected. Total: ${clients.size}`);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleClientMessage(ws, msg, subscriptions);
      } catch (err) {
        logger.warn('WS parse error:', err.message);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      subscriptions.delete(ws);
      logger.info(`WS client disconnected. Total: ${clients.size}`);
    });

    ws.on('error', (err) => {
      logger.error('WS client error:', err.message);
      clients.delete(ws);
      subscriptions.delete(ws);
    });

    // Send welcome
    send(ws, { event: 'connected', data: { message: 'NEXUS TRADER WebSocket ready' } });
  });

  function handleClientMessage(ws, msg, subs) {
    switch (msg.type) {
      case 'subscribe':
        subs.set(ws, { symbols: msg.symbols || ['BTC/USDT'], exchange: msg.exchange || 'binance' });
        send(ws, { event: 'subscribed', data: { symbols: msg.symbols } });
        break;

      case 'ping':
        send(ws, { event: 'pong', data: { ts: Date.now() } });
        break;

      default:
        logger.warn('Unknown WS message type:', msg.type);
    }
  }

  /** Broadcast to all connected clients */
  function broadcast(payload) {
    const json = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  function send(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  // ── Price polling loop ───────────────────────────────────────
  const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT'];
  const priceCache = {};

  async function pollPrices() {
    if (clients.size === 0) return;

    try {
      const tickers = await Promise.all(
        SYMBOLS.map(s => exchangeManager.fetchTicker('binance', s).catch(() => null))
      );

      const updates = [];
      for (const ticker of tickers) {
        if (!ticker) continue;
        const prev = priceCache[ticker.symbol];
        priceCache[ticker.symbol] = ticker.last;

        updates.push({
          symbol: ticker.symbol,
          price: ticker.last,
          change24h: ticker.percentage,
          high: ticker.high,
          low: ticker.low,
          volume: ticker.baseVolume,
          direction: prev ? (ticker.last > prev ? 'up' : ticker.last < prev ? 'down' : 'flat') : 'flat',
        });
      }

      broadcast({ event: 'price_update', data: updates, timestamp: Date.now() });
    } catch (err) {
      // Silent fail — price polling is best-effort
    }
  }

  setInterval(pollPrices, 2000);

  // Heartbeat to keep connections alive
  setInterval(() => {
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      } else {
        clients.delete(client);
      }
    }
  }, parseInt(process.env.WS_HEARTBEAT_INTERVAL || 30000));

  logger.info('WebSocket server ready on /ws');

  return broadcast;
}
