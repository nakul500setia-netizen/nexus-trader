"""
NEXUS TRADER Backend — FastAPI Server
AI-powered crypto trading platform with auth, payments, and real-time data
"""

import os
import asyncio
import random
import json
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Literal
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError
from pymongo import MongoClient
from dotenv import load_dotenv
from bson import ObjectId

load_dotenv()

# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 1440))

# MongoDB Setup
client = MongoClient(MONGO_URL)
db = client[DB_NAME]

# Collections
users_collection = db["users"]
transactions_collection = db["payment_transactions"]
trades_collection = db["trades"]
portfolios_collection = db["portfolios"]

# Password Hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# ═══════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    credits: float
    created_at: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class TradeRequest(BaseModel):
    symbol: str
    side: str  # buy or sell
    amount: float
    order_type: str = "market"  # market or limit
    limit_price: Optional[float] = None

class CheckoutRequest(BaseModel):
    package_id: str  # small, medium, large
    origin_url: str

class CheckoutStatusRequest(BaseModel):
    session_id: str

class LLMProviderConfig(BaseModel):
    name: str
    provider_type: Literal["openai", "anthropic", "openai_compatible", "custom"]
    model: str
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    enabled: bool = True
    system_prompt: Optional[str] = None
    extra_headers: Dict[str, str] = Field(default_factory=dict)

class LLMQueryRequest(BaseModel):
    prompt: str = Field(min_length=1)
    providers: List[LLMProviderConfig]
    max_tokens: int = 700
    temperature: float = 0.2

# ═══════════════════════════════════════════════════════════════════
# AUTH HELPERS
# ═══════════════════════════════════════════════════════════════════

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "credits": user.get("credits", 0)
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ═══════════════════════════════════════════════════════════════════
# MOCK MARKET DATA
# ═══════════════════════════════════════════════════════════════════

CRYPTO_PRICES = {
    "BTC/USDT": {"price": 94800, "change": 2.34, "high": 96500, "low": 93200, "volume": 45678},
    "ETH/USDT": {"price": 3280, "change": -1.12, "high": 3350, "low": 3210, "volume": 123456},
    "SOL/USDT": {"price": 178, "change": 5.67, "high": 185, "low": 168, "volume": 78901},
    "BNB/USDT": {"price": 612, "change": 0.89, "high": 625, "low": 598, "volume": 34567},
    "XRP/USDT": {"price": 2.34, "change": -0.45, "high": 2.42, "low": 2.28, "volume": 98765},
}

