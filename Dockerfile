FROM node:22-bullseye

# نصب کتابخانه‌های مورد نیاز Playwright
RUN apt-get update && apt-get install -y \
    xvfb wget libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libasound2 libpangocairo-1.0-0 libgtk-3-0 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# کپی package.json و نصب وابستگی‌ها
COPY package*.json ./
RUN npm install

# نصب مرورگرهای Playwright
RUN npx playwright install --with-deps

# کپی کل پروژه
COPY . .

# اجرای main.js با مرورگر واقعی
CMD ["xvfb-run", "-a", "-s", "-ac -screen 0 1920x1080x24+32 -nolisten tcp", "node", "main.js"]
