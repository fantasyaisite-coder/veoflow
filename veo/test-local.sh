#!/bin/bash

# Local testing script for Puppeteer TLS Proxy

echo "🧪 Testing Puppeteer TLS Proxy locally..."
echo ""

# Check if server is running
echo "1. Health check..."
curl -s http://localhost:3000/health | jq .
echo ""

# List cookies
echo "2. Listing available cookies..."
curl -s http://localhost:3000/cookies | jq .
echo ""

# Full verification (commented out as it launches Chrome)
# echo "3. Running full verification..."
# curl -s -X POST http://localhost:3000/proxy/verify | jq .
# echo ""

echo "✅ Basic tests complete!"
echo ""
echo "To run full verification (launches Chrome):"
echo "  curl -X POST http://localhost:3000/proxy/verify | jq ."
