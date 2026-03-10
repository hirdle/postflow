# PRD: BioVolt Post Publisher

**Версия:** 3.0
**Дата:** 2026-03-10
**Автор:** BioVolt Team
**Статус:** Approved

---

## 1. Коротко

BioVolt Post Publisher — внутренний сервис для создания, редактирования, превью и публикации постов BioVolt в Telegram и ВКонтакте.

Ключевые решения:

1. Сервис standalone — без MCP-серверов в рантайме и без зависимости от MCP-пакетов.
2. Логика из `publish-mcp` и `image-gen-mcp` переносится в новый backend-модуль; после миграции MCP-папки удаляются.
3. Источник правды для контента:
   1) markdown-файлы в `data/posts/`
   2) изображения в `data/images/`
   3) SQLite для статусов, логов и расписания
4. Сервис запускается локально через Docker.

Сервис предназначен для одного внутреннего пользователя: контент-менеджера BioVolt.

---

## 2. Почему проект нужен

Сейчас публикация постов завязана на markdown-файлы, CLI и MCP-инструменты. Это рабочий, но хрупкий контур:

1. Контент-менеджеру нужно знать структуру frontmatter и формат markdown.
2. Превью поста и проверка ограничений платформ не собраны в одном месте.
3. Логика публикации размазана между `publish-mcp`, `image-gen-mcp`, `.mcp.json` и локальным workflow.
4. Нет одного приложения, которое владеет статусами публикаций, расписанием и валидацией контента.

Для BioVolt это особенно критично, потому что контент должен быть не просто "опубликован", а опубликован в рамках ToV, целевой аудитории и продуктовых формулировок бренда.

---

## 3. Контекст проекта

### 3.1 Текущее состояние репозитория

В репозитории:

1. `data/posts/` — 116 существующих постов в формате markdown с frontmatter.
2. `data/brand-knowledge/` — Obsidian-vault с ToV, продуктами, целевой аудиторией и шаблонами платформ.
3. `mcps/publish-mcp/` — рабочая логика публикации, форматирования, Telegram/VK-клиенты и JSON-store. Будет удалена после миграции.
4. `mcps/image-gen-mcp/` — рабочая логика генерации изображений через OpenAI-compatible API. Будет удалена после миграции.

### 3.2 Контентный контекст BioVolt

Сервис публикует контент для BioVolt, а не является универсальной CMS.

Ключевые ограничения:

1. Основная аудитория: владельцы SK8 и сервисные центры по SK8.
2. Тексты опираются на конкретные продуктовые формулировки:
   1) ячейки EVE и DMEGC
   2) разъем XT-60
   3) гарантия 2 года
   4) честная емкость, проверка, подбор под задачу
3. Tone of Voice:
   1) дружелюбно
   2) просто
   3) надежно
   4) без пафоса и без перегруза терминами
4. Платформы: только Telegram и VK.

### 3.3 Главный архитектурный принцип

Новый сервис не зависит от `mcp`, `FastMCP`, `.mcp.json` или tool-интерфейсов.

Стратегия миграции:

1. Взять код из MCP-модулей как источник.
2. Перенести и адаптировать в новый standalone backend-модуль.
3. После миграции удалить папки `mcps/publish-mcp/` и `mcps/image-gen-mcp/`.

---

## 4. Цели и не-цели

### 4.1 Цели v1

1. Создание и редактирование постов без терминала.
2. Обратная совместимость с текущим форматом файлов в `data/posts/`.
3. Публикация, превью, генерация изображений и статус-трекинг в одном приложении.
4. Standalone backend без MCP.
5. Валидация по платформенным и бренд-правилам (warnings).
6. Безопасный сценарий для контент-менеджера:
   1) открыть пост
   2) проверить
   3) увидеть превью
   4) опубликовать или запланировать

### 4.2 Не-цели v1

1. Управление блогом, Дзеном и контентом лендинга.
2. Универсальная multi-tenant CMS.
3. Многопользовательская модель с ролями и правами.
4. Контент-аналитика по просмотрам, CTR и реакциям.
5. AI-генерация текста постов прямо в редакторе.
6. Полное версионирование текста внутри приложения.
7. Удаление постов из UI.

---

## 5. Пользователь и сценарии

### 5.1 Пользователь

Контент-менеджер BioVolt. Единственный пользователь системы.

Что ему нужно:

1. Быстро открыть любой пост.
2. Создать новый пост из интерфейса.
3. Понять, готов ли пост к публикации (валидация).
4. Поправить текст, картинку, опрос, дату и время.
5. Увидеть превью для Telegram и VK.
6. Опубликовать или запланировать публикацию.
7. Управлять запланированными публикациями (отмена, перенос).
8. Настроить токены и параметры API через веб-интерфейс.

