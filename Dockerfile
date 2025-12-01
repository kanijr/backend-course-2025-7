FROM node:21

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node","main.js","-h","0.0.0.0","-p","3000","-c","./cache"]