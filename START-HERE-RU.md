# PulseVoice — запуск Supabase + звонки

## Что добавлено
- Supabase Auth, профили, личные сообщения, поиск пользователей и запросы в друзья.
- LiveKit интеграция для аудио/видео-комнат и демонстрации экрана.
- Серверный endpoint `/api/livekit/token`: токен выдаётся только после проверки Supabase access token; LiveKit API secret остаётся только на сервере.

Это ещё не полностью протестированный production-релиз: нужно проверить сборку и звонок между двумя реальными аккаунтами после добавления своих ключей.

## Локальный запуск (Windows)
1. Распакуй архив и открой в VS Code папку `pulsevoice` — именно ту, где находится `package.json`.
2. Создай в корне файл `.env.local`, скопировав `.env.example`.
3. Заполни значения Supabase и LiveKit из своих проектов:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
LIVEKIT_URL=wss://YOUR-PROJECT.livekit.cloud
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
```

4. Supabase SQL Editor: выполни `supabase/schema.sql` целиком (если уже выполнил успешно, повторно запускать не обязательно).
5. В терминале VS Code из папки с `package.json`:

```powershell
npm.cmd install
npm.cmd run dev
```

6. Открой `http://localhost:3000`, войди в аккаунт, открой Voice rooms, введи имя комнаты (например `lobby`) и нажми Join room. Второй пользователь должен войти под отдельным аккаунтом и выбрать то же имя комнаты.
7. Для демонстрации экрана нажми кнопку share-screen в панели LiveKit. Браузер попросит разрешение. В публичном интернете нужен HTTPS.

## Создать LiveKit проект бесплатно
Открой https://cloud.livekit.io/ и создай проект. Скопируй URL, API Key и API Secret в `.env.local`. Не отправляй API Secret никому и никогда не добавляй его в `NEXT_PUBLIC_` переменные или GitHub.

## Опубликовать сайт с публичной ссылкой
1. Создай приватный репозиторий на GitHub и загрузи код (не добавляй `.env.local`; он должен быть в `.gitignore`).
2. Открой https://vercel.com/, импортируй репозиторий и выбери Deploy.
3. В Vercel → Project Settings → Environment Variables добавь все шесть переменных из `.env.local`.
4. Сделай Redeploy. Vercel выдаст публичный HTTPS-адрес.
5. В Supabase → Authentication → URL Configuration установи Site URL на публичный адрес и добавь его в Redirect URLs; оставь также `http://localhost:3000/**` для локального теста.
6. В `NEXT_PUBLIC_APP_URL` укажи публичный HTTPS-адрес и снова сделай Redeploy.

Публичная ссылка появится только после успешного деплоя в твоём аккаунте Vercel. Я не могу опубликовать её за тебя без доступа/авторизации в твоём аккаунте. Никогда не присылай мне пароли или секретные ключи.

## Что ещё не готово
Сообщества/каналы/роли, push-уведомления, восстановление пароля и полноценная модерация ещё не реализованы. Интеграция LiveKit добавлена, но требует проверки на двух устройствах с настоящими ключами и после `npm.cmd install`/`npm.cmd run build`.