def get_mock_ticker(symbol: str) -> dict:
    base = CRYPTO_PRICES.get(symbol, {"price": 100, "change": 0, "high": 105, "low": 95, "volume": 10000})
    volatility = base["price"] * 0.002
    price = base["price"] + random.uniform(-volatility, volatility)
    return {
        "symbol": symbol,
        "price": round(price, 4),
        "change24h": round(base["change"] + random.uniform(-0.5, 0.5), 2),
        "high": round(base["high"], 2),
        "low": round(base["low"], 2),
        "volume": round(base["volume"] * (1 + random.uniform(-0.1, 0.1)), 2),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

def get_mock_ohlcv(symbol: str, limit: int = 100) -> list:
    base = CRYPTO_PRICES.get(symbol, {"price": 100})
    price = base["price"]
    candles = []
    now = datetime.now(timezone.utc)
    
    for i in range(limit):
        ts = now - timedelta(hours=limit - i)
        vol = price * 0.02
        open_p = price
        close_p = price + random.uniform(-vol, vol)
        high_p = max(open_p, close_p) + random.uniform(0, vol * 0.5)
        low_p = min(open_p, close_p) - random.uniform(0, vol * 0.5)
        price = close_p
        
        candles.append({
            "timestamp": ts.isoformat(),
            "open": round(open_p, 4),
            "high": round(high_p, 4),
            "low": round(low_p, 4),
            "close": round(close_p, 4),
            "volume": round(random.uniform(100, 1000), 2)
        })
    
    return candles

def get_mock_orderbook(symbol: str) -> dict:
    base = CRYPTO_PRICES.get(symbol, {"price": 100})
    mid = base["price"]
    asks = [[round(mid * (1 + 0.0002 * (i + 1)), 4), round(random.uniform(0.1, 5), 4)] for i in range(15)]
    bids = [[round(mid * (1 - 0.0002 * (i + 1)), 4), round(random.uniform(0.1, 5), 4)] for i in range(15)]
    return {"asks": asks, "bids": bids, "timestamp": datetime.now(timezone.utc).isoformat()}

def compute_mock_indicators(candles: list) -> dict:
    closes = [c["close"] for c in candles]
    if len(closes) < 50:
        return {"error": "Insufficient data"}
    
    # Simple mock indicators
    avg_price = sum(closes[-14:]) / 14
    rsi = 50 + random.uniform(-20, 20)
    
    return {
        "price": closes[-1],
        "indicators": {
            "rsi": {"value": round(rsi, 2), "prev": round(rsi + random.uniform(-2, 2), 2)},
            "macd": {
                "macd": round(random.uniform(-50, 50), 4),
                "signal": round(random.uniform(-50, 50), 4),
                "histogram": round(random.uniform(-10, 10), 4),
                "crossover": random.choice([True, False]),
                "crossunder": random.choice([True, False])
            },
            "bollingerBands": {
                "upper": round(avg_price * 1.02, 2),
                "middle": round(avg_price, 2),
                "lower": round(avg_price * 0.98, 2),
                "position": round(random.uniform(10, 90), 1),
                "squeeze": random.choice([True, False])
            },
            "ema": {
                "ema9": round(avg_price * 1.001, 2),
                "ema20": round(avg_price * 0.999, 2),
                "ema50": round(avg_price * 0.995, 2),
                "ema200": round(avg_price * 0.99, 2)
            },
            "adx": {"value": round(random.uniform(15, 45), 2), "plusDI": round(random.uniform(10, 40), 2), "minusDI": round(random.uniform(10, 40), 2)},
            "atr": {"value": round(avg_price * 0.015, 4), "pct": round(1.5, 3)},
            "stochRSI": {"k": round(random.uniform(10, 90), 2), "d": round(random.uniform(10, 90), 2)},
            "vwap": round(avg_price, 4),
            "volume": {"current": round(random.uniform(100, 500), 2), "ratio": round(random.uniform(0.5, 2), 2), "trend": random.choice(["high", "normal", "low"])}
        },
        "patterns": [],
        "signals": {
            "signal": random.choice(["STRONG BUY", "BUY", "NEUTRAL", "SELL", "STRONG SELL"]),
            "strength": random.choice(["strong", "moderate", "weak"]),
            "bullScore": random.randint(20, 80),
            "bearScore": random.randint(20, 80),
            "bullPct": random.randint(30, 70),
            "reasons": [
                {"indicator": "RSI", "message": f"RSI at {round(rsi, 1)}", "type": "neutral"},
                {"indicator": "MACD", "message": "MACD momentum building", "type": "bullish"}
            ]
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# ═══════════════════════════════════════════════════════════════════
# WEBSOCKET MANAGER
# ═══════════════════════════════════════════════════════════════════

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.price_task = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        if self.price_task is None or self.price_task.done():
            self.price_task = asyncio.create_task(self.broadcast_prices())

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections[:]:
            try:
                await connection.send_json(message)
            except:
                self.disconnect(connection)

    async def broadcast_prices(self):
        symbols = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"]
        while self.active_connections:
            updates = [get_mock_ticker(s) for s in symbols]
            await self.broadcast({"event": "price_update", "data": updates, "timestamp": datetime.now(timezone.utc).isoformat()})
            await asyncio.sleep(2)

manager = ConnectionManager()

# ═══════════════════════════════════════════════════════════════════
# LLM ORCHESTRATION
# ═══════════════════════════════════════════════════════════════════

def _estimate_quality(prompt: str, answer: str) -> float:
    if not answer:
        return 0.0

    prompt_terms = {w.lower() for w in prompt.split() if len(w) > 2}
    answer_terms = {w.lower() for w in answer.split() if len(w) > 2}
    overlap = len(prompt_terms & answer_terms)
    overlap_score = min(40, overlap * 4)
    length_score = min(45, len(answer) / 30)
    structure_bonus = 15 if "\n" in answer or "." in answer else 0
    return round(overlap_score + length_score + structure_bonus, 2)


async def _query_provider(provider: LLMProviderConfig, prompt: str, max_tokens: int, temperature: float) -> dict:
    if not provider.enabled:
        return {"provider": provider.name, "status": "skipped", "reason": "disabled"}

    if not provider.api_key:
        return {
            "provider": provider.name,
            "status": "error",
            "error": "Missing API key. Add a key in the dashboard to query this provider."
        }

    request_headers = dict(provider.extra_headers or {})
    provider_type = provider.provider_type
    timeout = httpx.Timeout(35.0, connect=8.0)

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            if provider_type in {"openai", "openai_compatible"}:
                base_url = provider.base_url or "https://api.openai.com/v1"
                url = f"{base_url.rstrip('/')}/chat/completions"
                request_headers["Authorization"] = f"Bearer {provider.api_key}"
                request_headers["Content-Type"] = "application/json"
                messages = []
                if provider.system_prompt:
                    messages.append({"role": "system", "content": provider.system_prompt})
                messages.append({"role": "user", "content": prompt})

                payload = {
                    "model": provider.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens
                }
                response = await client.post(url, headers=request_headers, json=payload)
                response.raise_for_status()
                data = response.json()
                answer = data["choices"][0]["message"]["content"].strip()

            elif provider_type == "anthropic":
                base_url = provider.base_url or "https://api.anthropic.com/v1/messages"
                request_headers["x-api-key"] = provider.api_key
                request_headers["anthropic-version"] = "2023-06-01"
                request_headers["content-type"] = "application/json"

                payload = {
                    "model": provider.model,
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                    "messages": [{"role": "user", "content": prompt}]
                }
                if provider.system_prompt:
                    payload["system"] = provider.system_prompt

                response = await client.post(base_url, headers=request_headers, json=payload)
                response.raise_for_status()
                data = response.json()
                text_blocks = [block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"]
                answer = "\n".join([t for t in text_blocks if t]).strip()

            else:  # custom provider
                if not provider.base_url:
                    raise HTTPException(status_code=400, detail=f"{provider.name}: base_url is required for custom providers")
                request_headers["Authorization"] = f"Bearer {provider.api_key}"
                request_headers["Content-Type"] = "application/json"
                payload = {
                    "model": provider.model,
                    "prompt": prompt,
                    "temperature": temperature,
                    "max_tokens": max_tokens
                }
                response = await client.post(provider.base_url, headers=request_headers, json=payload)
                response.raise_for_status()
                data = response.json()
                answer = data.get("text") or data.get("output") or data.get("response") or ""

            score = _estimate_quality(prompt, answer)
            return {
                "provider": provider.name,
                "provider_type": provider.provider_type,
                "model": provider.model,
                "status": "ok",
                "score": score,
                "response": answer
            }
    except httpx.HTTPStatusError as exc:
        return {
            "provider": provider.name,
            "provider_type": provider.provider_type,
            "model": provider.model,
            "status": "error",
            "error": f"HTTP {exc.response.status_code}: {exc.response.text[:240]}"
        }
    except Exception as exc:
        return {
            "provider": provider.name,
            "provider_type": provider.provider_type,
            "model": provider.model,
            "status": "error",
            "error": str(exc)
        }

# ═══════════════════════════════════════════════════════════════════
# STRIPE INTEGRATION
# ═══════════════════════════════════════════════════════════════════

from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest, CheckoutSessionResponse, CheckoutStatusResponse

STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")

# Credit Packages (prices in USD)
CREDIT_PACKAGES = {
    "small": {"credits": 100, "amount": 9.99, "name": "Starter Pack"},
    "medium": {"credits": 500, "amount": 39.99, "name": "Pro Pack"},
    "large": {"credits": 2000, "amount": 99.99, "name": "Enterprise Pack"}
}

# ═══════════════════════════════════════════════════════════════════
# APP LIFESPAN
# ═══════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create indexes
    users_collection.create_index("email", unique=True)
    transactions_collection.create_index("session_id", unique=True)
    yield
    # Shutdown
    client.close()

# ═══════════════════════════════════════════════════════════════════
# FASTAPI APP
# ═══════════════════════════════════════════════════════════════════

app = FastAPI(title="NEXUS TRADER API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════════════════════════════════════════
# ROUTES: HEALTH
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "NEXUS TRADER", "timestamp": datetime.now(timezone.utc).isoformat()}

# ═══════════════════════════════════════════════════════════════════
# ROUTES: AUTH
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    existing = users_collection.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_doc = {
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "name": user_data.name,
        "credits": 50.0,  # Free starting credits
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = users_collection.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create initial portfolio
    portfolios_collection.insert_one({
        "user_id": user_id,
        "balances": {"USDT": 10000.0},  # Demo balance
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    token = create_access_token(data={"sub": user_id})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user_id,
            email=user_data.email,
            name=user_data.name,
            credits=50.0,
            created_at=user_doc["created_at"]
        )
    )

@app.post("/api/auth/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    user = users_collection.find_one({"email": user_data.email})
    if not user or not verify_password(user_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user_id = str(user["_id"])
    token = create_access_token(data={"sub": user_id})
    
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user_id,
            email=user["email"],
            name=user["name"],
            credits=user.get("credits", 0),
            created_at=user.get("created_at", "")
        )
    )

@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    user = users_collection.find_one({"_id": ObjectId(current_user["id"])})
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        name=user["name"],
        credits=user.get("credits", 0),
        created_at=user.get("created_at", "")
    )

# ═══════════════════════════════════════════════════════════════════
# ROUTES: MARKET DATA
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/market/ticker/{symbol}")
async def get_ticker(symbol: str):
    symbol = symbol.replace("-", "/")
    return get_mock_ticker(symbol)

@app.get("/api/market/tickers")
async def get_all_tickers():
    return [get_mock_ticker(s) for s in CRYPTO_PRICES.keys()]

@app.get("/api/market/ohlcv/{symbol}")
async def get_ohlcv(symbol: str, limit: int = 100):
    symbol = symbol.replace("-", "/")
    return get_mock_ohlcv(symbol, limit)

@app.get("/api/market/orderbook/{symbol}")
async def get_orderbook(symbol: str):
    symbol = symbol.replace("-", "/")
    return get_mock_orderbook(symbol)

@app.get("/api/market/analysis/{symbol}")
async def get_analysis(symbol: str):
    symbol = symbol.replace("-", "/")
    candles = get_mock_ohlcv(symbol, 200)
    return compute_mock_indicators(candles)

# ═══════════════════════════════════════════════════════════════════
# ROUTES: TRADING
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/portfolio")
async def get_portfolio(current_user: dict = Depends(get_current_user)):
    portfolio = portfolios_collection.find_one({"user_id": current_user["id"]})
    if not portfolio:
        portfolio = {
            "user_id": current_user["id"],
            "balances": {"USDT": 10000.0},
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        portfolios_collection.insert_one(portfolio)
    
    balances = portfolio.get("balances", {"USDT": 10000.0})
    
    # Calculate portfolio value
    total_value = balances.get("USDT", 0)
    positions = []
    
    for asset, amount in balances.items():
        if asset != "USDT" and amount > 0:
            ticker = get_mock_ticker(f"{asset}/USDT")
            value = amount * ticker["price"]
            total_value += value
            positions.append({
                "asset": asset,
                "amount": round(amount, 6),
                "value": round(value, 2),
                "price": ticker["price"],
                "change24h": ticker["change24h"]
            })
    
    return {
        "balances": {k: round(v, 6) for k, v in balances.items() if v > 0},
        "positions": positions,
        "totalValue": round(total_value, 2),
        "availableUSDT": round(balances.get("USDT", 0), 2)
    }

@app.post("/api/trade")
async def place_trade(trade: TradeRequest, current_user: dict = Depends(get_current_user)):
    portfolio = portfolios_collection.find_one({"user_id": current_user["id"]})
    if not portfolio:
        raise HTTPException(status_code=400, detail="Portfolio not found")
    
    balances = portfolio.get("balances", {"USDT": 10000.0})
    ticker = get_mock_ticker(trade.symbol)
    price = ticker["price"]
    base_asset = trade.symbol.split("/")[0]
    
    if trade.side == "buy":
        cost = trade.amount * price
        if balances.get("USDT", 0) < cost:
            raise HTTPException(status_code=400, detail="Insufficient USDT balance")
        balances["USDT"] = balances.get("USDT", 0) - cost
        balances[base_asset] = balances.get(base_asset, 0) + trade.amount
    else:
        if balances.get(base_asset, 0) < trade.amount:
            raise HTTPException(status_code=400, detail=f"Insufficient {base_asset} balance")
        balances[base_asset] = balances.get(base_asset, 0) - trade.amount
        balances["USDT"] = balances.get("USDT", 0) + (trade.amount * price)
    
    portfolios_collection.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"balances": balances}}
    )
    
    trade_doc = {
        "user_id": current_user["id"],
        "symbol": trade.symbol,
        "side": trade.side,
        "amount": trade.amount,
        "price": price,
        "total": round(trade.amount * price, 2),
        "order_type": trade.order_type,
        "status": "filled",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    trades_collection.insert_one(trade_doc)
    
    return {
        "status": "filled",
        "trade": {
            "symbol": trade.symbol,
            "side": trade.side,
            "amount": trade.amount,
            "price": price,
            "total": round(trade.amount * price, 2)
        },
        "newBalance": {k: round(v, 6) for k, v in balances.items() if v > 0}
    }

@app.get("/api/trades")
async def get_trade_history(current_user: dict = Depends(get_current_user)):
    trades = list(trades_collection.find({"user_id": current_user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50))
    return trades

# ═══════════════════════════════════════════════════════════════════
# ROUTES: LLM AGGREGATOR
# ═══════════════════════════════════════════════════════════════════

@app.post("/api/llm/query")
async def query_multiple_llms(request: LLMQueryRequest, current_user: dict = Depends(get_current_user)):
    if not request.providers:
        raise HTTPException(status_code=400, detail="At least one provider must be configured")

    active_providers = [p for p in request.providers if p.enabled]
    if not active_providers:
        raise HTTPException(status_code=400, detail="Enable at least one provider")

    tasks = [
        _query_provider(
            provider=provider,
            prompt=request.prompt,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        for provider in active_providers
    ]
    results = await asyncio.gather(*tasks)
    successful = [r for r in results if r.get("status") == "ok" and r.get("response")]
    best_result = max(successful, key=lambda r: r.get("score", 0), default=None)

    return {
        "prompt": request.prompt,
        "total_providers": len(active_providers),
        "successful_providers": len(successful),
        "best_result": best_result,
        "results": sorted(results, key=lambda r: r.get("score", 0), reverse=True),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# ═══════════════════════════════════════════════════════════════════
# ROUTES: PAYMENTS (STRIPE)
# ═══════════════════════════════════════════════════════════════════

@app.get("/api/payments/packages")
async def get_packages():
    return CREDIT_PACKAGES

@app.post("/api/payments/checkout")
async def create_checkout(request: CheckoutRequest, http_request: Request, current_user: dict = Depends(get_current_user)):
    if request.package_id not in CREDIT_PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid package")
    
    package = CREDIT_PACKAGES[request.package_id]
    host_url = str(http_request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    success_url = f"{request.origin_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{request.origin_url}/payment/cancel"
    
    checkout_request = CheckoutSessionRequest(
        amount=float(package["amount"]),
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current_user["id"],
            "package_id": request.package_id,
            "credits": str(package["credits"])
        }
    )
    
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create transaction record
    transactions_collection.insert_one({
        "session_id": session.session_id,
        "user_id": current_user["id"],
        "package_id": request.package_id,
        "amount": package["amount"],
        "currency": "usd",
        "credits": package["credits"],
        "status": "pending",
        "payment_status": "initiated",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"url": session.url, "session_id": session.session_id}

@app.get("/api/payments/status/{session_id}")
async def get_payment_status(session_id: str, http_request: Request, current_user: dict = Depends(get_current_user)):
    transaction = transactions_collection.find_one({"session_id": session_id, "user_id": current_user["id"]})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If already processed, return cached status
    if transaction.get("payment_status") == "paid":
        return {
            "status": transaction["status"],
            "payment_status": transaction["payment_status"],
            "credits_added": transaction.get("credits", 0)
        }
    
    # Check with Stripe
    host_url = str(http_request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    try:
        checkout_status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
        
        # Update transaction
        new_status = "complete" if checkout_status.payment_status == "paid" else checkout_status.status
        transactions_collection.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": new_status,
                "payment_status": checkout_status.payment_status,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Add credits if paid and not already processed
        if checkout_status.payment_status == "paid" and transaction.get("payment_status") != "paid":
            users_collection.update_one(
                {"_id": ObjectId(current_user["id"])},
                {"$inc": {"credits": transaction["credits"]}}
            )
        
        return {
            "status": new_status,
            "payment_status": checkout_status.payment_status,
            "credits_added": transaction["credits"] if checkout_status.payment_status == "paid" else 0
        }
    except Exception as e:
        return {
            "status": transaction["status"],
            "payment_status": transaction.get("payment_status", "unknown"),
            "error": str(e)
        }

@app.post("/api/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    try:
        host_url = str(request.base_url).rstrip("/")
        webhook_url = f"{host_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        
        if webhook_response.payment_status == "paid":
            session_id = webhook_response.session_id
            transaction = transactions_collection.find_one({"session_id": session_id})
            
            if transaction and transaction.get("payment_status") != "paid":
                transactions_collection.update_one(
                    {"session_id": session_id},
                    {"$set": {
                        "status": "complete",
                        "payment_status": "paid",
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                users_collection.update_one(
                    {"_id": ObjectId(transaction["user_id"])},
                    {"$inc": {"credits": transaction["credits"]}}
                )
        
        return {"received": True}
    except Exception as e:
        return {"received": True, "error": str(e)}

# ═══════════════════════════════════════════════════════════════════
# WEBSOCKET
# ═══════════════════════════════════════════════════════════════════

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    await websocket.send_json({"event": "connected", "data": {"message": "NEXUS TRADER WebSocket ready"}})
    
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            
            if msg.get("type") == "ping":
                await websocket.send_json({"event": "pong", "timestamp": datetime.now(timezone.utc).isoformat()})
            elif msg.get("type") == "subscribe":
                await websocket.send_json({"event": "subscribed", "data": {"symbols": msg.get("symbols", [])}})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
