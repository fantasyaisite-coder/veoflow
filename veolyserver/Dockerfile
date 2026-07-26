FROM ghcr.io/puppeteer/puppeteer:latest

ENV PUPPETEER_SKIP_DOWNLOAD=false
ENV PORT=3000

WORKDIR /app

USER root

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
