FROM node:20-alpine
WORKDIR /app
COPY server.js .
EXPOSE 25565
CMD ["node","server.js"]
