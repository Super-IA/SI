require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function safeFetch(url, options, providerName) {
  try {
    const res = await fetch(url, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
      return { ok: false, provider: providerName, error: String(msg) };
    }
    return { ok: true, provider: providerName, data };
  } catch (err) {
    return { ok: false, provider: providerName, error: err.message };
  }
}

async function askDeepSeek(prompt) {
  if (!process.env.DEEPSEEK_API_KEY) return { ok: false, provider: 'DeepSeek', error: 'Falta DEEPSEEK_API_KEY' };
  const r = await safeFetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.7 })
  }, 'DeepSeek');
  if (!r.ok) return r;
  return { ok: true, provider: 'DeepSeek', text: r.data.choices[0].message.content };
}

async function askOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) return { ok: false, provider: 'ChatGPT', error: 'Falta OPENAI_API_KEY' };
  const r = await safeFetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 1200, temperature: 0.7 })
  }, 'ChatGPT');
  if (!r.ok) return r;
  return { ok: true, provider: 'ChatGPT', text: r.data.choices[0].message.content };
}

async function askClaude(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, provider: 'Claude', error: 'Falta ANTHROPIC_API_KEY' };
  const r = await safeFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-3-5-sonnet-20241022', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] })
  }, 'Claude');
  if (!r.ok) return r;
  return { ok: true, provider: 'Claude', text: r.data.content[0].text };
}

async function askGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) return { ok: false, provider: 'Gemini', error: 'Falta GEMINI_API_KEY' };
  const r = await safeFetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 1200, temperature: 0.7 } })
  }, 'Gemini');
  if (!r.ok) return r;
  const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '(sin respuesta)';
  return { ok: true, provider: 'Gemini', text };
}

app.post('/api/council', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') return res.status(400).json({ error: 'Falta el campo "prompt"' });
  const [deepseek, openai, claude, gemini] = await Promise.all([
    askDeepSeek(prompt), askOpenAI(prompt), askClaude(prompt), askGemini(prompt)
  ]);
  res.json({ prompt, timestamp: Date.now(), results: [deepseek, openai, claude, gemini] });
});

app.post('/api/judge', async (req, res) => {
  const { prompt, answers } = req.body;
  if (!prompt || !Array.isArray(answers)) return res.status(400).json({ error: 'Faltan datos' });
  const judgePrompt = `Eres un evaluador imparcial experto. Un usuario preguntó:\n"${prompt}"\n\nEstas son las respuestas de 4 IAs:\n${answers.map((a,i)=>`=== RESPUESTA ${String.fromCharCode(65+i)} (${a.provider}) ===\n${a.ok?a.text:'ERROR: '+a.error}\n`).join('\n')}\n\nDevuelve en este formato exacto:\nGANADORA: <letra>\nPUNTUACIÓN: A=X/10, B=Y/10, C=Z/10, D=W/10\nRAZÓN: <explicación breve>\nSÍNTESIS: <combina lo mejor de todas>`;
  const verdict = await askDeepSeek(judgePrompt);
  if (!verdict.ok) return res.status(500).json({ error: 'Error del juez', detail: verdict.error });
  res.json({ verdict: verdict.text });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🧠 Super-IA Superintelligence escuchando en http://localhost:${PORT}`));