#!/usr/bin/env python3
"""
NEXUS TRADER Backend API Testing
Tests all endpoints for the crypto trading platform
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class NexusTraderAPITester:
    def __init__(self, base_url: str = "https://build-automation-3.preview.emergentagent.com"):
        self.base_url = base_url.rstrip('/')
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test user credentials
        self.test_user = {
            "email": "testuser2@nexustrader.com",
            "password": "SecurePass456",
            "name": "Test User 2"
        }

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}: PASSED")
        else:
            print(f"❌ {name}: FAILED - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details,
            "response_data": response_data
        })

    def make_request(self, method: str, endpoint: str, data: Dict = None, headers: Dict = None) -> tuple:
        """Make HTTP request and return (success, response_data, status_code)"""
        url = f"{self.base_url}{endpoint}"
        
        # Default headers
        req_headers = {'Content-Type': 'application/json'}
        if self.token:
            req_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            req_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=req_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=req_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=req_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=req_headers, timeout=30)
            else:
                return False, {"error": f"Unsupported method: {method}"}, 0

            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}

            return response.status_code < 400, response_data, response.status_code

        except requests.exceptions.RequestException as e:
            return False, {"error": str(e)}, 0

    def test_health_check(self):
        """Test /api/health endpoint"""
        success, data, status = self.make_request('GET', '/api/health')
        
        if success and status == 200:
            if data.get('status') == 'healthy' and data.get('service') == 'NEXUS TRADER':
                self.log_test("Health Check", True, "Service is healthy")
                return True
            else:
                self.log_test("Health Check", False, "Invalid health response format", data)
        else:
            self.log_test("Health Check", False, f"Status: {status}", data)
        return False

    def test_user_registration(self):
        """Test user registration"""
        success, data, status = self.make_request('POST', '/api/auth/register', self.test_user)
        
        if success and status == 200:
            if 'access_token' in data and 'user' in data:
                self.token = data['access_token']
                self.user_id = data['user']['id']
                self.log_test("User Registration", True, f"User registered with ID: {self.user_id}")
                return True
            else:
                self.log_test("User Registration", False, "Missing token or user in response", data)
        elif status == 400 and 'already registered' in str(data):
            # User already exists, try login instead
            self.log_test("User Registration", True, "User already exists (expected)")
            return self.test_user_login()
        else:
            self.log_test("User Registration", False, f"Status: {status}", data)
        return False

    def test_user_login(self):
        """Test user login"""
        login_data = {
            "email": self.test_user["email"],
            "password": self.test_user["password"]
        }
        success, data, status = self.make_request('POST', '/api/auth/login', login_data)
        
        if success and status == 200:
            if 'access_token' in data and 'user' in data:
                self.token = data['access_token']
                self.user_id = data['user']['id']
                self.log_test("User Login", True, f"Login successful for user: {data['user']['email']}")
                return True
            else:
                self.log_test("User Login", False, "Missing token or user in response", data)
        else:
            self.log_test("User Login", False, f"Status: {status}", data)
        return False

    def test_get_current_user(self):
        """Test GET /api/auth/me"""
        if not self.token:
            self.log_test("Get Current User", False, "No authentication token available")
            return False
            
        success, data, status = self.make_request('GET', '/api/auth/me')
        
        if success and status == 200:
            if 'id' in data and 'email' in data and 'name' in data:
                self.log_test("Get Current User", True, f"Retrieved user: {data['email']}")
                return True
            else:
                self.log_test("Get Current User", False, "Missing required user fields", data)
        else:
            self.log_test("Get Current User", False, f"Status: {status}", data)
        return False

    def test_market_tickers(self):
        """Test GET /api/market/tickers"""
        success, data, status = self.make_request('GET', '/api/market/tickers')
        
        if success and status == 200:
            if isinstance(data, list) and len(data) > 0:
                # Check if first ticker has required fields
                ticker = data[0]
                required_fields = ['symbol', 'price', 'change24h', 'high', 'low', 'volume']
                if all(field in ticker for field in required_fields):
                    self.log_test("Market Tickers", True, f"Retrieved {len(data)} tickers")
                    return True
                else:
                    self.log_test("Market Tickers", False, "Missing required ticker fields", ticker)
            else:
                self.log_test("Market Tickers", False, "Empty or invalid ticker data", data)
        else:
            self.log_test("Market Tickers", False, f"Status: {status}", data)
        return False

    def test_single_ticker(self):
        """Test GET /api/market/ticker/BTC-USDT"""
        success, data, status = self.make_request('GET', '/api/market/ticker/BTC-USDT')
        
        if success and status == 200:
            required_fields = ['symbol', 'price', 'change24h', 'high', 'low', 'volume']
            if all(field in data for field in required_fields):
                self.log_test("Single Ticker", True, f"BTC-USDT price: ${data['price']}")
                return True
            else:
                self.log_test("Single Ticker", False, "Missing required ticker fields", data)
        else:
            self.log_test("Single Ticker", False, f"Status: {status}", data)
        return False

    def test_ohlcv_data(self):
        """Test GET /api/market/ohlcv/BTC-USDT"""
        success, data, status = self.make_request('GET', '/api/market/ohlcv/BTC-USDT')
        
        if success and status == 200:
            if isinstance(data, list) and len(data) > 0:
                candle = data[0]
                required_fields = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
                if all(field in candle for field in required_fields):
                    self.log_test("OHLCV Data", True, f"Retrieved {len(data)} candles")
                    return True
                else:
                    self.log_test("OHLCV Data", False, "Missing required candle fields", candle)
            else:
                self.log_test("OHLCV Data", False, "Empty or invalid OHLCV data", data)
        else:
            self.log_test("OHLCV Data", False, f"Status: {status}", data)
        return False

    def test_orderbook(self):
        """Test GET /api/market/orderbook/BTC-USDT"""
        success, data, status = self.make_request('GET', '/api/market/orderbook/BTC-USDT')
        
        if success and status == 200:
            if 'asks' in data and 'bids' in data and 'timestamp' in data:
                if isinstance(data['asks'], list) and isinstance(data['bids'], list):
                    self.log_test("Order Book", True, f"Asks: {len(data['asks'])}, Bids: {len(data['bids'])}")
                    return True
                else:
                    self.log_test("Order Book", False, "Invalid asks/bids format", data)
            else:
                self.log_test("Order Book", False, "Missing required orderbook fields", data)
        else:
            self.log_test("Order Book", False, f"Status: {status}", data)
        return False

    def test_technical_analysis(self):
        """Test GET /api/market/analysis/BTC-USDT"""
        success, data, status = self.make_request('GET', '/api/market/analysis/BTC-USDT')
        
        if success and status == 200:
            if 'indicators' in data and 'signals' in data:
                indicators = data['indicators']
                if 'rsi' in indicators and 'macd' in indicators:
                    self.log_test("Technical Analysis", True, f"Signal: {data.get('signals', {}).get('signal', 'N/A')}")
                    return True
                else:
                    self.log_test("Technical Analysis", False, "Missing key indicators", data)
            else:
                self.log_test("Technical Analysis", False, "Missing indicators or signals", data)
        else:
            self.log_test("Technical Analysis", False, f"Status: {status}", data)
        return False

    def test_portfolio(self):
        """Test GET /api/portfolio (authenticated)"""
        if not self.token:
            self.log_test("Portfolio", False, "No authentication token available")
            return False
            
        success, data, status = self.make_request('GET', '/api/portfolio')
        
        if success and status == 200:
            required_fields = ['balances', 'totalValue', 'availableUSDT']
            if all(field in data for field in required_fields):
                self.log_test("Portfolio", True, f"Total value: ${data['totalValue']}")
                return True
            else:
                self.log_test("Portfolio", False, "Missing required portfolio fields", data)
        else:
            self.log_test("Portfolio", False, f"Status: {status}", data)
        return False

    def test_place_trade(self):
        """Test POST /api/trade (authenticated)"""
        if not self.token:
            self.log_test("Place Trade", False, "No authentication token available")
            return False
            
        trade_data = {
            "symbol": "BTC/USDT",
            "side": "buy",
            "amount": 0.001,
            "order_type": "market"
        }
        
        success, data, status = self.make_request('POST', '/api/trade', trade_data)
        
        if success and status == 200:
            if 'status' in data and 'trade' in data and 'newBalance' in data:
                self.log_test("Place Trade", True, f"Trade status: {data['status']}")
                return True
            else:
                self.log_test("Place Trade", False, "Missing required trade response fields", data)
        else:
            self.log_test("Place Trade", False, f"Status: {status}", data)
        return False

    def test_trade_history(self):
        """Test GET /api/trades (authenticated)"""
        if not self.token:
            self.log_test("Trade History", False, "No authentication token available")
            return False
            
        success, data, status = self.make_request('GET', '/api/trades')
        
        if success and status == 200:
            if isinstance(data, list):
                self.log_test("Trade History", True, f"Retrieved {len(data)} trades")
                return True
            else:
                self.log_test("Trade History", False, "Invalid trade history format", data)
        else:
            self.log_test("Trade History", False, f"Status: {status}", data)
        return False

    def test_payment_packages(self):
        """Test GET /api/payments/packages"""
        success, data, status = self.make_request('GET', '/api/payments/packages')
        
        if success and status == 200:
            if isinstance(data, dict) and len(data) > 0:
                # Check if packages have required structure
                package_keys = list(data.keys())
                if package_keys and all(isinstance(data[key], dict) for key in package_keys):
                    self.log_test("Payment Packages", True, f"Available packages: {', '.join(package_keys)}")
                    return True
                else:
                    self.log_test("Payment Packages", False, "Invalid package structure", data)
            else:
                self.log_test("Payment Packages", False, "Empty or invalid packages data", data)
        else:
            self.log_test("Payment Packages", False, f"Status: {status}", data)
        return False

    def test_payment_checkout(self):
        """Test POST /api/payments/checkout (authenticated)"""
        if not self.token:
            self.log_test("Payment Checkout", False, "No authentication token available")
            return False
            
        checkout_data = {
            "package_id": "small",
            "origin_url": "https://nexus-trader-4dd49d.preview.emergentagent.com"
        }
        
        success, data, status = self.make_request('POST', '/api/payments/checkout', checkout_data)
        
        if success and status == 200:
            if 'url' in data and 'session_id' in data:
                self.log_test("Payment Checkout", True, f"Checkout session created: {data['session_id'][:20]}...")
                return True
            else:
                self.log_test("Payment Checkout", False, "Missing checkout URL or session ID", data)
        else:
            self.log_test("Payment Checkout", False, f"Status: {status}", data)
        return False

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting NEXUS TRADER API Tests")
        print("=" * 50)
        
        # Health check (no auth required)
        self.test_health_check()
        
        # Authentication tests
        auth_success = self.test_user_registration()
        if not auth_success:
            auth_success = self.test_user_login()
        
        if auth_success:
            self.test_get_current_user()
        
        # Market data tests (no auth required)
        self.test_market_tickers()
        self.test_single_ticker()
        self.test_ohlcv_data()
        self.test_orderbook()
        self.test_technical_analysis()
        
        # Trading tests (auth required)
        if auth_success:
            self.test_portfolio()
            self.test_place_trade()
            self.test_trade_history()
        
        # Payment tests
        self.test_payment_packages()
        if auth_success:
            self.test_payment_checkout()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.tests_passed}/{self.tests_run} passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print(f"❌ {self.tests_run - self.tests_passed} tests failed")
            return 1

    def get_failed_tests(self):
        """Get list of failed tests"""
        return [result for result in self.test_results if not result['success']]

def main():
    """Main test runner"""
    tester = NexusTraderAPITester()
    exit_code = tester.run_all_tests()
    
    # Print failed tests for debugging
    failed_tests = tester.get_failed_tests()
    if failed_tests:
        print("\n🔍 Failed Test Details:")
        for test in failed_tests:
            print(f"  • {test['test']}: {test['details']}")
    
    return exit_code

if __name__ == "__main__":
    sys.exit(main())