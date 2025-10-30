FROM pandoc/latex:latest

# Install Node.js 20+ and basics on Debian or Alpine based images
RUN set -eux; \
    if command -v apt-get >/dev/null 2>&1; then \
      apt-get update && \
      apt-get install -y --no-install-recommends curl ca-certificates gnupg bash fontconfig && \
      install -m 0755 -d /etc/apt/keyrings && \
      curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
      echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
      apt-get update && \
      apt-get install -y --no-install-recommends nodejs && \
      apt-get clean && rm -rf /var/lib/apt/lists/*; \
    elif command -v apk >/dev/null 2>&1; then \
      apk add --no-cache nodejs-current npm bash ca-certificates fontconfig && \
      fc-cache -f -v; \
    else \
      echo "No supported package manager found (apt-get or apk)" >&2; exit 1; \
    fi

WORKDIR /app

# Install server deps first (better layer caching)
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy server and public assets
COPY server/ ./server/
COPY public/ ./public/

# Copy conversion assets
COPY convert_to_pdf.sh linebreaks.lua tables.lua watermark.tex ./
RUN chmod +x convert_to_pdf.sh

# Install custom fonts (if provided) into system directory and refresh cache
RUN set -eux; \
    mkdir -p /usr/local/share/fonts/custom || true; \
    if [ -d "/app/server/fonts" ]; then \
      cp -r /app/server/fonts/* /usr/local/share/fonts/custom/ || true; \
      fc-cache -f -v || true; \
    fi

ENV PORT=8080 NODE_ENV=production
EXPOSE 8080

# The base image sets ENTRYPOINT to pandoc; clear it so we run Node.
ENTRYPOINT []
CMD ["node", "server/index.js"]


