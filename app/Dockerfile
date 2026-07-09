FROM node:lts-alpine

WORKDIR /app

COPY package*.json ./

# The committed package-lock.json is inconsistent (missing monaco-editor; drifted
# dompurify/marked), so `npm ci` fails under this image's stricter npm 11. And a
# plain `npm install` hits a peer conflict (eslint-plugin-import-x peers
# @typescript-eslint/utils ^8.56.0 while the tree resolves 8.52.0). --legacy-peer-deps
# re-resolves from package.json (tolerating the stale lock) and ignores that peer
# conflict. Proper fix: regenerate + commit a clean lockfile, then switch to `npm ci`.
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
