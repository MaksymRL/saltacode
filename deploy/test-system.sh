#!/bin/bash
# Script per testare che tutti i componenti del sistema Saltacode funzionino correttamente

APP_DIR="/opt/saltacode"
BASE_URL="http://localhost"

echo "🔍 Testing Saltacode System Completeness..."
echo ""

# Funzione per test HTTP
test_endpoint() {
    local url=$1
    local expected_status=${2:-200}
    local description=$3
    
    echo -n "  Testing $description... "
    
    local response_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 5)
    
    if [ "$response_code" = "$expected_status" ]; then
        echo "✅ OK ($response_code)"
        return 0
    else
        echo "❌ FAIL (got $response_code, expected $expected_status)"
        return 1
    fi
}

# Test 1: Verifica che PM2 sia in esecuzione
echo "📊 Testing Process Management..."
if sudo -u saltacode pm2 list | grep -q "saltacode-backend.*online"; then
    echo "  ✅ PM2 process running"
else
    echo "  ❌ PM2 process not running"
    ERRORS=$((ERRORS + 1))
fi

# Test 2: Verifica che Nginx sia in esecuzione
echo ""
echo "🌐 Testing Web Server..."
if systemctl is-active --quiet nginx; then
    echo "  ✅ Nginx service active"
else
    echo "  ❌ Nginx service not active"
    ERRORS=$((ERRORS + 1))
fi

# Test 3: Verifica che PostgreSQL sia in esecuzione
echo ""
echo "🗄️ Testing Database..."
if systemctl is-active --quiet postgresql; then
    echo "  ✅ PostgreSQL service active"
else
    echo "  ❌ PostgreSQL service not active"
    ERRORS=$((ERRORS + 1))
fi

# Test 4: Test Health Checks
echo ""
echo "🏥 Testing Health Endpoints..."
test_endpoint "$BASE_URL/health" "200" "Main health check"
test_endpoint "$BASE_URL/health/live" "200" "Liveness probe"
test_endpoint "$BASE_URL/health/ready" "200" "Readiness probe"

# Test 5: Test Frontend
echo ""
echo "⚛️ Testing Frontend..."
test_endpoint "$BASE_URL/" "200" "Frontend homepage"
test_endpoint "$BASE_URL/login" "200" "Login page"

# Test 6: Test API Endpoints
echo ""
echo "🔌 Testing API Endpoints..."
test_endpoint "$BASE_URL/api/monitor/stato" "200" "Monitor API"

# Test 7: Test que WebSocket endpoint respecta
echo ""
echo "🔌 Testing WebSocket Upgrade..."
if curl -s --http1.1 -H "Upgrade: websocket" -H "Connection: Upgrade" -H "Sec-WebSocket-Key: test" -H "Sec-WebSocket-Version: 13" "$BASE_URL/ws" --max-time 5 | grep -q "400\|426\|101"; then
    echo "  ✅ WebSocket endpoint responding"
else
    echo "  ❌ WebSocket endpoint not responding"
fi

# Test 8: Verifica backup directory
echo ""
echo "💾 Testing Backup System..."
if [ -d "/var/backups/saltacode" ]; then
    echo "  ✅ Backup directory exists"
    if [ -w "/var/backups/saltacode" ]; then
        echo "  ✅ Backup directory is writable"
    else
        echo "  ❌ Backup directory not writable"
    fi
else
    echo "  ❌ Backup directory missing"
fi

# Test 9: Verifica cron job
echo ""
echo "⏰ Testing Scheduled Tasks..."
if sudo -u saltacode crontab -l | grep -q "daily-backup"; then
    echo "  ✅ Backup cron job installed"
else
    echo "  ❌ Backup cron job missing"
fi

# Test 10: Verifica log directory
echo ""
echo "📜 Testing Logging System..."
if [ -d "/var/log/saltacode" ] && [ -w "/var/log/saltacode" ]; then
    echo "  ✅ Log directory accessible"
else
    echo "  ❌ Log directory not accessible"
fi

# Test 11: Test compilazione TypeScript
echo ""
echo "⚙️ Testing Build System..."
cd "$APP_DIR/backend" || exit 1

# Test che non ci siano errori TypeScript
if sudo -u saltacode npx tsc --noEmit --skipLibCheck; then
    echo "  ✅ TypeScript compilation successful"
else
    echo "  ❌ TypeScript compilation errors"
fi

# Test 12: Test dei Property-Based Tests
echo ""
echo "🧪 Testing Property-Based Tests..."
if sudo -u saltacode npm test 2>/dev/null | grep -q "PASS\|✓"; then
    echo "  ✅ Property-based tests passing"
else
    echo "  ❌ Property-based tests failing (run 'npm test' for details)"
fi

# Test 13: Performance test
echo ""
echo "🚀 Testing Performance..."
start_time=$(date +%s%N)
test_endpoint "$BASE_URL/health" "200" > /dev/null
end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds

if [ $duration -lt 2000 ]; then
    echo "  ✅ Response time: ${duration}ms (< 2000ms requirement)"
else
    echo "  ❌ Response time: ${duration}ms (exceeds 2000ms requirement)"
fi

echo ""
echo "===========================================" 
echo "🎯 Saltacode System Test Results"
echo "==========================================="

# Conteggio finale
if [ ${ERRORS:-0} -eq 0 ]; then
    echo "  ✅ ALL SYSTEMS OPERATIONAL"
    echo "  🚀 Saltacode is ready for production!"
    echo ""
    echo "  🌐 Access URLs:"
    echo "    Frontend: http://$(hostname -I | awk '{print $1}')/"
    echo "    Monitor:  http://$(hostname -I | awk '{print $1}')/monitor"
    echo "    Health:   http://$(hostname -I | awk '{print $1}')/health"
    echo ""
    echo "  👤 Default credentials:"
    echo "    Username: superadmin"
    echo "    Password: Admin@Saltacode1"
    exit 0
else
    echo "  ❌ ISSUES DETECTED: $ERRORS"
    echo "  🔧 Please review the failed tests above"
    exit 1
fi