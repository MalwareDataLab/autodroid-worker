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

COPY --from=build /usr/app/package.json /usr/app/yarn.lock /usr/app/scripts/entrypoint.sh ./
RUN yarn install --frozen-lockfile --production

COPY --from=build /usr/app/dist ./
RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["/usr/app/entrypoint.sh"]
