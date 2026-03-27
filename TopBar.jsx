/**
 * strategies/indicators.js
 * Full technical analysis engine
 * Computes: RSI, MACD, Bollinger Bands, EMA stack, ADX, VWAP, ATR, patterns
 */

import TI from 'technicalindicators';

const { RSI, MACD, BollingerBands, EMA, ADX, ATR, StochasticRSI } = TI;

/**
 * Compute all technical indicators from OHLCV candle array
 * @param {Array} candles - [{open,high,low,close,volume}]
 * @returns {Object} Full indicator set with signals
 */
export function computeIndicators(candles) {
  if (!candles || candles.length < 50) {
    return { error: 'Insufficient candle data', candles: candles?.length || 0 };
  }

  const closes = candles.map(c => c.close);
  const highs  = candles.map(c => c.high);
  const lows   = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // ── RSI ─────────────────────────────────────────────────────
  const rsiValues = RSI.calculate({ values: closes, period: 14 });
  const rsi = last(rsiValues);
  const rsiPrev = rsiValues[rsiValues.length - 2];

  // ── MACD ────────────────────────────────────────────────────
  const macdResult = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const macd = last(macdResult);
  const macdPrev = macdResult[macdResult.length - 2];

  // ── Bollinger Bands ──────────────────────────────────────────
  const bbResult = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const bb = last(bbResult);
  const currentPrice = last(closes);
  const bbPosition = bb
    ? ((currentPrice - bb.lower) / (bb.upper - bb.lower) * 100).toFixed(1)
    : null;

  // ── EMA Stack ────────────────────────────────────────────────
  const ema9   = last(EMA.calculate({ values: closes, period: 9 }));
  const ema20  = last(EMA.calculate({ values: closes, period: 20 }));
  const ema50  = last(EMA.calculate({ values: closes, period: 50 }));
  const ema200 = last(EMA.calculate({ values: closes, period: 200 }));

  // ── ADX ──────────────────────────────────────────────────────
  const adxResult = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const adx = last(adxResult);

  // ── ATR ──────────────────────────────────────────────────────
  const atrResult = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const atr = last(atrResult);

  // ── Stochastic RSI ────────────────────────────────────────────
  const stochRSI = StochasticRSI.calculate({ values: closes, rsiPeriod: 14, stochasticPeriod: 14, kPeriod: 3, dPeriod: 3 });
  const srsi = last(stochRSI);

  // ── VWAP (rolling 24-bar approx) ─────────────────────────────
  const vwapBars = candles.slice(-24);
  const vwap = vwapBars.reduce((sum, c) => sum + ((c.high + c.low + c.close) / 3) * c.volume, 0)
               / vwapBars.reduce((sum, c) => sum + c.volume, 0);

  // ── Volume analysis ──────────────────────────────────────────
  const avgVol20 = avg(volumes.slice(-20));
  const currentVol = last(volumes);
  const volumeRatio = +(currentVol / avgVol20).toFixed(2);

  // ── Price Action Patterns ─────────────────────────────────────
  const patterns = detectPatterns(candles.slice(-10));

  // ── Signal Generation ─────────────────────────────────────────
  const signals = generateSignals({
    rsi, rsiPrev, macd, macdPrev, bb, bbPosition, currentPrice,
    ema9, ema20, ema50, ema200, adx, volumeRatio, srsi, vwap, patterns
  });

  return {
    price: currentPrice,
    indicators: {
      rsi: { value: +rsi?.toFixed(2), prev: +rsiPrev?.toFixed(2) },
      macd: {
        macd: +macd?.MACD?.toFixed(4),
        signal: +macd?.signal?.toFixed(4),
        histogram: +macd?.histogram?.toFixed(4),
        crossover: macd?.MACD > macd?.signal && macdPrev?.MACD <= macdPrev?.signal,
        crossunder: macd?.MACD < macd?.signal && macdPrev?.MACD >= macdPrev?.signal,
      },
      bollingerBands: {
        upper: +bb?.upper?.toFixed(2),
        middle: +bb?.middle?.toFixed(2),
        lower: +bb?.lower?.toFixed(2),
        position: +bbPosition,
        squeeze: bb ? (bb.upper - bb.lower) / bb.middle < 0.04 : false,
      },
      ema: { ema9: +ema9?.toFixed(2), ema20: +ema20?.toFixed(2), ema50: +ema50?.toFixed(2), ema200: +ema200?.toFixed(2) },
      adx: { value: +adx?.adx?.toFixed(2), plusDI: +adx?.pdi?.toFixed(2), minusDI: +adx?.mdi?.toFixed(2) },
      atr: { value: +atr?.toFixed(4), pct: +((atr / currentPrice) * 100).toFixed(3) },
      stochRSI: { k: +srsi?.k?.toFixed(2), d: +srsi?.d?.toFixed(2) },
      vwap: +vwap?.toFixed(4),
      volume: { current: +currentVol?.toFixed(2), ratio: volumeRatio, trend: volumeRatio > 1.5 ? 'high' : volumeRatio < 0.7 ? 'low' : 'normal' },
    },
    patterns,
    signals,
    timestamp: Date.now(),
  };
}

