/**
 * src/index.js
 * NEXUS TRADER Backend — Main Entry Point
 */

import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { exchangeManager } from './exchanges/manager.js';
import { AgentExecutor } from './agent/executor.js';
import { createRoutes } from './routes/api.js';
import { setupWebSocket } from './utils/websocket.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // ── Middleware ────────────────────────────────────────────────
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'DELETE', 'PUT'],
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' }));

  app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: { error: 'Too many requests' },
    skip: (req) => req.path === '/api/health',
  }));

  // ── WebSocket ─────────────────────────────────────────────────
  const broadcast = setupWebSocket(server);

  // ── Exchanges ─────────────────────────────────────────────────
  logger.info('Initializing exchanges...');
  await exchangeManager.initialize();

  // ── Agent ─────────────────────────────────────────────────────
  const agent = new AgentExecutor(broadcast);

  // ── Routes ───────────────────────────────────────────────────
  app.use('/api', createRoutes(agent));

  // Global error handler
  app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });

  // 404
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // ── Start ─────────────────────────────────────────────────────
  const PORT = process.env.PORT || 4000;
  server.listen(PORT, () => {
    logger.info(`🚀 NEXUS TRADER running on http://localhost:${PORT}`);
    logger.info(`📡 WebSocket: ws://localhost:${PORT}/ws`);
    logger.info(`🔴 Live Trading: ${process.env.ENABLE_LIVE_TRADING === 'true' ? 'ENABLED' : 'DISABLED (dry-run)'}`);
    logger.info(`💡 Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

bootstrap().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
