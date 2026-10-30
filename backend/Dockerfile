FROM node:24-alpine AS builder

WORKDIR /app

COPY package-lock.json .
COPY package.json .
RUN npm install

COPY . .
RUN npm run build

FROM node:24-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["node", "dist/main"]
