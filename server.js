require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'NiyaAV2026!';
const AUDITS_PATH  = path.join(__dirname, 'niya', 'audits.json');
const SURVEYS_PATH = path.join(__dirname, 'niya', 'surveys.json');

// Ensure niya directory and data files exist
const niyaDir = path.join(__dirname, 'niya');
if (!fs.existsSync(niyaDir)) fs.mkdirSync(niyaDir, { recursive: true });
if (!fs.existsSync(AUDITS_PATH))  fs.writeFileSync(AUDITS_PATH,  '[]', 'utf8');
if (!fs.existsSync(SURVEYS_PATH)) fs.writeFileSync(SURVEYS_PATH, '[]', 'utf8');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ────────────────────────────────────────────────────────────────

function readAudits() {
  try {
    return JSON.parse(fs.readFileSync(AUDITS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeAudits(audits) {
  fs.writeFileSync(AUDITS_PATH, JSON.stringify(audits, null, 2), 'utf8');
}

function authMiddleware(req, res, next) {
  const password = req.headers['x-admin-password'] || req.body?.password;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function readSurveys() {
  try { return JSON.parse(fs.readFileSync(SURVEYS_PATH, 'utf8')); } catch { return []; }
}
function writeSurveys(s) {
  fs.writeFileSync(SURVEYS_PATH, JSON.stringify(s, null, 2), 'utf8');
}
function generateSlug(len = 7) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// POST /api/audit — run a new audit
app.post('/api/audit', async (req, res) => {
  try {
    const { name, brand, business_type, touchpoints, source = 'public', niya_notes = '', survey_slug = null, extra_answers = [] } = req.body;

    if (!name || !brand || !touchpoints || !Array.isArray(touchpoints) || touchpoints.length < 1) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const touchpointsList = touchpoints
      .map((tp, i) => `${i + 1}. ${tp.name}\n   Intended feeling: ${tp.intended_feeling}\n   Actual feeling: ${tp.actual_feeling}`)
      .join('\n\n');

    const prompt = `You are an emotional intelligence design consultant. You think with the precision of a UX researcher and the warmth of a trusted advisor.

A person has mapped their customer journey and identified the gap between the feeling they intend to create and the feeling they think customers actually experience.

Here is their data:

Brand: ${brand}
Business type: ${business_type || 'Not specified'}

Touchpoints:
${touchpointsList}

Analyze this journey and return ONLY a valid JSON object with this exact structure. No preamble. No markdown. Only JSON.

{
  "overall_score": <integer 0-100, representing overall emotional coherence>,
  "headline": "<8-12 word headline capturing the core emotional truth>",
  "narrative": "<2-3 sentences. Warm, honest, specific to their answers. Sound like a trusted advisor, not a report. Never generic.>",
  "dimensions": [
    {
      "name": "First Signal",
      "score": <0-100>,
      "rating": "<strong|medium|weak>",
      "insight": "<1-2 sentences specific to their first touchpoint>"
    },
    {
      "name": "Transition Fidelity",
      "score": <0-100>,
      "rating": "<strong|medium|weak>",
      "insight": "<1-2 sentences about how well the feeling carries between touchpoints>"
    },
    {
      "name": "Trust Architecture",
      "score": <0-100>,
      "rating": "<strong|medium|weak>",
      "insight": "<1-2 sentences about credibility signals>"
    },
    {
      "name": "Overwhelm Index",
      "score": <0-100>,
      "rating": "<strong|medium|weak>",
      "insight": "<1-2 sentences. High score = low overwhelm = good.>"
    },
    {
      "name": "Emotional Coherence",
      "score": <0-100>,
      "rating": "<strong|medium|weak>",
      "insight": "<1-2 sentences about the overall thread>"
    }
  ],
  "gaps": [
    {
      "type": "<warn|ok>",
      "title": "<short title>",
      "description": "<1-2 sentences, specific, actionable, warm>"
    },
    {
      "type": "<warn|ok>",
      "title": "<short title>",
      "description": "<1-2 sentences>"
    },
    {
      "type": "<warn|ok>",
      "title": "<short title>",
      "description": "<1-2 sentences>"
    }
  ],
  "coherence_map": [
    {
      "touchpoint": "<touchpoint name>",
      "status": "<strong|medium|weak>",
      "gap_to_next": "<null or 1 sentence describing the gap to the next touchpoint>"
    }
  ]
}

Be ruthlessly specific to their actual answers. Never give generic advice. Make the person feel deeply seen.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    const rawContent = message.content[0].text.trim();
    // Strip markdown code fences if present
    const jsonStr = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch {
      return res.status(500).json({ error: 'AI returned invalid JSON', raw: rawContent });
    }

    const audit = {
      id: uuidv4(),
      created_at: new Date().toISOString(),
      name,
      brand,
      business_type: business_type || '',
      touchpoints,
      extra_answers,
      result,
      niya_notes,
      source,
      survey_slug
    };

    const audits = readAudits();
    audits.unshift(audit);
    writeAudits(audits);

    // Link audit to survey if submitted via survey link
    if (survey_slug) {
      const surveys = readSurveys();
      const si = surveys.findIndex(s => s.slug === survey_slug);
      if (si !== -1) { surveys[si].audit_ids.push(audit.id); writeSurveys(surveys); }
    }

    res.json(audit);
  } catch (err) {
    console.error('Audit error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audits — protected, returns all audits
app.get('/api/audits', authMiddleware, (req, res) => {
  res.json(readAudits());
});

// GET /api/audit/:id — get single audit (public, for results page)
app.get('/api/audit/:id', (req, res) => {
  const audits = readAudits();
  const audit = audits.find(a => a.id === req.params.id);
  if (!audit) return res.status(404).json({ error: 'Not found' });
  res.json(audit);
});

// POST /api/audit/:id/note — add Niya's note
app.post('/api/audit/:id/note', authMiddleware, (req, res) => {
  const { note } = req.body;
  const audits = readAudits();
  const idx = audits.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  audits[idx].niya_notes = note;
  writeAudits(audits);
  res.json(audits[idx]);
});

// DELETE /api/audit/:id — delete an audit
app.delete('/api/audit/:id', authMiddleware, (req, res) => {
  const audits = readAudits();
  const idx = audits.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  audits.splice(idx, 1);
  writeAudits(audits);
  res.json({ success: true });
});

// GET /api/export — export all audits as JSON (protected)
app.get('/api/export', authMiddleware, (req, res) => {
  const audits = readAudits();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="audits-export.json"');
  res.send(JSON.stringify(audits, null, 2));
});

// POST /api/pdf — generate PDF from audit data
app.post('/api/pdf', async (req, res) => {
  try {
    const { auditId } = req.body;
    let audit;

    if (auditId) {
      const audits = readAudits();
      audit = audits.find(a => a.id === auditId);
      if (!audit) return res.status(404).json({ error: 'Audit not found' });
    } else {
      audit = req.body.audit;
    }

    if (!audit) return res.status(400).json({ error: 'No audit data provided' });

    const puppeteer = require('puppeteer');
    const htmlContent = buildPdfHtml(audit);

    const executablePath = process.env.CHROMIUM_PATH ||
      ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
        .find(p => { try { require('fs').accessSync(p); return true; } catch { return false; } });

    const browser = await puppeteer.launch({
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 800 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Auto-detect exact content height
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);

    const pdfBuffer = await page.pdf({
      width: '1000px',
      height: `${bodyHeight + 80}px`,
      printBackground: true,
      margin: { top: '40px', right: '0px', bottom: '40px', left: '0px' }
    });

    await browser.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="emotional-gap-audit-${audit.brand.toLowerCase().replace(/\s+/g, '-')}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF error:', err);
    res.status(500).json({ error: err.message });
  }
});

function buildPdfHtml(audit) {
  const { name, brand, result, touchpoints, created_at } = audit;
  const date = new Date(created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const score = result.overall_score;

  const ratingColor = (r) => r === 'strong' ? '#6B8F71' : r === 'medium' ? '#C9A24A' : '#C4694A';
  const scoreColor = (s) => s >= 70 ? '#6B8F71' : s >= 45 ? '#C9A24A' : '#C4694A';

  const dimensionsHtml = (result.dimensions || []).map(d => `
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-family:Georgia,serif;font-size:16px;color:#F0EDE6;">${d.name}</span>
        <span style="font-size:22px;font-weight:700;color:${ratingColor(d.rating)};">${d.score}</span>
      </div>
      <div style="background:#0D0D0D;border-radius:4px;height:6px;margin-bottom:10px;">
        <div style="background:${ratingColor(d.rating)};width:${d.score}%;height:6px;border-radius:4px;"></div>
      </div>
      <p style="color:#A0A0A0;font-size:13px;margin:0;line-height:1.6;">${d.insight}</p>
    </div>
  `).join('');

  const gapsHtml = (result.gaps || []).map(g => `
    <div style="display:flex;gap:14px;padding:16px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
      <span style="font-size:18px;flex-shrink:0;">${g.type === 'warn' ? '⚠' : '✓'}</span>
      <div>
        <div style="color:#F0EDE6;font-weight:600;margin-bottom:4px;">${g.title}</div>
        <div style="color:#A0A0A0;font-size:13px;line-height:1.6;">${g.description}</div>
      </div>
    </div>
  `).join('');

  const mapHtml = (result.coherence_map || []).map(node => {
    const c = node.status === 'strong' ? '#6B8F71' : node.status === 'medium' ? '#C9A24A' : '#C4694A';
    return `<div style="display:inline-block;text-align:center;margin:0 12px;"><div style="width:56px;height:56px;border-radius:50%;background:${c};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:10px;color:#0D0D0D;font-weight:600;padding:4px;">${node.touchpoint.substring(0,12)}</div></div>`;
  }).join('<span style="color:#7A7A7A;font-size:20px;vertical-align:middle;">→</span>');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; page-break-inside: avoid; }
  body { background: #0D0D0D; color: #F0EDE6; font-family: 'DM Sans', Arial, sans-serif; padding: 48px; }
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600&display=swap');
</style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px;padding-bottom:24px;border-bottom:1px solid rgba(201,162,74,0.3);">
    <div>
      <div style="color:#C9A24A;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:8px;">Activate Vision</div>
      <div style="font-family:Georgia,serif;font-size:28px;color:#F0EDE6;line-height:1.2;">Emotional Gap Audit</div>
      <div style="color:#7A7A7A;font-size:13px;margin-top:6px;">${name} · ${brand} · ${date}</div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:56px;font-family:Georgia,serif;color:${scoreColor(score)};line-height:1;">${score}</div>
      <div style="color:#7A7A7A;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">Coherence Score</div>
    </div>
  </div>

  <!-- Headline -->
  <div style="margin-bottom:32px;">
    <div style="font-family:Georgia,serif;font-size:22px;color:#F0EDE6;margin-bottom:16px;font-style:italic;">"${result.headline}"</div>
    <div style="background:#1A1A1A;border-left:3px solid #C9A24A;padding:20px 24px;border-radius:0 12px 12px 0;">
      <div style="color:#C9A24A;font-size:28px;line-height:1;margin-bottom:8px;">"</div>
      <p style="color:#D0CDC6;line-height:1.7;font-size:14px;">${result.narrative}</p>
    </div>
  </div>

  <!-- Coherence Map -->
  <div style="margin-bottom:32px;">
    <div style="color:#7A7A7A;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">Coherence Map</div>
    <div style="background:#141414;border-radius:12px;padding:24px;text-align:center;">${mapHtml}</div>
  </div>

  <!-- Dimensions -->
  <div style="margin-bottom:32px;">
    <div style="color:#7A7A7A;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">Five Dimensions</div>
    ${dimensionsHtml}
  </div>

  <!-- Focus Areas -->
  <div style="margin-bottom:48px;">
    <div style="color:#7A7A7A;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">Where to Focus Next</div>
    <div style="background:#1A1A1A;border-radius:12px;padding:8px 20px;">${gapsHtml}</div>
  </div>

  <!-- Footer -->
  <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="color:#7A7A7A;font-size:11px;">Built on the emotional intelligence framework of Activate Vision</div>
    <div style="color:#7A7A7A;font-size:11px;">Powered by Claude AI · activate.vision</div>
  </div>
</body>
</html>`;
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Survey routes ───────────────────────────────────────────────────────────

// GET /s/:slug — serve client survey page
app.get('/s/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'survey.html'));
});

// GET /api/survey/:slug — public, returns survey config
app.get('/api/survey/:slug', (req, res) => {
  const survey = readSurveys().find(s => s.slug === req.params.slug);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });
  res.json(survey);
});

// GET /api/surveys — admin, list all surveys
app.get('/api/surveys', authMiddleware, (req, res) => {
  res.json(readSurveys());
});

// POST /api/surveys — admin, create survey
app.post('/api/surveys', authMiddleware, (req, res) => {
  const surveys = readSurveys();
  let slug = generateSlug();
  while (surveys.find(s => s.slug === slug)) slug = generateSlug();
  const survey = {
    id: uuidv4(),
    slug,
    client_label: req.body.client_label || 'Client',
    entity_word: req.body.entity_word || 'brand',
    intro_message: req.body.intro_message || '',
    context: req.body.context || '',
    questions: req.body.questions || [],
    warmup_questions: req.body.warmup_questions || [],
    ai_summary: null,
    created_at: new Date().toISOString(),
    audit_ids: []
  };
  surveys.unshift(survey);
  writeSurveys(surveys);
  res.json(survey);
});

// PUT /api/survey/:slug — admin, update survey
app.put('/api/survey/:slug', authMiddleware, (req, res) => {
  const surveys = readSurveys();
  const idx = surveys.findIndex(s => s.slug === req.params.slug);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  surveys[idx] = { ...surveys[idx], ...req.body, slug: req.params.slug };
  writeSurveys(surveys);
  res.json(surveys[idx]);
});

// DELETE /api/survey/:slug — admin
app.delete('/api/survey/:slug', authMiddleware, (req, res) => {
  const surveys = readSurveys();
  const idx = surveys.findIndex(s => s.slug === req.params.slug);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  surveys.splice(idx, 1);
  writeSurveys(surveys);
  res.json({ success: true });
});

// POST /api/survey/:slug/summarize — AI summary of all responses
app.post('/api/survey/:slug/summarize', authMiddleware, async (req, res) => {
  const surveys = readSurveys();
  const idx = surveys.findIndex(s => s.slug === req.params.slug);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const survey = surveys[idx];
  const audits = readAudits().filter(a => survey.audit_ids.includes(a.id));
  if (audits.length === 0) return res.status(400).json({ error: 'No audits to summarize' });

  const auditSummaries = audits.map(a =>
    `Respondent: ${a.name}\nScore: ${a.result?.overall_score}\nHeadline: ${a.result?.headline}\nNarrative: ${a.result?.narrative}`
  ).join('\n\n---\n\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `You are Niya's analytical assistant. Summarize the patterns across these ${audits.length} emotional gap audit responses for client "${survey.client_label}". Be specific, warm, and actionable. 2-3 sentences max.\n\n${auditSummaries}`
    }]
  });
  const summary = message.content[0].text;
  surveys[idx].ai_summary = summary;
  writeSurveys(surveys);
  res.json({ summary });
});

// ─── Chat / AI streaming ──────────────────────────────────────────────────────

// POST /api/chat — unified SSE streaming chat for all modes
app.post('/api/chat', async (req, res) => {
  const { mode, messages, context } = req.body;

  // Auth check for privileged modes
  if (mode === 'builder' || mode === 'dashboard') {
    const pw = req.headers['x-admin-password'] || req.body?.adminPassword;
    if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  }

  const systemPrompts = {
    builder: `You are an expert survey designer helping Niya, an emotional intelligence consultant at Activate Vision, create a custom emotional gap audit survey for a client.

Your job: Ask smart clarifying questions about the client, then generate a complete survey JSON.

When you have enough context (usually after 2-3 exchanges), output the survey as valid JSON wrapped in <survey>...</survey> tags. The JSON structure:
{
  "client_label": "string",
  "entity_word": "brand|product|organization|service|company or custom",
  "intro_message": "2-3 sentences welcoming the client, warm and specific",
  "context": "internal context summary for Niya",
  "warmup_questions": ["question 1", "question 2"],
  "questions": [
    { "id": "q1", "type": "touchpoint_feelings", "label": "Map your [entity_word] journey" },
    { "id": "q2", "type": "open", "label": "..." },
    { "id": "q3", "type": "scale", "label": "...", "min": 1, "max": 10 },
    { "id": "q4", "type": "multiple_choice", "label": "...", "options": ["A","B","C","D"] },
    { "id": "q5", "type": "yes_no", "label": "..." },
    { "id": "q6", "type": "context", "label": "..." },
    { "id": "q7", "type": "single_feeling", "label": "..." },
    { "id": "q8", "type": "ranking", "label": "...", "options": ["A","B","C"] }
  ]
}

Question types available: touchpoint_feelings, open, context, single_feeling, scale, multiple_choice, yes_no, ranking.
Always include at least one touchpoint_feelings question. Mix 4-7 questions total. Make warmup_questions (2-3) relevant to the specific client context.

Be conversational, warm, and smart. Ask one or two focused questions at a time. When generating the survey, precede it with a brief explanation of your choices.`,

    warmup: `You are a warm, perceptive guide preparing someone for their emotional gap audit. The survey context: ${JSON.stringify(context?.survey || {})}.

Ask 2-3 short, thoughtful questions that help the respondent reflect before they map their journey. Questions should be specific to the survey's focus (entity: ${context?.survey?.entity_word || 'brand'}, client: ${context?.survey?.client_label || 'this organization'}).

Be conversational — like a thoughtful colleague, not a form. Keep each message short (1-2 sentences). After 2-3 exchanges, say something warm like "You're ready. Let's map this together." and end with <ready/> tag on its own line.`,

    results: `You are a warm, precise interpreter of emotional intelligence reports. The user just received their emotional gap audit results: ${JSON.stringify(context?.result || {})}.

Help them understand their specific report. Reference their actual scores, touchpoints, and gaps. Be specific — never generic. Sound like a trusted advisor. Keep responses focused (3-5 sentences). Always end with a practical next step.`,

    dashboard: `You are Niya's analytical assistant at Activate Vision. You have access to her audit data: ${JSON.stringify(context?.audits?.slice(0, 20) || [])}.

Help Niya analyze patterns, draft client communications, identify insights, and make strategic decisions. Be direct, intelligent, and specific. You can reference specific clients and scores from her data.`
  };

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompts[mode] || systemPrompts.results,
      messages
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }
  res.end();
});

// Catch-all: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🌿 Emotional Gap Audit running on http://localhost:${PORT}\n`);
});