// ── Pattern Recognition ───────────────────────────────────────

function detectPatterns(candles) {
  const patterns = [];
  const n = candles.length;
  if (n < 3) return patterns;

  const c = candles.map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, body: Math.abs(c.close - c.open) }));

  // Doji
  const last0 = c[n - 1];
  if (last0.body / ((last0.h - last0.l) || 1) < 0.1) {
    patterns.push({ name: 'Doji', type: 'neutral', confidence: 70 });
  }

  // Hammer (bullish)
  const lowerShadow = last0.c > last0.o ? last0.o - last0.l : last0.c - last0.l;
  const upperShadow = last0.h - Math.max(last0.o, last0.c);
  if (lowerShadow > last0.body * 2 && upperShadow < last0.body * 0.5) {
    patterns.push({ name: 'Hammer', type: 'bullish', confidence: 72 });
  }

  // Shooting star (bearish)
  if (upperShadow > last0.body * 2 && lowerShadow < last0.body * 0.5) {
    patterns.push({ name: 'Shooting Star', type: 'bearish', confidence: 70 });
  }

  // Engulfing
  if (n >= 2) {
    const prev = c[n - 2];
    // Bullish engulfing
    if (prev.c < prev.o && last0.c > last0.o && last0.c > prev.o && last0.o < prev.c) {
      patterns.push({ name: 'Bullish Engulfing', type: 'bullish', confidence: 80 });
    }
    // Bearish engulfing
    if (prev.c > prev.o && last0.c < last0.o && last0.o > prev.c && last0.c < prev.o) {
      patterns.push({ name: 'Bearish Engulfing', type: 'bearish', confidence: 80 });
    }
  }

  // Morning star
  if (n >= 3) {
    const a = c[n - 3], b = c[n - 2], curr = c[n - 1];
    if (a.c < a.o && b.body < a.body * 0.3 && curr.c > curr.o && curr.c > (a.o + a.c) / 2) {
      patterns.push({ name: 'Morning Star', type: 'bullish', confidence: 85 });
    }
  }

  // Three white soldiers / three black crows
  if (n >= 3) {
    const last3 = c.slice(-3);
    if (last3.every(x => x.c > x.o)) {
      patterns.push({ name: 'Three White Soldiers', type: 'bullish', confidence: 78 });
    }
    if (last3.every(x => x.c < x.o)) {
      patterns.push({ name: 'Three Black Crows', type: 'bearish', confidence: 78 });
    }
  }

  return patterns;
}

// ── Signal Aggregation ────────────────────────────────────────

