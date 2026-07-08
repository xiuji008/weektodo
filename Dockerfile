FROM node:18-alpine AS build
WORKDIR /app
COPY package.json yarn.lock /app
ENV ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
ENV NODE_OPTIONS=--openssl-legacy-provider
RUN yarn config set registry https://registry.npmmirror.com/ && \
    yarn install --frozen-lockfile --ignore-engines && yarn cache clean
COPY . /app
RUN yarn run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
