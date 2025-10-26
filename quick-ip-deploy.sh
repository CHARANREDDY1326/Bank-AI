#!/bin/bash
# quick-ip-update.sh - Fast IP update without full rebuild

set -e

echo "⚡ Quick IP update..."

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] $1${NC}"
}

# Get current IP/DNS
detect_current_endpoint() {
    log "🔍 Detecting current endpoint..."
    
    PUBLIC_IP=$(curl -s --max-time 5 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")
    PUBLIC_DNS=$(curl -s --max-time 5 http://169.254.169.254/latest/meta-data/public-hostname 2>/dev/null || echo "")

    # Choose best endpoint
    if [ ! -z "$PUBLIC_DNS" ] && [[ "$PUBLIC_DNS" == *"compute.amazonaws.com" ]]; then
        NEW_HOST="$PUBLIC_DNS"
        ENDPOINT_TYPE="DNS"
        log "🌐 Using DNS: $NEW_HOST"
    elif [ ! -z "$PUBLIC_IP" ]; then
        NEW_HOST="$PUBLIC_IP"
        ENDPOINT_TYPE="IP"
        log "📍 Using IP: $NEW_HOST"
    else
        echo "❌ Could not detect current endpoint!"
        echo "💡 Try running: ./smart-deploy.sh for full detection"
        exit 1
    fi
}

# Check if update is needed
check_if_update_needed() {
    # Check if .env exists
    if [ ! -f ".env" ]; then
        warn "❌ .env file not found!"
        echo "💡 Run full deployment first: ./smart-deploy.sh"
        exit 1
    fi

    # Get current host from .env
    OLD_HOST=$(grep "EC2_HOST=" .env | cut -d'=' -f2 2>/dev/null || echo "")

    if [ -z "$OLD_HOST" ]; then
        warn "❌ No EC2_HOST found in .env file!"
        echo "💡 Run full deployment: ./smart-deploy.sh"
        exit 1
    fi

    if [ "$OLD_HOST" == "$NEW_HOST" ]; then
        log "✅ IP unchanged ($NEW_HOST) - no update needed"
        echo "🎯 Your app is already configured correctly!"
        echo "📱 Access at: http://$NEW_HOST"
        exit 0
    fi

    log "🔄 IP changed: $OLD_HOST → $NEW_HOST"
}

# Update .env file with new endpoint
update_env_file() {
    log "📝 Updating .env file..."
    
    # Update the endpoint
    sed -i "s|EC2_HOST=.*|EC2_HOST=$NEW_HOST|g" .env
    sed -i "s|REACT_APP_API_BASE_URL=.*|REACT_APP_API_BASE_URL=http://$NEW_HOST|g" .env
    sed -i "s|LAST_UPDATED=.*|LAST_UPDATED=$(date)|g" .env
    sed -i "s|ENDPOINT_TYPE=.*|ENDPOINT_TYPE=$ENDPOINT_TYPE|g" .env

    log "✅ .env file updated with new endpoint"
}

# Restart containers with new configuration
restart_containers() {
    # Check if containers are running
    if ! docker-compose ps | grep -q "Up"; then
        warn "⚠️  No containers are running"
        echo "💡 Start containers with: docker-compose up -d"
        echo "💡 Or run full deployment: ./smart-deploy.sh"
        return
    fi

    log "🔄 Restarting containers with new IP..."
    
    # Quick restart (no rebuild)
    docker-compose restart
    
    log "✅ Containers restarted"
}

# Wait for services to respond
wait_for_services() {
    log "⏳ Waiting for services to respond..."
    
    max_attempts=15
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -f -s http://localhost/ >/dev/null 2>&1; then
            log "✅ Frontend is responding"
            break
        fi
        
        attempt=$((attempt + 1))
        if [ $((attempt % 3)) -eq 0 ]; then
            echo "   Checking... $attempt/$max_attempts"
        fi
        sleep 2
    done
    
    if [ $attempt -eq $max_attempts ]; then
        warn "⚠️  Frontend not responding quickly"
        echo "💡 Try: docker-compose logs frontend"
        echo "💡 Or run full rebuild: ./smart-deploy.sh"
    fi
    
    # Quick backend check
    if curl -f -s http://localhost:9795/health >/dev/null 2>&1; then
        log "✅ Backend is healthy"
    else
        warn "⚠️  Backend health check failed"
        echo "💡 Try: docker-compose logs backend"
    fi
}

# Show results
show_results() {
    echo ""
    echo "🎉 Quick IP update complete!"
    echo ""
    echo -e "${GREEN}📱 Your app is now accessible at:${NC}"
    echo -e "${BLUE}   🌐 Frontend: http://$NEW_HOST${NC}"
    echo -e "${BLUE}   🔧 Backend:  http://$NEW_HOST/api/health${NC}"
    echo -e "${BLUE}   📊 Status:   docker-compose ps${NC}"
    echo ""
    echo -e "${GREEN}💡 Notes:${NC}"
    echo -e "${YELLOW}   • Quick restart completed (no rebuild)${NC}"
    echo -e "${YELLOW}   • If issues persist, run: ./smart-deploy.sh${NC}"
    echo -e "${YELLOW}   • Check logs with: docker-compose logs -f${NC}"
}

# Main function
main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════╗"
    echo "║        Quick IP Update Tool          ║"
    echo "║     ⚡ Fast configuration update     ║"
    echo "╚══════════════════════════════════════╝"
    echo -e "${NC}"
    
    detect_current_endpoint
    check_if_update_needed
    update_env_file
    restart_containers
    wait_for_services
    show_results
}

# Run main function
main "$@"
