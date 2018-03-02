FROM node:8-alpine
COPY index.js index.js
COPY package.json package.json
COPY client  /client
COPY src  /src
RUN npm install
EXPOSE 3000
CMD node index.js