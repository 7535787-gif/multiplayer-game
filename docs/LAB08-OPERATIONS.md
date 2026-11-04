# Lab 08 — операційна перевірка

Цей документ фіксує локальні перевірки та зовнішні кроки, які потребують Docker, хостингу або інших людей. README буде оновлено окремо після завершення всіх технічних робіт.

## Локальний production-подібний запуск

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run start
```

Перевірки:

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/ready
curl -s http://localhost:3000/metrics
```

`/health` повертає стан процесу, версію збірки та git SHA. `/ready` повертає готовність приймати гравців. `/metrics` повертає JSON із кількістю гравців/кімнат, трафіком, p50/p95/p99 тика, event-loop utilization/delay, RSS і причинами відхилень.

## Docker

Основний `Dockerfile` використовує multi-stage build і Distroless Node.js 22 runtime. У фінальному шарі залишаються production-залежності, скомпільований сервер і клієнт. Контейнер працює як UID 65532, має exec-form `CMD` та `HEALTHCHECK`.

```bash
docker compose config
docker compose up --build -d
docker compose ps
docker image inspect multiplayer-game:local --format '{{.Size}}'
docker stop multiplayer-game
```

Критерій лабораторної: розмір фінального образу має бути меншим за 200 MB. Після оптимізації production dependencies обов'язково повторно виміряти фактичний розмір на Docker Desktop; у середовищі аудиту Docker Engine недоступний.

## Origin, IP-ліміт і reverse proxy

У production встановити `ALLOWED_ORIGINS` рівно в HTTPS-origin публічного сайту, наприклад `https://example-host.tld` (без шляху). `MAX_CONNECTIONS_PER_IP` обмежує WebSocket-з'єднання з однієї IP. `TRUST_PROXY=true` дозволяє використовувати першу адресу з `X-Forwarded-For`; вмикати це можна лише за наявності довіреного reverse proxy, який перезаписує цей заголовок.

WebSocket heartbeat надсилається сервером кожні 15 секунд; два пропущені pong призводять до завершення з'єднання. Клієнт використовує `wss://` автоматично, коли сторінка відкрита через HTTPS.

## CI/CD і release

- `.github/workflows/typecheck.yml` запускає quality gate на push і pull request.
- `.github/workflows/release.yml` реагує на теги `v*`, перевіряє код, збирає Docker image, додає tag і commit SHA, публікує образ у GHCR та викликає `DEPLOY_WEBHOOK_URL`.
- Перед release потрібно налаштувати секрет `DEPLOY_WEBHOOK_URL` у GitHub та підготувати сервіс хостингу, який запускає опублікований GHCR image.
- У хостингу задати `ALLOWED_ORIGINS`, `MAX_CONNECTIONS_PER_IP`, `MAX_ROOMS`, `MAX_PLAYERS_PER_ROOM`, `TRUST_PROXY=true` (лише за довіреним proxy) та постійне сховище для `/app/logs`.

## Обмеження та зовнішні перевірки

- Межі payload (4096 байт), швидкості повідомлень (token bucket 120 повідомлень/с), join timeout (5 с), slow-client threshold (1 MiB buffered) застосовуються сервером.
- Тест 1000 некоректних кадрів/с, вимірювання ізоляції інших кімнат і аварійний перезапуск сервера мають бути виконані проти staging-контейнера; у звіт записувати фактичні метрики до/після.
- Для аварійного завершення клієнта закрити вкладку під час матчу; для сервера — примусово зупинити staging-контейнер. Після втрати WS клієнт переходить у лобі, а WebSocket-клієнт використовує exponential backoff.
- Реальний RTT двох гравців з різних мереж, зовнішній uptime monitor, публічний WSS URL, PWA install на фізичному телефоні та demo video потребують зовнішнього виконання. Не записувати вигадані значення.
- Логи реалізовані через `pino`, пишуть JSON у stdout та файл `server.ndjson`; події гравців містять `roomId`/`playerId`.
