FROM node:20-bookworm-slim

WORKDIR /app

# Install Python
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY backend/package.json backend/package-lock.json* ./

# Install Node modules
RUN npm install --omit=dev

# Copy Python requirements
COPY backend/optimizer/requirements.txt /tmp/optimizer-requirements.txt

# Install Python packages
RUN python3 -m pip install --break-system-packages -r /tmp/optimizer-requirements.txt

# Copy source code
COPY backend/src ./backend/src
COPY backend/optimizer ./backend/optimizer
COPY backend/.env.example ./backend/.env.example

WORKDIR /app/backend

ENV NODE_ENV=production

EXPOSE 4000

CMD ["node", "src/server.js"]