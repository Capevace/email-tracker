FROM node:16

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

ENV DB_PATH=/data/email-tracker.db

EXPOSE 8080

CMD [ "node", "/usr/src/app/index.js" ]