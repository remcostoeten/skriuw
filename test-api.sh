#!/bin/bash
echo "Testing API endpoints..."

echo -e "\n1. Testing health endpoint:"
curl -s http://localhost:3000/api/health | jq '.' || echo "Failed or not JSON"

echo -e "\n2. Testing notes endpoint:"
curl -s http://localhost:3000/api/notes | jq '.' || echo "Failed or not JSON"

echo -e "\n3. Checking if vercel dev is running:"
ps aux | grep "vercel dev" | grep -v grep || echo "Vercel dev is not running"
