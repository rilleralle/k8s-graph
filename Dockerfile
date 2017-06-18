FROM node:8-alpine
COPY server.js server.js
COPY package.json package.json
COPY k8s.html k8s.html
RUN npm install
EXPOSE 3000
CMD node server.js