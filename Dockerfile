# Pin the verified Node LTS security baseline on Debian Bookworm.
FROM node:24.22.1-bookworm-slim

# Install system dependencies: FFmpeg, Chromium for Remotion, and necessary fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-noto-core \
    fonts-dejavu-core \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer / Remotion Chromium executable path
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_PATH=/usr/bin/chromium
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe
ENV PORT=3000

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json ./
# The root postinstall hook runs before the application source is copied.
COPY scripts/patch-remotion.js scripts/FfmpegWrapper.cs ./scripts/

# Install dependencies using npm
RUN npm ci --include=dev

# Copy full application source
COPY . .

# Build Next.js application
RUN npm run build

ENV NODE_ENV=production

# Expose server port
EXPOSE 3000

# Start production server
CMD ["npm", "start", "--", "--hostname", "0.0.0.0"]
