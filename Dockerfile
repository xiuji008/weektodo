FROM node:18-alpine
WORKDIR /app
COPY package.json /app
COPY yarn.lock /app
# 设置 Electron 镜像源为淘宝镜像
ENV ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
# Node 18 OpenSSL 兼容 Webpack 4
ENV NODE_OPTIONS=--openssl-legacy-provider
# --ignore-engines: 兼容 Node 18（@achrinza/node-ipc 引擎限制 8-17）
RUN yarn install --frozen-lockfile --ignore-engines && yarn cache clean
COPY . /app
CMD yarn run serve
EXPOSE 8080
