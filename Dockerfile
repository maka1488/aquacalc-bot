FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Видаляємо Windows бінарник cloudflared, якщо є
RUN rm -f cloudflared.exe

EXPOSE 3005

ENV PORT=3005

CMD ["node", "index.js"]