---

## 6. Продуктовое решение

### 6.1 Что строим

Внутренний post operations tool:

1. Список постов с фильтрами
2. Редактор с полями метаданных
3. Превью под Telegram и VK
4. Управление изображением (загрузка + генерация)
5. Публикация и планирование
6. Статусы и журнал операций
7. Настройки (токены, API)

### 6.2 Ownership

Приложение само владеет:

1. Парсингом markdown
2. Форматированием под платформу
3. Telegram/VK-клиентами
4. Генерацией изображения
5. Статусами публикаций
6. Валидацией контента

---

## 7. Правила контента и валидация

### 7.1 Общие правила бренда

1. Дружелюбный и простой тон
2. Уважительное обращение на "Вы"
3. Без агрессивного sales-talk
4. Без пафосных слов вроде "революционный", "премиальный", "лучший"
5. Без emoji в итоговых постах

### 7.2 Политика платформ

Структурированная policy-таблица, зашитая в конфигурацию backend:

| Параметр | Telegram | VK |
|----------|----------|----|
| Username | `@biovoltru` | `@biovolt` |
| Длина поста | 500-1500 символов | 500-2000 символов |
| Emoji | запрещены | запрещены |
| Хештеги | 3-5 | 5-10 |
| Опрос | поддерживается | поддерживается |
| Ссылка в конце | `t.me/biovoltru` | `vk.com/biovolt` |

Нарушение policy показывается как **warning**, а не как блокирующая ошибка.

### 7.3 Валидаторы

Валидатор делит замечания на уровни:

1. `error` — блокирует публикацию:
   1) отсутствует дата
   2) отсутствует время
   3) отсутствует платформа
   4) отсутствует заголовок
   5) отсутствует тело поста
2. `warning` — предупреждение, не блокирует:
   1) нет хука в начале
   2) нет призыва к комментарию
   3) нет ссылки на площадку
   4) нет username
   5) количество хештегов вне диапазона
   6) длина поста вне диапазона
   7) текст содержит emoji
3. `info` — информация:
   1) нет изображения
   2) нет опроса
   3) нет product facts, когда пост относится к продуктовой рубрике

---

## 8. Scope по релизам

### 8.1 MVP

1. Список постов из `data/posts/` с фильтрами (платформа, дата, статус, рубрика, поиск)
2. Создание нового поста из UI
3. Редактирование: metadata + body + poll + image prompt
4. Ручное сохранение (кнопка)
5. Превью под Telegram и VK (переключение)
6. Загрузка изображения
7. Генерация изображения через внешний API
8. Публикация одного поста (сейчас или по расписанию)
9. Просмотр запланированных публикаций
10. Отмена запланированной публикации
11. Перенос даты/времени запланированной публикации
12. Статус публикации и журнал ошибок
13. Settings screen (токены Telegram, VK, Image API)

### 8.2 Release 2

1. Календарь запланированных публикаций (просмотр)
2. Дубль поста под вторую платформу

### 8.3 Release 3

1. Dashboard
2. WYSIWYG-режим поверх markdown

---

## 9. Функциональные требования

### 9.1 Работа с постами

**FR-1. Список постов**

Система показывает все markdown-файлы из `data/posts/` и для каждого отображает:

1. filename
2. дата и время
3. платформа
4. рубрика
5. тип контента
6. заголовок
7. статус публикации
8. наличие изображения
9. наличие опроса

Фильтры:

1. по платформе
2. по дате
3. по статусу
4. по рубрике
5. поиск по заголовку и body

**FR-2. Создание поста**

При создании нового поста система:

1. подставляет platform-specific username
2. формирует имя файла по шаблону `YYYY-MM-DD-platform-NN.md`
3. создает каркас markdown-файла в текущем формате

**FR-3. Редактирование поста**

В редакторе доступны поля:

1. дата
2. время
3. платформа
4. тип контента
5. рубрика
6. hook type
7. title
8. body
9. username
10. hashtags
11. poll (inline editing, 2-10 вариантов)
12. image prompt

Сохранение — ручное, по кнопке. При наличии несохранённых изменений показывается индикатор и предупреждение при закрытии.

### 9.2 Превью

**FR-4. Превью использует backend render-функции**

1. Telegram preview — HTML-форматирование.
2. VK preview — plain text после markdown stripping.
3. Превью совпадает с тем, что реально уйдет в платформу.
4. Переключение между Telegram и VK превью.
5. Если есть poll, превью показывает его как отдельный блок.

### 9.3 Изображения

**FR-5. Загрузка и генерация**

Пользователь может:

