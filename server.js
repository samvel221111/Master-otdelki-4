const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname), { extensions: ['html'] }));

const diagnoseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Попробуй позже.' }
});

const client = process.env.GROQ_API_KEY
  ? new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1'
    })
  : null;

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(client) });
});

app.post('/api/diagnose', diagnoseLimiter, async (req, res) => {
  if (!client) {
    return res.status(503).json({
      error: 'На сервере не настроен GROQ_API_KEY.'
    });
  }

  const prompt = typeof req.body.prompt === 'string'
    ? req.body.prompt.slice(0, 8000)
    : '';

  const imageDataUrl = req.body.imageDataUrl;

  if (!prompt) {
    return res.status(400).json({
      error: 'Добавь описание задачи.'
    });
  }

  try {
    const content = [{
      type: 'text',
      text:
        'Ты практичный помощник отделочника. Отвечай на русском языке. ' +
        'Давай понятные пошаговые рекомендации, помогай с расчётами ' +
        'материалов, инструментами и контролем качества. Разделяй ' +
        'подтверждённые наблюдения и предположения. Не выдумывай нормы ' +
        'расхода: уточняй данные с упаковки или техкарты. При опасных ' +
        'дефектах рекомендуй очный осмотр.\n\nЗапрос пользователя: ' +
        prompt
    }];

    if (typeof imageDataUrl === 'string' &&
        /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
      if (imageDataUrl.length > 10 * 1024 * 1024) {
        return res.status(413).json({
          error: 'Фото слишком большое. Выбери изображение поменьше.'
        });
      }

      content.push({
        type: 'image_url',
        image_url: { url: imageDataUrl }
      });
    }

    const response = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'qwen/qwen3.8-27b',
      messages: [
        {
          role: 'system',
          content: 'Ты опытный помощник по ремонту и отделке. Отвечай на русском, точно и по делу.'
        },
        {
          role: 'user',
          content
        }
      ],
      max_tokens: 1200
    });

    res.json({
      answer: response.choices?.[0]?.message?.content ||
        'Модель не вернула текстовый ответ.'
    });
  } catch (err) {
    console.error('Groq AI request failed:', err.message);
    res.status(502).json({
      error: 'Не удалось получить ответ от ИИ. Проверь ключ Groq, доступность модели и лимиты API.'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on port ${PORT}`);
});
