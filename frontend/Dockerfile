FROM node:18-alpine as build

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies and fix permissions
RUN npm ci && \
    chmod +x node_modules/.bin/* && \
    npm ls vite || npm install vite

# Copy source code
COPY . .

# Build arguments
ARG REACT_APP_API_BASE_URL
ARG REACT_APP_WS_PROTOCOL

# Set environment variables
ENV VITE_API_BASE_URL=${REACT_APP_API_BASE_URL}
ENV VITE_WS_PROTOCOL=${REACT_APP_WS_PROTOCOL}

# Build with npx to ensure vite runs
RUN npx vite build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/frontend.conf /etc/nginx/conf.d/default.conf

RUN apk add --no-cache curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
