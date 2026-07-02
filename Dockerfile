FROM node:16-alpine
WORKDIR /app
COPY package.json /app
COPY yarn.lock /app
# 设置 Electron 镜像源为淘宝镜像
ENV ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
RUN yarn install --frozen-lockfile && yarn cache clean
COPY . /app
CMD yarn run serve
EXPOSE 8080