function generateSignals(data) {
  const { rsi, rsiPrev, macd, macdPrev, bb, bbPosition, currentPrice,
          ema9, ema20, ema50, ema200, adx, volumeRatio, srsi, vwap, patterns } = data;

  let bullScore = 0, bearScore = 0;
  const reasons = [];

  // RSI signals
  if (rsi !== null) {
    if (rsi < 30) { bullScore += 25; reasons.push({ indicator: 'RSI', message: `RSI oversold at ${rsi.toFixed(1)}`, type: 'bullish' }); }
    else if (rsi > 70) { bearScore += 25; reasons.push({ indicator: 'RSI', message: `RSI overbought at ${rsi.toFixed(1)}`, type: 'bearish' }); }
    if (rsiPrev < 30 && rsi > 30) { bullScore += 15; reasons.push({ indicator: 'RSI', message: 'RSI crossing back above 30', type: 'bullish' }); }
    if (rsiPrev > 70 && rsi < 70) { bearScore += 15; reasons.push({ indicator: 'RSI', message: 'RSI crossing back below 70', type: 'bearish' }); }
  }

  // MACD signals
  if (macd) {
    if (macd.histogram > 0 && macdPrev?.histogram <= 0) { bullScore += 20; reasons.push({ indicator: 'MACD', message: 'MACD histogram turned bullish', type: 'bullish' }); }
    if (macd.histogram < 0 && macdPrev?.histogram >= 0) { bearScore += 20; reasons.push({ indicator: 'MACD', message: 'MACD histogram turned bearish', type: 'bearish' }); }
    if (macd.MACD > macd.signal) { bullScore += 10; }
    else { bearScore += 10; }
  }

  // EMA stack
  if (ema9 && ema20 && ema50) {
    if (ema9 > ema20 && ema20 > ema50) { bullScore += 20; reasons.push({ indicator: 'EMA', message: 'EMA 9 > 20 > 50 bullish stack', type: 'bullish' }); }
    if (ema9 < ema20 && ema20 < ema50) { bearScore += 20; reasons.push({ indicator: 'EMA', message: 'EMA 9 < 20 < 50 bearish stack', type: 'bearish' }); }
    if (ema200 && currentPrice > ema200) { bullScore += 10; reasons.push({ indicator: 'EMA200', message: 'Price above 200 EMA (bull market)', type: 'bullish' }); }
  }

  // Bollinger Bands
  if (bb && bbPosition !== null) {
    if (bbPosition < 10) { bullScore += 15; reasons.push({ indicator: 'BB', message: 'Price near lower Bollinger Band', type: 'bullish' }); }
    if (bbPosition > 90) { bearScore += 15; reasons.push({ indicator: 'BB', message: 'Price near upper Bollinger Band', type: 'bearish' }); }
  }

  // ADX trend strength
  if (adx?.adx > 25) {
    const trending = adx.adx > 25;
    if (trending && adx.pdi > adx.mdi) { bullScore += 15; reasons.push({ indicator: 'ADX', message: `Strong uptrend (ADX ${adx.adx.toFixed(0)})`, type: 'bullish' }); }
    if (trending && adx.mdi > adx.pdi) { bearScore += 15; reasons.push({ indicator: 'ADX', message: `Strong downtrend (ADX ${adx.adx.toFixed(0)})`, type: 'bearish' }); }
  }

  // Volume confirmation
  if (volumeRatio > 1.5) {
    const bias = bullScore > bearScore ? 'bullish' : 'bearish';
    const pts = 10;
    if (bias === 'bullish') bullScore += pts; else bearScore += pts;
    reasons.push({ indicator: 'Volume', message: `High volume ${volumeRatio.toFixed(1)}x average confirming move`, type: bias });
  }

  // Stochastic RSI
  if (srsi) {
    if (srsi.k < 20 && srsi.d < 20) { bullScore += 12; reasons.push({ indicator: 'StochRSI', message: 'StochRSI oversold zone', type: 'bullish' }); }
    if (srsi.k > 80 && srsi.d > 80) { bearScore += 12; reasons.push({ indicator: 'StochRSI', message: 'StochRSI overbought zone', type: 'bearish' }); }
  }

  // VWAP
  if (vwap) {
    if (currentPrice > vwap * 1.005) { bullScore += 8; }
    else if (currentPrice < vwap * 0.995) { bearScore += 8; }
  }

  // Price patterns
  for (const p of patterns) {
    if (p.type === 'bullish') { bullScore += Math.floor(p.confidence / 10); reasons.push({ indicator: 'Pattern', message: p.name + ' pattern detected', type: 'bullish' }); }
    if (p.type === 'bearish') { bearScore += Math.floor(p.confidence / 10); reasons.push({ indicator: 'Pattern', message: p.name + ' pattern detected', type: 'bearish' }); }
  }

  const total = bullScore + bearScore;
  const bullPct = total > 0 ? Math.round(bullScore / total * 100) : 50;

  let signal, strength;
  const diff = bullScore - bearScore;
  if (diff > 40) { signal = 'STRONG BUY'; strength = 'strong'; }
  else if (diff > 15) { signal = 'BUY'; strength = 'moderate'; }
  else if (diff < -40) { signal = 'STRONG SELL'; strength = 'strong'; }
  else if (diff < -15) { signal = 'SELL'; strength = 'moderate'; }
  else { signal = 'NEUTRAL'; strength = 'weak'; }

  return { signal, strength, bullScore, bearScore, bullPct, reasons: reasons.slice(0, 6) };
}

// ── Helpers ───────────────────────────────────────────────────

function last(arr) { return arr && arr.length > 0 ? arr[arr.length - 1] : null; }
function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
