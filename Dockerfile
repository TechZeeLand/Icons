# SPDX-License-Identifier: AGPL-3.0-or-later
FROM node:22-alpine
RUN apk add --no-cache git tini \
 && mkdir /data && chown node:node /data
WORKDIR /app
COPY --chown=node:node server ./server
COPY --chown=node:node client ./client
COPY --chown=node:node tools ./tools
COPY --chown=node:node public ./public
COPY --chown=node:node icons ./icons
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
USER node
EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:3000/healthz >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/server.js"]
