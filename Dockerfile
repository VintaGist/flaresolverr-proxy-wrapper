FROM node:18-alpine

# Створюємо non-root користувача
RUN addgroup -g 1001 -S nodejs && \
    adduser -S wrapper -u 1001

WORKDIR /app

# Копіюємо package files
COPY package*.json ./

# Встановлюємо залежності
RUN npm install --only=production && npm cache clean --force

# Копіюємо код
COPY --chown=wrapper:nodejs wrapper.js ./

# Відкриваємо порт для wrapper та діапазон для локальних проксі
EXPOSE 8191
EXPOSE 4141-4160

# Переключаємося на non-root
USER wrapper

# Перевіряємо здоров'я
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8191/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "wrapper.js"]