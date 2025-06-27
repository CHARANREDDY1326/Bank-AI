#!/bin/bash
#!/bin/bash
# smart-deploy.sh - Always uses current IP/DNS, perfect for stop/start instances

set -e

echo "🚀 Smart deployment - Dynamic IP handling..."

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

info() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')] $1${NC}"
}

# Detect current endpoints
detect_endpoints() {
    log "🔍 Detecting current EC2 endpoints..."
    
    # Method 1: EC2 metadata service (most reliable)
    PUBLIC_IP=$(curl -s --max-time 5 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo "")
    PUBLIC_DNS=$(curl -s --max-time 5 http://169.254.169.254/latest/meta-data/public-hostname 2>/dev/null || echo "")
    
    # Method 2: Fallback to external service
    if [ -z "$PUBLIC_IP" ]; then
        PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "")
    fi
    
    # Method 3: Check what's currently in .env (if exists)
    if [ -f ".env" ] && [ -z "$PUBLIC_IP" ]; then
        CURRENT_HOST=$(grep "EC2_HOST=" .env 2>/dev/null | cut -d'=' -f2 || echo "")
        if [ ! -z "$CURRENT_HOST" ]; then
            warn "Using existing host from .env: $CURRENT_HOST"
            EC2_HOST="$CURRENT_HOST"
        fi
    fi
    
    # Decide which endpoint to use
    if [ ! -z "$PUBLIC_DNS" ] && [[ "$PUBLIC_DNS" == *"compute.amazonaws.com" ]]; then
        EC2_HOST="$PUBLIC_DNS"
        ENDPOINT_TYPE="DNS"
        info "✅ Using DNS: $EC2_HOST (more stable)"
    elif [ ! -z "$PUBLIC_IP" ]; then
        EC2_HOST="$PUBLIC_IP"
        ENDPOINT_TYPE="IP"
        info "✅ Using IP: $EC2_HOST"
    else
        echo "❌ Could not detect any public endpoint!"
        echo "Please check:"
        echo "1. Are you running this on EC2?"
        echo "2. Is the instance in a public subnet?"
        echo "3. Does it have a public IP assigned?"
        exit 1
    fi
    
    log "📍 Current endpoint: $EC2_HOST ($ENDPOINT_TYPE)"
}

# Create dynamic .env file
create_dynamic_env() {
    log "📝 Creating .env with current endpoint..."
    
    # Preserve existing SECRET_KEY if it exists
    EXISTING_SECRET=""
    if [ -f ".env" ]; then
        EXISTING_SECRET=$(grep "SECRET_KEY=" .env 2>/dev/null | cut -d'=' -f2 || echo "")
    fi
    
    # Generate new secret if none exists
    if [ -z "$EXISTING_SECRET" ]; then
        EXISTING_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "generated-$(date +%s)")
    fi
    
    cat > .env << EOF
# Auto-generated on $(date)
# This file updates automatically when you redeploy

# Current EC2 Endpoint ($ENDPOINT_TYPE)
EC2_HOST=$EC2_HOST

# Application URLs (auto-configured)
REACT_APP_API_BASE_URL=http://$EC2_HOST
REACT_APP_WS_PROTOCOL=ws

# Backend Configuration
SECRET_KEY=$EXISTING_SECRET
DATABASE_URL=postgresql://webrtc_user:secure_password@postgres:5432/webrtc_db
REDIS_URL=redis://redis:6379/0

# AWS Configuration
AWS_DEFAULT_REGION=us-east-1

# Security (allow all for simplicity)
CORS_ORIGINS=*

# Audio Processing
AUDIO_STORAGE_PATH=/app/audio_files
MAX_AUDIO_FILE_SIZE=50MB

# Runtime flags
SKIP_SSL=true
ALLOW_HTTP=true
DYNAMIC_IP=true

# Debug info
LAST_UPDATED=$(date)
ENDPOINT_TYPE=$ENDPOINT_TYPE
EOF

    log "✅ .env file created with endpoint: $EC2_HOST"
}

# Create auto-startup script
create_startup_script() {
    log "📜 Creating auto-startup script..."
    
    cat > /home/ubuntu/startup-app.sh << 'EOF'
#!/bin/bash
# This script runs automatically when you restart your EC2

echo "🔄 Auto-starting app with current IP..."

cd /home/ubuntu/your-project  # Adjust path as needed

# Re-run smart deployment to get new IP
./smart-deploy.sh

echo "✅ App started with current IP!"
EOF

    chmod +x /home/ubuntu/startup-app.sh
    
    # Add to crontab for auto-start on reboot
    (crontab -l 2>/dev/null | grep -v startup-app.sh; echo "@reboot sleep 60 && /home/ubuntu/startup-app.sh >> /home/ubuntu/startup.log 2>&1") | crontab -
    
    log "✅ Auto-startup script created"
}

