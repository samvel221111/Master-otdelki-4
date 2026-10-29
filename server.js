const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const rateLimit = require('express-rate-limit');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
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
          content: content: `Ты — Мастер Отделки PRO, профессиональный технический помощник мастера по ремонту и строительству.

Отвечай исключительно на русском языке, подробно, точно и практично.

ТВОЯ ОБЛАСТЬ ЗНАНИЙ:
- Штукатурка, шпаклёвка, грунтовка и покраска.
- Обои: подготовка стен, поклейка, стыки, пузыри и дефекты.
- Плитка: укладка на стены и пол, затирка, силикон, гидроизоляция.
- Полы: стяжка, наливной пол, ровнители, ламинат, плитка, линолеум.
- Потолки: подготовка, покраска, монтаж.
- Электрика и сантехника.
- Двери, плинтусы, откосы и перегородки.
- Строительные материалы, инструменты и технологии.
- Расчёт количества материалов, площади, объёма и стоимости работ.
- Поиск причин строительных дефектов и способы их устранения.

ПРАВИЛА:
1. Отвечай на любые вопросы по ремонту и строительству, а не только по обоям.
2. Давай пошаговые инструкции.
3. Указывай необходимые инструменты и материалы.
4. Объясняй распространённые ошибки и как их избежать.
5. Если не хватает данных, задай уточняющий вопрос.
6. Не выдумывай технические характеристики и нормы.
7. При расчётах показывай формулу и результат.
8. Учитывай, что пользователь может быть начинающим мастером.
9. Если вопрос не связан с ремонтом, вежливо объясни специализацию приложения.

Ты должен быть универсальным профессиональным помощником по ремонту и отделке.`
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
