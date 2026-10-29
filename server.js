// Мастер Отделки v0.2 — backend пример для Node.js 18+
 // Запуск: npm install express openai
 // Затем: OPENAI_API_KEY=... npm start
 // API-ключ хранить только в переменных окружения хостинга.
const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

// Basic abuse protection. For a public production app, also configure provider-side spending limits.
const diagnoseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуй позже.' }
});

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(client) });
});

app.post('/api/diagnose', diagnoseLimiter, async (req, res) => {
  if (!client) return res.status(503).json({ error: 'На сервере не настроен OPENAI_API_KEY.' });
  const prompt = typeof req.body.prompt === 'string' ? req.body.prompt.slice(0, 8000) : '';
  const imageDataUrl = req.body.imageDataUrl;
  if (!prompt) return res.status(400).json({ error: 'Добавь описание задачи.' });

  try {
    const content = [{ type: 'input_text', text:
      'Ты практичный помощник отделочника. Отвечай на русском. Разделяй подтверждённые наблюдения и предположения. Если фото недостаточно, задай уточняющие вопросы. Давай безопасные пошаговые рекомендации, инструменты, материалы и контроль результата. Не выдумывай точные нормы и расход: попроси данные с упаковки или техкарты. Для опасных конструктивных дефектов рекомендуй очный осмотр.\n\nЗапрос пользователя: ' + prompt
    }];
    if (typeof imageDataUrl === 'string' && /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
      if (imageDataUrl.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Фото слишком большое. Выбери изображение поменьше.' });
      content.push({ type: 'input_image', image_url: imageDataUrl, detail: 'high' });
    }
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: [{ role: 'user', content }],
      max_output_tokens: 1200
    });
    res.json({ answer: response.output_text || 'Модель не вернула текстовый ответ.' });
  } catch (err) {
    console.error('AI request failed:', err.message);
    res.status(502).json({ error: 'Не удалось получить ответ от ИИ. Проверь настройки модели и API-биллинг.' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Мастер Отделки запущен на порту ${port}`));
