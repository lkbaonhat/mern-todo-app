FROM node:24-alpine AS builder

WORKDIR /app

# download library
COPY package-lock.json .
COPY package.json .

# build
COPY . .

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
