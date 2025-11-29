FROM apify/actor-node-playwright-chrome:latest

COPY package*.json ./
RUN npm install

COPY . ./

CMD ["node", "main.js"]
