# Build environment
FROM node:20.17.0-alpine AS build
WORKDIR /usr/app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# Production environment
FROM node:20.17.0-alpine AS production
WORKDIR /usr/app
RUN addgroup -g 1001 -S nodegrp
RUN adduser -S nodejs -u 1001

COPY --from=build /usr/app/dist ./
COPY --from=build /usr/app/package.json /usr/app/yarn.lock ./
RUN chown -R nodejs:nodegrp /usr/app

USER nodejs
RUN yarn install --frozen-lockfile --production
ENTRYPOINT ["node", "index.js"]
