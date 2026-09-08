# Multi-stage / lightweight Node 20 + Python 3 image for SmartCity AI
FROM node:20-slim

# Install Python 3, pip, and libraries needed for embedded DB & AI
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-setuptools \
    ca-certificates \
    curl \
    libcurl4 \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Node backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --production

# Install ultra-lightweight Python AI dependencies (~30MB total)
RUN pip3 install --no-cache-dir --break-system-packages \
    tflite-runtime \
    "numpy<2" \
    Pillow

# Copy project files needed for runtime
COPY backend/ ./backend/
COPY ai/ ./ai/

WORKDIR /app/backend

# Default Render port
ENV PORT=10000
ENV NODE_ENV=production
ENV AUTO_SEED=true
EXPOSE 10000

CMD ["node", "server.js"]