1. загрузить PNG/JPG/WEBP
2. удалить изображение
3. сгенерировать изображение по prompt
4. перегенерировать изображение

Требования:

1. сервис сохраняет файл в `data/images/<post-stem>.png`
2. если папки `data/images/` нет, сервис создает ее
3. генерация через внутренний image service
4. модель и базовый URL берутся из settings

### 9.4 Опросы

**FR-6. Опрос является частью post model**

1. Минимум 2 варианта, максимум 10
2. Inline editing в UI
3. Platform validation

Публикация:

1. Telegram: poll публикуется отдельным сообщением, хранит отдельный `poll_message_id`
2. VK: poll создается как вложение к wall post

### 9.5 Публикация

**FR-7. Публикация одного поста**

Перед отправкой система:

1. parse
2. validate (errors блокируют, warnings показываются)
3. render payload
4. resolve image
5. publish now или schedule

После публикации сохраняет в SQLite:

1. platform
2. file_name
3. message_id
4. poll_message_id
5. scheduled_date
6. scheduled_time
7. status
8. published_at
9. error

**FR-8. Запланированные посты**

Система показывает все записи со статусом `scheduled` и позволяет:

1. открыть исходный пост
2. отменить публикацию
3. перенести дату/время (delete + recreate)

### 9.6 Настройки

**FR-9. Settings screen**

Настраиваются через веб-интерфейс:

1. Telegram API credentials
2. VK API credentials
3. Image API key, base URL, default model

Хранятся в SQLite таблице `app_settings`, не утекают на frontend.

---

## 10. Нефункциональные требования

### 10.1 Надежность

1. Ошибка публикации не ломает остальные записи.
2. Каждый publish attempt логируется.
3. При ошибке пользователь видит понятное сообщение, а не traceback.
4. Повторная публикация защищена от случайных дублей.

### 10.2 Производительность

1. Список из 200 постов — меньше 1 секунды.
2. Preview response — меньше 500 мс.
3. Publish одного поста — до 15 секунд без генерации изображения.
4. Image generation — допускает длительный async job.

### 10.3 Безопасность

1. Токены не уходят на frontend.
2. Токены хранятся в SQLite `app_settings` (server-side).
3. Приложение работает локально через Docker без auth.

### 10.4 Совместимость

1. Все существующие посты из `data/posts/` открываются без миграции markdown.
2. Новый сервис не требует `.mcp.json` и `mcp` пакета.

---

## 11. Архитектура

### 11.1 Структура проекта

```
postflow/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── api/
│   │   │   ├── posts.py
│   │   │   ├── preview.py
│   │   │   ├── publish.py
│   │   │   ├── media.py
│   │   │   ├── schedules.py
│   │   │   └── settings.py
│   │   ├── core/
│   │   │   ├── posts/
│   │   │   │   ├── parser.py
│   │   │   │   ├── serializer.py
│   │   │   │   ├── validation.py
│   │   │   │   └── models.py
│   │   │   ├── preview/
│   │   │   │   └── formatters.py
│   │   │   ├── publishing/
│   │   │   │   ├── service.py
│   │   │   │   ├── scheduler.py
│   │   │   │   └── status_repository.py
│   │   │   └── media/
│   │   │       ├── image_service.py
│   │   │       └── storage.py
│   │   ├── infra/
│   │   │   ├── telegram_client.py
│   │   │   ├── vk_client.py
│   │   │   ├── image_api_client.py
│   │   │   └── database.py
│   │   └── schemas/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   └── types/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── data/
│   ├── posts/
│   ├── images/
│   └── publish.db
└── PRD.md
```

### 11.2 Runtime-схема

```
Frontend (React)
   |
REST API (FastAPI)
   |
Standalone backend
   |
   +-- data/posts/       (markdown files)
   +-- data/images/      (generated/uploaded images)
   +-- data/publish.db   (SQLite: statuses, attempts, settings)
   +-- VK API
   +-- Telegram API
   +-- Image API
```

### 11.3 Docker

Два контейнера в `docker-compose.yml`:

1. `backend` — Python + FastAPI, монтирует `./data` как volume
2. `frontend` — React (Vite build), nginx или dev-server

### 11.4 Ownership

1. `core/posts` — markdown-format и совместимость файлов
2. `core/preview` — render output
3. `core/publishing` — публикация и статусы
4. `core/media` — изображения (загрузка и генерация)
5. `infra/*_client.py` — конкретный внешний API

---

## 12. Технологии

| Слой | Выбор |
|------|-------|
| Backend | Python 3.11+ + FastAPI |
| HTTP clients | `httpx` |
| Telegram | `telethon` |
| Image API | `openai` Python SDK |
| File parsing | `python-frontmatter` |
| DB | SQLite |
| Frontend | React + TypeScript + Vite |
| Query/data sync | TanStack Query |
| Styling | Tailwind CSS |
| Deployment | Docker + docker-compose |

