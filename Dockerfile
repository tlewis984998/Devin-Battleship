# Stage 1: install everything and build the client bundle.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: runtime deps only, plus the built client and server/shared sources.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json .npmrc ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev
COPY shared/src shared/src
COPY server/src server/src
COPY --from=build /app/client/dist client/dist
EXPOSE 3001
CMD ["npm", "start"]
