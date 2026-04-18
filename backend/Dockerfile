FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY optimizer/requirements.txt /tmp/optimizer-requirements.txt
RUN python3 -m pip install --break-system-packages -r /tmp/optimizer-requirements.txt

COPY backend/package.json ./backend/package.json
COPY backend/src ./backend/src
COPY backend/optimizer ./backend/optimizer
COPY backend/.env.example ./backend/.env.example

WORKDIR /app/backend

ENV NODE_ENV=production
EXPOSE 4000

CMD ["node", "src/server.js"]

