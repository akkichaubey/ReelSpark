# Use Node 20 or 22 LTS on Debian Bookworm
FROM node:22-bookworm-slim

# Install system dependencies: FFmpeg, Chromium for Remotion, and necessary fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
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
ENV NODE_ENV=production

WORKDIR /app

# Copy dependency manifests and use the pinned pnpm version.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable

# Install exactly the dependency graph committed to the repository.
RUN pnpm install --frozen-lockfile

# Copy full application source
COPY . .

# Build Next.js application
RUN pnpm build

# Expose server port
EXPOSE 3000

# Start production server
CMD ["pnpm", "start"]
