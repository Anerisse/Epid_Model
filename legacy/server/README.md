# server — API «Моделирование эпидемий»

NestJS 11 + TypeORM + PostgreSQL. Единственный `package.json` в репозитории.

Полные инструкции по запуску — в корневом [README.md](../README.md).

Кратко:

```bash
# из корня репозитория — сначала БД:
docker compose up -d

# затем сервер (порт 3001):
npm install
npm run start:dev
```

- Настройки БД — по умолчанию в `src/app.module.ts` (`DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`).
- Порт — `process.env.PORT ?? 3001`.
- `synchronize: true` — таблицы создаются сами (только для разработки, миграций нет).