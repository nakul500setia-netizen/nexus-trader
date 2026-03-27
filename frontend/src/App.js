import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { 
  ChartLine, Wallet, CurrencyBtc, ArrowUp, ArrowDown, 
  SignOut, User, CreditCard, TrendUp, TrendDown,
  Lightning, Activity, Gear, CaretDown, Eye, EyeSlash
} from '@phosphor-icons/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const API_URL = process.env.REACT_APP_BACKEND_URL;

// ═══════════════════════════════════════════════════════════════════
// AUTH CONTEXT
// ═══════════════════════════════════════════════════════════════════

const AuthContext = React.createContext(null);

function useAuth() {
  return React.useContext(AuthContext);
}

// ═══════════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════════

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function formatPrice(price, decimals = 2) {
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (price >= 1) return price.toFixed(decimals);
  return price.toFixed(4);
}

function formatChange(change) {
  const prefix = change >= 0 ? '+' : '';
  return `${prefix}${change.toFixed(2)}%`;
}

// ═══════════════════════════════════════════════════════════════════
// AUTH SCREENS
// ═══════════════════════════════════════════════════════════════════

function AuthScreen({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin ? { email, password } : { email, password, name };
      const response = await api.post(endpoint, payload);
      
      localStorage.setItem('token', response.data.access_token);
      onLogin(response.data.user);
    } catch (err) {
      setError(err.response?.data?.detail || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundImage: 'url(https://images.unsplash.com/photo-1649355403641-c32a19871d7e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1Mjh8MHwxfHNlYXJjaHwyfHxnbG93aW5nJTIwbmVvbiUyMGJsdWUlMjBnZW9tZXRyeXxlbnwwfHx8fDE3NzQ1ODM1OTB8MA&ixlib=rb-4.1.0&q=85)',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}
    >
      <div className="card p-8 w-full max-w-md animate-fade-in" style={{ backgroundColor: 'rgba(18, 18, 18, 0.95)' }}>
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded bg-primary flex items-center justify-center animate-pulse-glow">
            <Lightning size={24} weight="fill" />
          </div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">NEXUS TRADER</h1>
        </div>

        <h2 className="font-heading text-xl font-bold mb-6">
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full"
                required={!isLogin}
                data-testid="auth-name-input"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full"
              required
              data-testid="auth-email-input"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-2">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pr-10"
                required
                data-testid="auth-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white"
              >
                {showPassword ? <EyeSlash size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-negative text-sm p-3 bg-negative/10 rounded" data-testid="auth-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full rounded font-bold text-sm uppercase tracking-wider disabled:opacity-50"
            data-testid="auth-submit-btn"
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <p className="text-center text-white/60 mt-6 text-sm">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-primary hover:text-primary-hover ml-2 font-semibold"
            data-testid="auth-toggle-btn"
          >
            {isLogin ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function TopBar({ user, onLogout }) {
  return (
    <header className="h-14 border-b border-white/10 flex items-center justify-between px-4" style={{ backgroundColor: '#121212' }}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
          <Lightning size={18} weight="fill" />
        </div>
        <span className="font-heading font-bold text-lg tracking-tight">NEXUS TRADER</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <CreditCard size={18} className="text-primary" />
          <span className="font-mono-nums">{user.credits.toFixed(0)}</span>
          <span className="text-white/60">credits</span>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-white/5">
          <User size={18} />
          <span className="text-sm font-medium">{user.name}</span>
        </div>

        <button
          onClick={onLogout}
          className="p-2 hover:bg-white/10 rounded transition-colors"
          data-testid="logout-btn"
        >
          <SignOut size={20} />
        </button>
      </div>
    </header>
  );
}

function PriceTicker({ prices, selectedSymbol, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {prices.map((ticker) => (
        <button
          key={ticker.symbol}
          onClick={() => onSelect(ticker.symbol)}
          className={`card px-4 py-3 flex-shrink-0 transition-all ${
            selectedSymbol === ticker.symbol ? 'border-primary' : ''
          }`}
          data-testid={`ticker-${ticker.symbol.replace('/', '-')}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <CurrencyBtc size={16} className="text-primary" />
            <span className="font-bold text-sm">{ticker.symbol.split('/')[0]}</span>
          </div>
          <div className="font-mono-nums text-lg font-bold">${formatPrice(ticker.price)}</div>
          <div className={`text-xs font-mono-nums ${ticker.change24h >= 0 ? 'text-positive' : 'text-negative'}`}>
            {formatChange(ticker.change24h)}
          </div>
        </button>
      ))}
    </div>
  );
}

function PriceChart({ symbol, data }) {
  const chartData = data.map((candle, i) => ({
    time: new Date(candle.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    price: candle.close,
    volume: candle.volume
  }));

  return (
    <div className="card p-4 h-[400px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold text-lg">{symbol} Price Chart</h3>
        <div className="flex gap-2 text-xs">
          {['1H', '4H', '1D', '1W'].map((tf) => (
            <button key={tf} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors">
              {tf}
            </button>
          ))}
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#007AFF" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#007AFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="time" 
            stroke="rgba(255,255,255,0.3)" 
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.3)" 
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            tickFormatter={(val) => formatPrice(val, 0)}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#121212', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            itemStyle={{ color: '#007AFF' }}
            formatter={(val) => ['$' + formatPrice(val), 'Price']}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke="#007AFF" 
            strokeWidth={2}
            fill="url(#priceGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function OrderBook({ orderbook }) {
  if (!orderbook) return null;

  const maxVolume = Math.max(
    ...orderbook.asks.map(([, v]) => v),
    ...orderbook.bids.map(([, v]) => v)
  );

  return (
    <div className="card p-4">
      <h3 className="font-heading font-bold mb-4">Order Book</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/60 mb-2">Asks (Sell)</div>
          <div className="space-y-1">
            {orderbook.asks.slice(0, 10).map(([price, volume], i) => (
              <div key={i} className="relative flex justify-between text-xs font-mono-nums">
                <div 
                  className="absolute inset-0 bg-negative/10" 
                  style={{ width: `${(volume / maxVolume) * 100}%` }}
                />
                <span className="relative text-negative">{formatPrice(price)}</span>
                <span className="relative text-white/60">{volume.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-white/60 mb-2">Bids (Buy)</div>
          <div className="space-y-1">
            {orderbook.bids.slice(0, 10).map(([price, volume], i) => (
              <div key={i} className="relative flex justify-between text-xs font-mono-nums">
                <div 
                  className="absolute inset-0 bg-positive/10" 
                  style={{ width: `${(volume / maxVolume) * 100}%` }}
                />
                <span className="relative text-positive">{formatPrice(price)}</span>
                <span className="relative text-white/60">{volume.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TradingPanel({ symbol, ticker, portfolio, onTrade }) {
  const [side, setSide] = useState('buy');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const baseAsset = symbol.split('/')[0];
  const price = ticker?.price || 0;
  const total = (parseFloat(amount) || 0) * price;

  const handleTrade = async () => {
    if (!amount || parseFloat(amount) <= 0) return;
    setLoading(true);
    try {
      await onTrade({ symbol, side, amount: parseFloat(amount) });
      setAmount('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-4">
      <h3 className="font-heading font-bold mb-4">Trade {baseAsset}</h3>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSide('buy')}
          className={`flex-1 py-2 rounded font-bold text-sm ${
            side === 'buy' ? 'btn-buy' : 'bg-white/5 text-white/60'
          }`}
          data-testid="trade-buy-btn"
        >
          <ArrowUp size={16} className="inline mr-1" /> BUY
        </button>
        <button
          onClick={() => setSide('sell')}
          className={`flex-1 py-2 rounded font-bold text-sm ${
            side === 'sell' ? 'btn-sell' : 'bg-white/5 text-white/60'
          }`}
          data-testid="trade-sell-btn"
        >
          <ArrowDown size={16} className="inline mr-1" /> SELL
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs uppercase tracking-wider text-white/60 mb-2">Amount ({baseAsset})</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full"
            step="0.0001"
            min="0"
            data-testid="trade-amount-input"
          />
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-white/60">Price</span>
          <span className="font-mono-nums">${formatPrice(price)}</span>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-white/60">Total</span>
          <span className="font-mono-nums font-bold">${formatPrice(total)}</span>
        </div>

        <div className="text-xs text-white/40 p-2 bg-white/5 rounded">
          Available: {side === 'buy' 
            ? `$${formatPrice(portfolio?.availableUSDT || 0)} USDT`
            : `${(portfolio?.balances?.[baseAsset] || 0).toFixed(6)} ${baseAsset}`
          }
        </div>

        <button
          onClick={handleTrade}
          disabled={loading || !amount}
          className={`w-full py-3 rounded font-bold ${side === 'buy' ? 'btn-buy' : 'btn-sell'} disabled:opacity-50`}
          data-testid="trade-submit-btn"
        >
          {loading ? 'Processing...' : `${side.toUpperCase()} ${baseAsset}`}
        </button>
      </div>
    </div>
  );
}

function PortfolioPanel({ portfolio }) {
  if (!portfolio) return null;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold">Portfolio</h3>
        <Wallet size={20} className="text-primary" />
      </div>

      <div className="mb-4">
        <div className="text-xs uppercase tracking-wider text-white/60 mb-1">Total Value</div>
        <div className="text-2xl font-bold font-mono-nums">${formatPrice(portfolio.totalValue)}</div>
      </div>

      <div className="space-y-2">
        {Object.entries(portfolio.balances || {}).map(([asset, amount]) => (
          <div key={asset} className="flex justify-between text-sm">
            <span className="text-white/60">{asset}</span>
            <span className="font-mono-nums">{amount.toFixed(asset === 'USDT' ? 2 : 6)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IndicatorsPanel({ analysis }) {
  if (!analysis || analysis.error) return null;

  const indicators = analysis.indicators;
  const signals = analysis.signals;

  const signalColor = signals?.signal?.includes('BUY') ? 'text-positive' : 
                      signals?.signal?.includes('SELL') ? 'text-negative' : 'text-white/60';

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold">Technical Analysis</h3>
        <Activity size={20} className="text-primary" />
      </div>

      <div className={`text-center p-3 rounded mb-4 ${
        signals?.signal?.includes('BUY') ? 'bg-positive/10' : 
        signals?.signal?.includes('SELL') ? 'bg-negative/10' : 'bg-white/5'
      }`}>
        <div className={`text-xl font-bold ${signalColor}`}>{signals?.signal || 'NEUTRAL'}</div>
        <div className="text-xs text-white/60 mt-1">Confidence: {signals?.bullPct}%</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="p-2 bg-white/5 rounded">
          <div className="text-xs text-white/60">RSI (14)</div>
          <div className={`font-mono-nums font-bold ${
            indicators?.rsi?.value < 30 ? 'text-positive' : 
            indicators?.rsi?.value > 70 ? 'text-negative' : ''
          }`}>
            {indicators?.rsi?.value || '-'}
          </div>
        </div>

        <div className="p-2 bg-white/5 rounded">
          <div className="text-xs text-white/60">MACD</div>
          <div className={`font-mono-nums font-bold ${
            indicators?.macd?.histogram > 0 ? 'text-positive' : 'text-negative'
          }`}>
            {indicators?.macd?.histogram?.toFixed(2) || '-'}
          </div>
        </div>

        <div className="p-2 bg-white/5 rounded">
          <div className="text-xs text-white/60">BB Position</div>
          <div className="font-mono-nums font-bold">{indicators?.bollingerBands?.position}%</div>
        </div>

        <div className="p-2 bg-white/5 rounded">
          <div className="text-xs text-white/60">ADX</div>
          <div className="font-mono-nums font-bold">{indicators?.adx?.value || '-'}</div>
        </div>
      </div>

      {signals?.reasons?.length > 0 && (
        <div className="mt-4 space-y-1">
          <div className="text-xs uppercase tracking-wider text-white/60 mb-2">Signals</div>
          {signals.reasons.slice(0, 3).map((r, i) => (
            <div key={i} className={`text-xs p-2 rounded ${
              r.type === 'bullish' ? 'bg-positive/10 text-positive' : 
              r.type === 'bearish' ? 'bg-negative/10 text-negative' : 'bg-white/5'
            }`}>
              {r.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TradeHistory({ trades }) {
  if (!trades?.length) return (
    <div className="card p-4">
      <h3 className="font-heading font-bold mb-4">Recent Trades</h3>
      <div className="text-center text-white/40 py-8">No trades yet</div>
    </div>
  );

  return (
    <div className="card p-4">
      <h3 className="font-heading font-bold mb-4">Recent Trades</h3>
      <div className="overflow-x-auto">
        <table className="w-full table-dense">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Side</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Price</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {trades.slice(0, 10).map((trade, i) => (
              <tr key={i}>
                <td className="font-bold">{trade.symbol}</td>
                <td className={trade.side === 'buy' ? 'text-positive' : 'text-negative'}>
                  {trade.side.toUpperCase()}
                </td>
                <td className="text-right font-mono-nums">{trade.amount.toFixed(6)}</td>
                <td className="text-right font-mono-nums">${formatPrice(trade.price)}</td>
                <td className="text-right font-mono-nums">${formatPrice(trade.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreditsPanel({ user, onBuyCredits }) {
  const packages = [
    { id: 'small', name: 'Starter', credits: 100, price: 9.99 },
    { id: 'medium', name: 'Pro', credits: 500, price: 39.99 },
    { id: 'large', name: 'Enterprise', credits: 2000, price: 99.99 }
  ];

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold">Buy Credits</h3>
        <CreditCard size={20} className="text-primary" />
      </div>

      <div className="text-center mb-4 p-3 bg-white/5 rounded">
        <div className="text-xs text-white/60 mb-1">Current Balance</div>
        <div className="text-2xl font-bold font-mono-nums">{user.credits.toFixed(0)}</div>
      </div>

      <div className="space-y-2">
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            onClick={() => onBuyCredits(pkg.id)}
            className="w-full flex items-center justify-between p-3 rounded bg-white/5 hover:bg-white/10 transition-colors"
            data-testid={`buy-credits-${pkg.id}`}
          >
            <div>
              <div className="font-bold">{pkg.name}</div>
              <div className="text-xs text-white/60">{pkg.credits} credits</div>
            </div>
            <div className="font-mono-nums font-bold text-primary">${pkg.price}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PAYMENT SCREENS
// ═══════════════════════════════════════════════════════════════════

function PaymentSuccess() {
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('Verifying payment...');
  const pollCount = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) {
      setStatus('error');
      setMessage('No session ID found');
      return;
    }

    const pollStatus = async () => {
      try {
        const response = await api.get(`/api/payments/status/${sessionId}`);
        
        if (response.data.payment_status === 'paid') {
          setStatus('success');
          setMessage(`Payment successful! ${response.data.credits_added} credits added.`);
          setTimeout(() => {
            window.location.href = window.location.origin;
          }, 3000);
        } else if (response.data.status === 'expired') {
          setStatus('error');
          setMessage('Payment session expired');
        } else if (pollCount.current < 5) {
          pollCount.current++;
          setTimeout(pollStatus, 2000);
        } else {
          setStatus('pending');
          setMessage('Payment is being processed. Credits will be added shortly.');
        }
      } catch (err) {
        setStatus('error');
        setMessage('Failed to verify payment');
      }
    };

    pollStatus();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#0A0A0A' }}>
      <div className="card p-8 max-w-md text-center animate-fade-in">
        <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
          status === 'success' ? 'bg-positive' : 
          status === 'error' ? 'bg-negative' : 'bg-primary animate-pulse'
        }`}>
          {status === 'success' ? '✓' : status === 'error' ? '✗' : '...'}
        </div>
        <h2 className="font-heading text-xl font-bold mb-2">
          {status === 'success' ? 'Payment Complete!' : 
           status === 'error' ? 'Payment Failed' : 'Processing...'}
        </h2>
        <p className="text-white/60">{message}</p>
        {status !== 'checking' && (
          <button
            onClick={() => window.location.href = window.location.origin}
            className="btn-primary rounded mt-6"
          >
            Return to Dashboard
          </button>
        )}
      </div>
    </div>
  );
}

function PaymentCancel() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#0A0A0A' }}>
      <div className="card p-8 max-w-md text-center animate-fade-in">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-white/10">
          <CreditCard size={32} />
        </div>
        <h2 className="font-heading text-xl font-bold mb-2">Payment Cancelled</h2>
        <p className="text-white/60 mb-6">Your payment was cancelled. No charges were made.</p>
        <button
          onClick={() => window.location.href = window.location.origin}
          className="btn-primary rounded"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════

function Dashboard({ user, onLogout, onUpdateUser }) {
  const [prices, setPrices] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('BTC/USDT');
  const [chartData, setChartData] = useState([]);
  const [orderbook, setOrderbook] = useState(null);
  const [portfolio, setPortfolio] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [trades, setTrades] = useState([]);
  const wsRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tickersRes, portfolioRes, tradesRes] = await Promise.all([
          api.get('/api/market/tickers'),
          api.get('/api/portfolio'),
          api.get('/api/trades')
        ]);
        setPrices(tickersRes.data);
        setPortfolio(portfolioRes.data);
        setTrades(tradesRes.data);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      }
    };
    fetchData();
  }, []);

  // Fetch symbol-specific data
  useEffect(() => {
    const fetchSymbolData = async () => {
      const symbolParam = selectedSymbol.replace('/', '-');
      try {
        const [ohlcvRes, orderbookRes, analysisRes] = await Promise.all([
          api.get(`/api/market/ohlcv/${symbolParam}`),
          api.get(`/api/market/orderbook/${symbolParam}`),
          api.get(`/api/market/analysis/${symbolParam}`)
        ]);
        setChartData(ohlcvRes.data);
        setOrderbook(orderbookRes.data);
        setAnalysis(analysisRes.data);
      } catch (err) {
        console.error('Failed to fetch symbol data:', err);
      }
    };
    fetchSymbolData();
  }, [selectedSymbol]);

  // WebSocket connection
  useEffect(() => {
    const wsUrl = API_URL.replace('https://', 'wss://').replace('http://', 'ws://') + '/api/ws';
    
    const connect = () => {
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event === 'price_update') {
          setPrices(data.data);
        }
      };

      wsRef.current.onclose = () => {
        setTimeout(connect, 3000);
      };
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  const handleTrade = async (tradeData) => {
    try {
      const response = await api.post('/api/trade', {
        symbol: tradeData.symbol,
        side: tradeData.side,
        amount: tradeData.amount,
        order_type: 'market'
      });
      
      setPortfolio(prev => ({ ...prev, balances: response.data.newBalance }));
      
      const portfolioRes = await api.get('/api/portfolio');
      setPortfolio(portfolioRes.data);
      
      const tradesRes = await api.get('/api/trades');
      setTrades(tradesRes.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Trade failed');
    }
  };

  const handleBuyCredits = async (packageId) => {
    try {
      const response = await api.post('/api/payments/checkout', {
        package_id: packageId,
        origin_url: window.location.origin
      });
      window.location.href = response.data.url;
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create checkout');
    }
  };

  const currentTicker = prices.find(p => p.symbol === selectedSymbol);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#0A0A0A' }}>
      <TopBar user={user} onLogout={onLogout} />
      
      <main className="p-4">
        <PriceTicker prices={prices} selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4">
          {/* Main Chart Area */}
          <div className="lg:col-span-3 space-y-4">
            <PriceChart symbol={selectedSymbol} data={chartData} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OrderBook orderbook={orderbook} />
              <TradeHistory trades={trades} />
            </div>
          </div>
          
          {/* Right Sidebar */}
          <div className="space-y-4">
            <TradingPanel 
              symbol={selectedSymbol} 
              ticker={currentTicker}
              portfolio={portfolio}
              onTrade={handleTrade}
            />
            <PortfolioPanel portfolio={portfolio} />
            <IndicatorsPanel analysis={analysis} />
            <CreditsPanel user={user} onBuyCredits={handleBuyCredits} />
          </div>
        </div>
      </main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// APP COMPONENT
// ═══════════════════════════════════════════════════════════════════

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for payment routes
  const path = window.location.pathname;
  if (path === '/payment/success') return <PaymentSuccess />;
  if (path === '/payment/cancel') return <PaymentCancel />;

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await api.get('/api/auth/me');
          setUser(response.data);
        } catch {
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0A0A0A' }}>
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onLogin={setUser} />;
  }

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <Dashboard user={user} onLogout={handleLogout} onUpdateUser={setUser} />
    </AuthContext.Provider>
  );
}

export default App;
