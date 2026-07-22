FROM node:lts-alpine

WORKDIR /app

COPY package*.json ./

# --legacy-peer-deps: the committed lockfile is out of sync with package.json
# (missing monaco-editor/dompurify/marked) AND there's an eslint-plugin-import-x
# / typescript-eslint peer conflict. This tolerates both for local dev.
# TODO: regenerate + commit package-lock.json, then switch back to `npm ci`.
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
