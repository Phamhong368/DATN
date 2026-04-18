FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY frontend/package.json ./package.json
COPY frontend/package-lock.json* ./package-lock.json
RUN npm install

COPY frontend ./

ARG VITE_API_URL=/api
ARG VITE_GOOGLE_MAPS_API_KEY=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}

RUN npm run build

FROM nginx:1.27-alpine

COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