---

## 13. Данные и хранение

### 13.1 Post file

Формат совместим с текущим:

```markdown
---
date: "2026-03-10"
time: "10:00"
platform: "telegram"
type: "educational"
rubric: "Разряд мифов"
hook_type: "provocation"
---

# Заголовок

Текст поста...

@biovoltru

#BioVolt #теги

**Опрос:** «Вопрос?»
1) Да
2) Нет

---

## Промпт для генерации изображения

Prompt...
```

### 13.2 SQLite tables

1. `publish_records`
   1) id
   2) file_name
   3) platform
   4) scheduled_date
   5) scheduled_time
   6) message_id
   7) poll_message_id
   8) status (`draft` | `scheduled` | `published` | `failed` | `cancelled`)
   9) published_at
   10) error
2. `publish_attempts`
   1) id
   2) file_name
   3) attempt_type
   4) payload_snapshot
   5) result
   6) created_at
3. `app_settings`
   1) key
   2) value
   3) updated_at

---

## 14. API-контур

### 14.1 Posts

```
GET    /api/posts
GET    /api/posts/{filename}
POST   /api/posts
PUT    /api/posts/{filename}
```

Удаление постов через API не предусмотрено.

### 14.2 Preview

```
POST   /api/preview
```

Принимает draft payload и возвращает:

1. rendered text
2. parsed poll
3. validation issues (errors, warnings, info)
4. char count
5. normalized platform data

Live-preview работает до сохранения файла.

### 14.3 Media

```
POST   /api/media/generate
POST   /api/media/upload/{filename}
DELETE /api/media/{filename}
GET    /api/media/{filename}
GET    /api/media/models
```

### 14.4 Publish

```
POST   /api/publish/{filename}
GET    /api/schedules
DELETE /api/schedules/{filename}
PATCH  /api/schedules/{filename}
```

### 14.5 Settings

```
GET    /api/settings
PUT    /api/settings
```

Возвращает и обновляет настройки (без значений токенов на GET — только masked).

---

## 15. Миграция с MCP

### 15.1 Что переносим

Из `mcps/publish-mcp/`:

1. parser logic
2. post models
3. formatters (Telegram HTML, VK plain text)
4. Telegram client (Telethon)
5. VK client
6. cancel scheduled flow

Из `mcps/image-gen-mcp/`:

1. OpenAI-compatible image generation client
2. model listing
3. image decoding and save flow

### 15.2 Что меняем при переносе

1. Удалить `FastMCP` и `@mcp.tool()` обёртки.
2. Убрать text-return интерфейсы, заменить на typed service responses.
3. Заменить `publish_store.json` на SQLite.
4. Вынести config в backend config layer + settings UI.
5. Переписать preview API для работы с draft payload.

### 15.3 После миграции

Папки `mcps/publish-mcp/` и `mcps/image-gen-mcp/` удаляются из репозитория.

---

## 16. План разработки

### Этап 0. Extraction foundation

Результат:

1. Backend skeleton (FastAPI + Docker)
2. Parser/formatter/platform clients перенесены из MCP
3. SQLite schema
4. Базовые integration tests

### Этап 1. MVP core

Результат:

1. Список постов с фильтрами
2. Создание поста
3. Редактор с ручным сохранением
4. Preview API (Telegram + VK)
5. Валидация (errors, warnings, info)
6. Upload image
7. Генерация изображения
8. Publish now + schedule
9. Просмотр/отмена/перенос scheduled
10. Settings screen
11. Frontend полностью собран

### Этап 2. Release 2

Результат:

1. Календарь запланированных публикаций
2. Дубль поста под вторую платформу

### Этап 3. Release 3

Результат:

1. Dashboard
2. WYSIWYG-режим

---

## 17. Риски

1. Telegram и VK ведут себя по-разному с poll и schedule — нужен platform-specific status model.
2. Внешний image API может быть недоступен — upload своего изображения обязателен.
3. Существующие markdown-посты могут содержать неидеальный формат — parser должен быть tolerant.
4. Policy-таблица и knowledge base могут расходиться — policy-таблица в коде является каноническим источником.

---

## 18. Метрики успеха

| Метрика | Сейчас | Цель |
|---------|--------|------|
| Подготовка и публикация 1 поста | 10-15 мин | 3-5 мин |
| Публикация без терминала | нет | да |
| Время publish action | 2-3 мин | до 30 сек |
| Ошибки формата | частые | ловятся в UI |
| Зависимость от MCP в runtime | полная | отсутствует |
