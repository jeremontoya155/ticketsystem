FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p public/uploads/tickets

EXPOSE 3000

CMD ["npm", "start"]
