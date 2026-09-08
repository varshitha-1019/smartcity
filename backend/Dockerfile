# Node 20 + Python 3 image for SmartCity AI backend
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

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Install lightweight Python AI dependencies (~30MB)
RUN pip3 install --no-cache-dir --break-system-packages \
    tflite-runtime \
    "numpy<2" \
    Pillow

# Copy application files (including backend/ai)
COPY . .

ENV PORT=10000
ENV NODE_ENV=production
EXPOSE 10000

CMD ["node", "server.js"]
