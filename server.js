import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const API_URL = process.env.XENAI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const MAX_HISTORY = 16;

app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function findKnowledge(query) {
  try {
    const docs = JSON.parse(await fs.readFile(path.join(__dirname, 'data/knowledge.json'), 'utf8'));
    const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    if (!words.length) return [];
    return docs.map(doc => {
      const text = `${doc.title || ''} ${doc.content || ''}`.toLowerCase();
      const score = words.reduce((n, word) => n + (text.includes(word) ? 1 : 0), 0);
      return { ...doc, score };
    }).filter(doc => doc.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  } catch {
    return [];
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ name: 'XENAI', ready: Boolean(process.env.GROQ_API_KEY), knowledge: true });
});

app.post('/api/chat', async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: 'المحرك غير موصول بمزود الذكاء الاصطناعي. أضف GROQ_API_KEY إلى ملف .env ثم أعد تشغيل التطبيق.' });
  }
  const { messages, image } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'أرسل رسالة واحدة على الأقل.' });
  }
  if (image && (typeof image !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/i.test(image) || image.length > 10_000_000)) {
    return res.status(400).json({ error: 'الصورة غير صالحة أو أكبر من الحد المسموح.' });
  }

  const history = messages.slice(-MAX_HISTORY).map(message => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: String(message.content || '').slice(0, 8000)
  }));
  const latest = [...history].reverse().find(item => item.role === 'user');
  const knowledge = latest ? await findKnowledge(latest.content) : [];
  const knowledgeNote = knowledge.length
    ? `\n\nملاحظات من قاعدة معرفة XENAI (استخدمها عند ارتباطها بالسؤال، ولا تخترع معلومات غير موجودة):\n${knowledge.map(d => `- ${d.title || 'معلومة'}: ${d.content}`).join('\n')}`
    : '';

  const system = `أنت XENAI، مساعد ذكي ودود ودقيق. أجب بلغة المستخدم، وكن واضحاً. إذا لم تعرف معلومة فقل ذلك بصراحة. لا تدّعِ أنك درّبت نموذجاً أساسياً بنفسك.${knowledgeNote}`;
  const chatMessages = [{ role: 'system', content: system }, ...history];
  if (image) {
    const lastUser = [...chatMessages].reverse().find(item => item.role === 'user');
    lastUser.content = [
      { type: 'text', text: lastUser.content || 'صف هذه الصورة.' },
      { type: 'image_url', image_url: { url: image } }
    ];
  }

  try {
    const model = image ? (process.env.XENAI_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct') : (process.env.XENAI_MODEL || 'llama-3.3-70b-versatile');
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: chatMessages, temperature: 0.7, max_tokens: 1200 })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('AI provider error:', upstream.status, data?.error?.message || 'Unknown error');
      return res.status(502).json({ error: 'تعذر الحصول على رد من مزود الذكاء الاصطناعي. تحقق من المفتاح واسم النموذج.' });
    }
    const reply = data.choices?.[0]?.message?.content;
    if (typeof reply !== 'string') return res.status(502).json({ error: 'وصل رد غير متوقع من المزود.' });
    res.json({ reply, model });
  } catch (error) {
    console.error('XENAI request failed:', error.message);
    res.status(502).json({ error: 'تعذر الاتصال بمزود الذكاء الاصطناعي. حاول مرة أخرى.' });
  }
});

app.listen(port, () => console.log(`XENAI is running at http://localhost:${port}`));
