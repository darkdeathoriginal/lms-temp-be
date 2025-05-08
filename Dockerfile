FROM node:22

# Create app directory
WORKDIR /app
# Install app dependencies

COPY package*.json ./

#copy prisma files
COPY ./prisma ./prisma/
# Install production dependencies
RUN npm install
RUN npx prisma generate
# Bundle app source
COPY . .
# run the app
EXPOSE 8080
#docker run -d --env-file .env -p 8080:8080 gotd

CMD ["npm", "start"]