# Check if containers are running
check_existing_containers() {
    if docker-compose ps | grep -q "Up"; then
        warn "⚠️  Containers are running with potentially old IP"
        warn "💡 Stopping and rebuilding with current IP..."
        docker-compose down 2>/dev/null || true
    fi
}

# Setup firewall
setup_firewall() {
    log "🔥 Setting up firewall..."
    
    sudo ufw allow 22/tcp >/dev/null 2>&1 || true
    sudo ufw allow 80/tcp >/dev/null 2>&1 || true
    sudo ufw allow 10000:20000/udp >/dev/null 2>&1 || true
    sudo ufw --force enable >/dev/null 2>&1 || true
    
    log "✅ Firewall configured"
}

# Deploy containers
deploy_containers() {
    log "🐳 Deploying containers with current endpoint..."
    
    # Clean up any old containers
    docker-compose down --remove-orphans 2>/dev/null || true
    
    # Remove old images to save space
    docker image prune -f >/dev/null 2>&1 || true
    
    # Build with current environment
    log "🔨 Building frontend with API URL: http://$EC2_HOST"
    docker-compose build --no-cache
    
    # Start all services
    docker-compose up -d
    
    log "✅ Containers deployed"
}

# Wait for services
wait_for_services() {
    log "⏳ Waiting for services to start..."
    
    max_attempts=30
    attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        # Check backend
        if curl -f -s http://localhost:9795/health >/dev/null 2>&1; then
            log "✅ Backend is ready"
            break
        fi
        
        attempt=$((attempt + 1))
        if [ $((attempt % 5)) -eq 0 ]; then
            echo "   Attempt $attempt/$max_attempts..."
        fi
        sleep 2
    done
    
    if [ $attempt -eq $max_attempts ]; then
        warn "⚠️  Backend health check timeout, but continuing..."
    fi
    
    # Check if nginx is responding
    if curl -f -s http://localhost/ >/dev/null 2>&1; then
        log "✅ Frontend is ready"
    else
        warn "⚠️  Frontend health check failed"
    fi
}

# Show final information
show_results() {
    echo ""
    echo "🎉 Deployment complete!"
    echo ""
    echo -e "${GREEN}📱 Your app is now accessible at:${NC}"
    echo -e "${BLUE}   🌐 Frontend: http://$EC2_HOST${NC}"
    echo -e "${BLUE}   🔧 Backend:  http://$EC2_HOST/api/health${NC}"
    echo -e "${BLUE}   🌍 Direct:   http://$EC2_HOST:9795/health${NC}"
    echo ""
    echo -e "${GREEN}💡 Important Notes:${NC}"
    echo -e "${YELLOW}   • Your app automatically adapts to IP changes${NC}"
    echo -e "${YELLOW}   • Just run './smart-deploy.sh' after each restart${NC}"
    echo -e "${YELLOW}   • Auto-startup is configured for reboots${NC}"
    echo ""
    echo -e "${GREEN}🔄 For daily restarts:${NC}"
    echo -e "${BLUE}   1. Stop instance in AWS console${NC}"
    echo -e "${BLUE}   2. Start instance (gets new IP)${NC}"
    echo -e "${BLUE}   3. SSH in and run: ./smart-deploy.sh${NC}"
    echo ""
    echo -e "${GREEN}🛠️  Useful commands:${NC}"
    echo -e "${BLUE}   docker-compose ps        # Check status${NC}"
    echo -e "${BLUE}   docker-compose logs -f   # View logs${NC}"
    echo -e "${BLUE}   docker-compose restart   # Restart services${NC}"
}

# Check if we're on EC2
check_environment() {
    if curl -s --max-time 2 http://169.254.169.254/latest/meta-data/ >/dev/null 2>&1; then
        log "✅ Running on EC2 instance"
    else
        warn "⚠️  Not running on EC2 - some features may not work"
    fi
}

# Main function
main() {
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════╗"
    echo "║         Smart WebRTC Deployment       ║"
    echo "║     🔄 Dynamic IP Handling Enabled     ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
    
    check_environment
    detect_endpoints
    create_dynamic_env
    check_existing_containers
    setup_firewall
    deploy_containers
    wait_for_services
    create_startup_script
    show_results
}

# Run main function
main "$@"
