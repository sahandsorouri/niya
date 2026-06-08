require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'NiyaAV2026!';
const AUDITS_PATH  = path.join(__dirname, 'niya', 'audits.json');
const SURVEYS_PATH = path.join(__dirname, 'niya', 'surveys.json');

const niyaDir = path.join(__dirname, 'niya');
if (!fs.existsSync(niyaDir)) fs.mkdirSync(niyaDir, { recursive: true });
if (!fs.existsSync(AUDITS_PATH))  fs.writeFileSync(AUDITS_PATH,  '[]', 'utf8');
if (!fs.existsSync(SURVEYS_PATH)) fs.writeFileSync(SURVEYS_PATH, '[]', 'utf8');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ────────────────────────────────────────────────────────────────

function readAudits() {
  try { return JSON.parse(fs.readFileSync(AUDITS_PATH, 'utf8')); } catch { return []; }
}
function writeAudits(audits) {
  fs.writeFileSync(AUDITS_PATH, JSON.stringify(audits, null, 2), 'utf8');
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
function authMiddleware(req, res, next) {
  const password = req.headers['x-admin-password'] || req.body?.password;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ─── Rule-based Emotion Engine ───────────────────────────────────────────────

const EMOTION_MAP = {
  // High positive (energised, activated)
  excited: 'high_pos', energized: 'high_pos', inspired: 'high_pos',
  motivated: 'high_pos', enthusiastic: 'high_pos', thrilled: 'high_pos',
  elated: 'high_pos', joyful: 'high_pos', delighted: 'high_pos',
  exhilarated: 'high_pos', amazed: 'high_pos', wow: 'high_pos',

  // Low positive (settled, warm)
  calm: 'low_pos', peaceful: 'low_pos', safe: 'low_pos',
  comfortable: 'low_pos', reassured: 'low_pos', warm: 'low_pos',
  content: 'low_pos', satisfied: 'low_pos', trusting: 'low_pos',
  secure: 'low_pos', appreciated: 'low_pos', understood: 'low_pos',
  welcomed: 'low_pos', valued: 'low_pos', confident: 'low_pos',
  supported: 'low_pos', hopeful: 'low_pos', relieved: 'low_pos',

  // Neutral
  curious: 'neutral', focused: 'neutral', neutral: 'neutral',
  interested: 'neutral', alert: 'neutral', attentive: 'neutral',
  aware: 'neutral', thoughtful: 'neutral',

  // High negative (activated distress)
  overwhelmed: 'high_neg', stressed: 'high_neg', anxious: 'high_neg',
  rushed: 'high_neg', pressured: 'high_neg', confused: 'high_neg',
  frustrated: 'high_neg', irritated: 'high_neg', panicked: 'high_neg',
  annoyed: 'high_neg', angry: 'high_neg', lost: 'high_neg',

  // Low negative (withdrawn, absent)
  disappointed: 'low_neg', bored: 'low_neg', unimpressed: 'low_neg',
  uncertain: 'low_neg', detached: 'low_neg', numb: 'low_neg',
  indifferent: 'low_neg', skeptical: 'low_neg', ignored: 'low_neg',
  unheard: 'low_neg', forgotten: 'low_neg', unseen: 'low_neg',
  mistrustful: 'low_neg', doubtful: 'low_neg',
};

// Scores when intended category vs actual category are compared
const CROSS_SCORES = {
  high_pos: { high_pos: 94, low_pos: 76, neutral: 55, low_neg: 28, high_neg: 14 },
  low_pos:  { high_pos: 80, low_pos: 94, neutral: 60, low_neg: 32, high_neg: 18 },
  neutral:  { high_pos: 60, low_pos: 65, neutral: 72, low_neg: 44, high_neg: 38 },
  high_neg: { high_pos: 14, low_pos: 22, neutral: 42, low_neg: 52, high_neg: 64 },
  low_neg:  { high_pos: 18, low_pos: 30, neutral: 46, low_neg: 60, high_neg: 52 },
};

function classifyText(text) {
  const lower = text.toLowerCase();
  for (const [word, cat] of Object.entries(EMOTION_MAP)) {
    if (lower.includes(word)) return cat;
  }
  if (/good|great|positive|happy|love|like|enjoy|trust/.test(lower)) return 'low_pos';
  if (/bad|negative|hate|dislike|fear|worry/.test(lower)) return 'low_neg';
  return 'neutral';
}

function wordOverlap(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  return [...setA].filter(w => setB.has(w)).length;
}

function scoreTouchpoint(intended, actual) {
  const intCat = classifyText(intended);
  const actCat = classifyText(actual);
  const base = CROSS_SCORES[intCat]?.[actCat] ?? 50;
  const bonus = Math.min(8, wordOverlap(intended, actual) * 4);
  return Math.min(100, Math.max(5, base + bonus));
}

function rating(score) {
  return score >= 68 ? 'strong' : score >= 44 ? 'medium' : 'weak';
}

function tpInsight(tp, score) {
  const r = rating(score);
  if (r === 'strong') {
    return `Your ${tp.name} touchpoint is working — the ${tp.intended_feeling} you're aiming for is translating authentically. This is a strength worth protecting.`;
  }
  if (r === 'medium') {
    return `At ${tp.name} you want people to feel ${tp.intended_feeling}, but they're landing at ${tp.actual_feeling}. The gap is real but closeable with focused adjustments.`;
  }
  return `${tp.name} shows the sharpest tension — the gap between "${tp.intended_feeling}" and "${tp.actual_feeling}" is significant and likely costing trust.`;
}

function analyzeJourney(brand, business_type, touchpoints) {
  const scores = touchpoints.map(tp => scoreTouchpoint(tp.intended_feeling, tp.actual_feeling));
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // First Signal
  const firstScore = scores[0] ?? 50;

  // Transition Fidelity: average absolute step-to-step change
  let stepDelta = 0;
  for (let i = 1; i < scores.length; i++) stepDelta += Math.abs(scores[i] - scores[i - 1]);
  const avgDelta = scores.length > 1 ? stepDelta / (scores.length - 1) : 0;
  const transitionScore = Math.round(Math.max(20, 92 - avgDelta * 0.9));

  // Trust Architecture
  const trustRx = /trust|safe|secur|reliab|depend|confiden|authentic|honest/i;
  const trustHits = touchpoints.filter(tp => trustRx.test(tp.intended_feeling)).length;
  const trustScore = Math.min(95, 48 + trustHits * 14 + (avgScore > 65 ? 12 : 0));

  // Overwhelm Index (high score = low overwhelm = good)
  const overwhelmRx = /overwhelm|stress|anxious|rush|pressur|confus|too much|panic/i;
  const overwhelmCount = touchpoints.filter(tp => overwhelmRx.test(tp.actual_feeling)).length;
  const overwhelmScore = Math.round(Math.max(18, 96 - overwhelmCount * 22));

  // Emotional Coherence
  const coherenceScore = Math.round((avgScore * 0.6 + transitionScore * 0.4));

  const dimensions = [
    {
      name: 'First Signal',
      score: firstScore,
      rating: rating(firstScore),
      insight: tpInsight(touchpoints[0], firstScore),
    },
    {
      name: 'Transition Fidelity',
      score: transitionScore,
      rating: rating(transitionScore),
      insight: transitionScore >= 68
        ? `The emotional thread holds across your ${touchpoints.length} touchpoints — each step follows naturally from the last.`
        : `There are noticeable emotional shifts between touchpoints. Customers may feel disoriented as they move through your journey.`,
    },
    {
      name: 'Trust Architecture',
      score: trustScore,
      rating: rating(trustScore),
      insight: trustScore >= 68
        ? `Your journey intentionally builds credibility — trust signals are woven into how you design each step.`
        : `Trust cues are missing or implicit. Customers may feel hesitant without clear signals that you're reliable and safe.`,
    },
    {
      name: 'Overwhelm Index',
      score: overwhelmScore,
      rating: rating(overwhelmScore),
      insight: overwhelmScore >= 68
        ? `Your experience doesn't overload customers — the cognitive and emotional load feels manageable throughout.`
        : `Several touchpoints are generating unwanted stress or confusion. Simplifying these could meaningfully lift conversion.`,
    },
    {
      name: 'Emotional Coherence',
      score: coherenceScore,
      rating: rating(coherenceScore),
      insight: coherenceScore >= 68
        ? `Your brand story holds together emotionally — the feeling you're building is consistent and intentional.`
        : `The emotional narrative across your journey lacks coherence. Customers may struggle to form a clear impression of what your brand stands for.`,
    },
  ];

  // Gaps
  const gaps = [];
  const sorted = [...scores.map((s, i) => ({ s, i }))].sort((a, b) => a.s - b.s);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];

  if (weakest.s < 50) {
    const tp = touchpoints[weakest.i];
    gaps.push({
      type: 'warn',
      title: `Gap at ${tp.name}`,
      description: `"${tp.intended_feeling}" is your intention, but "${tp.actual_feeling}" is what lands. This touchpoint needs the most attention — it may be undermining trust built elsewhere.`,
    });
  }

  if (overwhelmCount > 0) {
    gaps.push({
      type: 'warn',
      title: 'Emotional Friction Points',
      description: `${overwhelmCount} touchpoint${overwhelmCount > 1 ? 's are' : ' is'} generating unwanted stress. Reducing friction here would improve coherence and retention.`,
    });
  } else {
    gaps.push({
      type: 'ok',
      title: 'Low Overwhelm Profile',
      description: `Your journey doesn't create unnecessary stress — a genuine strength, especially in high-consideration decisions.`,
    });
  }

  if (strongest.s >= 70) {
    const tp = touchpoints[strongest.i];
    gaps.push({
      type: 'ok',
      title: `Strong Anchor at ${tp.name}`,
      description: `This touchpoint is your emotional anchor — the feeling you're creating here is working. Consider how to extend this energy across the rest of the journey.`,
    });
  } else {
    gaps.push({
      type: 'warn',
      title: 'No Clear Emotional Anchor',
      description: `Your journey lacks a standout emotional moment. Customers may leave without a memorable feeling. Find one touchpoint to make unmistakably yours.`,
    });
  }

  const coherence_map = touchpoints.map((tp, i) => ({
    touchpoint: tp.name,
    status: rating(scores[i]),
    gap_to_next: i < touchpoints.length - 1 && Math.abs(scores[i] - scores[i + 1]) > 22
      ? `Noticeable shift between "${tp.name}" and "${touchpoints[i + 1].name}" — the emotional continuity breaks here.`
      : null,
  }));

  const headline = avgScore >= 70
    ? `${brand} creates an emotionally coherent journey worth sharing`
    : avgScore >= 45
    ? `${brand}'s journey has real promise — with a few key gaps to close`
    : `${brand} has significant emotional gaps that are costing trust and connection`;

  const biz = business_type || 'businesses';
  const narrative = avgScore >= 70
    ? `${brand} is doing something most ${biz} don't: building a journey where intended and actual feelings align. Your customers can feel the intentionality. The work now is to protect these strengths as you scale.`
    : avgScore >= 45
    ? `There's a genuine vision behind ${brand}'s journey, but it isn't landing consistently. Some touchpoints are working beautifully; others are creating quiet friction that customers feel but might not name. The gap between intention and experience is closeable — but it needs deliberate design.`
    : `${brand}'s journey has an ambition-to-experience gap worth taking seriously. The feelings you're designing for are thoughtful — but customers are experiencing something quite different. This isn't a brand problem; it's an execution and communication problem, and both are fixable.`;

  return { overall_score: avgScore, headline, narrative, dimensions, gaps, coherence_map };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.post('/api/audit', async (req, res) => {
  try {
    const { name, brand, business_type, touchpoints, source = 'public', niya_notes = '', survey_slug = null, extra_answers = [] } = req.body;

    if (!name || !brand || !touchpoints || !Array.isArray(touchpoints) || touchpoints.length < 1) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = analyzeJourney(brand, business_type, touchpoints);

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
      survey_slug,
    };

    const audits = readAudits();
    audits.unshift(audit);
    writeAudits(audits);

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

app.get('/api/audits', authMiddleware, (req, res) => {
  res.json(readAudits());
});

app.get('/api/audit/:id', (req, res) => {
  const audit = readAudits().find(a => a.id === req.params.id);
  if (!audit) return res.status(404).json({ error: 'Not found' });
  res.json(audit);
});

app.post('/api/audit/:id/note', authMiddleware, (req, res) => {
  const { note } = req.body;
  const audits = readAudits();
  const idx = audits.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  audits[idx].niya_notes = note;
  writeAudits(audits);
  res.json(audits[idx]);
});

app.delete('/api/audit/:id', authMiddleware, (req, res) => {
  const audits = readAudits();
  const idx = audits.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  audits.splice(idx, 1);
  writeAudits(audits);
  res.json({ success: true });
});

app.get('/api/export', authMiddleware, (req, res) => {
  const audits = readAudits();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="audits-export.json"');
  res.send(JSON.stringify(audits, null, 2));
});

app.post('/api/pdf', async (req, res) => {
  try {
    const { auditId } = req.body;
    let audit;

    if (auditId) {
      audit = readAudits().find(a => a.id === auditId);
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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 800 });
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);

    const pdfBuffer = await page.pdf({
      width: '1000px',
      height: `${bodyHeight + 80}px`,
      printBackground: true,
      margin: { top: '40px', right: '0px', bottom: '40px', left: '0px' },
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
    return `<div style="display:inline-block;text-align:center;margin:0 12px;"><div style="width:56px;height:56px;border-radius:50%;background:${c};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:10px;color:#0D0D0D;font-weight:600;padding:4px;">${node.touchpoint.substring(0, 12)}</div></div>`;
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
  <div style="margin-bottom:32px;">
    <div style="font-family:Georgia,serif;font-size:22px;color:#F0EDE6;margin-bottom:16px;font-style:italic;">"${result.headline}"</div>
    <div style="background:#1A1A1A;border-left:3px solid #C9A24A;padding:20px 24px;border-radius:0 12px 12px 0;">
      <div style="color:#C9A24A;font-size:28px;line-height:1;margin-bottom:8px;">"</div>
      <p style="color:#D0CDC6;line-height:1.7;font-size:14px;">${result.narrative}</p>
    </div>
  </div>
  <div style="margin-bottom:32px;">
    <div style="color:#7A7A7A;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">Coherence Map</div>
    <div style="background:#141414;border-radius:12px;padding:24px;text-align:center;">${mapHtml}</div>
  </div>
  <div style="margin-bottom:32px;">
    <div style="color:#7A7A7A;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">Five Dimensions</div>
    ${dimensionsHtml}
  </div>
  <div style="margin-bottom:48px;">
    <div style="color:#7A7A7A;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px;">Where to Focus Next</div>
    <div style="background:#1A1A1A;border-radius:12px;padding:8px 20px;">${gapsHtml}</div>
  </div>
  <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;display:flex;justify-content:space-between;align-items:center;">
    <div style="color:#7A7A7A;font-size:11px;">Built on the emotional intelligence framework of Activate Vision</div>
    <div style="color:#7A7A7A;font-size:11px;">activate.vision</div>
  </div>
</body>
</html>`;
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ─── Survey routes ───────────────────────────────────────────────────────────

app.get('/s/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'survey.html'));
});

app.get('/api/survey/:slug', (req, res) => {
  const survey = readSurveys().find(s => s.slug === req.params.slug);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });
  res.json(survey);
});

app.get('/api/surveys', authMiddleware, (req, res) => {
  res.json(readSurveys());
});

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
    audit_ids: [],
  };
  surveys.unshift(survey);
  writeSurveys(surveys);
  res.json(survey);
});

app.put('/api/survey/:slug', authMiddleware, (req, res) => {
  const surveys = readSurveys();
  const idx = surveys.findIndex(s => s.slug === req.params.slug);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  surveys[idx] = { ...surveys[idx], ...req.body, slug: req.params.slug };
  writeSurveys(surveys);
  res.json(surveys[idx]);
});

app.delete('/api/survey/:slug', authMiddleware, (req, res) => {
  const surveys = readSurveys();
  const idx = surveys.findIndex(s => s.slug === req.params.slug);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  surveys.splice(idx, 1);
  writeSurveys(surveys);
  res.json({ success: true });
});

// Survey summarize without AI: compute basic aggregate stats from audits
app.post('/api/survey/:slug/summarize', authMiddleware, (req, res) => {
  const surveys = readSurveys();
  const idx = surveys.findIndex(s => s.slug === req.params.slug);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const survey = surveys[idx];
  const audits = readAudits().filter(a => survey.audit_ids.includes(a.id));
  if (audits.length === 0) return res.status(400).json({ error: 'No audits to summarize' });

  const scores = audits.map(a => a.result?.overall_score ?? 0).filter(Boolean);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  const strong = scores.filter(s => s >= 68).length;
  const weak   = scores.filter(s => s < 44).length;

  const summary = `${audits.length} respondents completed the audit for ${survey.client_label}. Average coherence score: ${avgScore}/100 (range: ${minScore}–${maxScore}). ${strong} respondent${strong !== 1 ? 's' : ''} showed strong emotional alignment; ${weak} showed significant gaps. ${avgScore >= 68 ? 'Overall the journey is landing well.' : avgScore >= 45 ? 'There are consistent friction points worth addressing.' : 'The journey needs structural attention across most respondents.'}`;

  surveys[idx].ai_summary = summary;
  writeSurveys(surveys);
  res.json({ summary });
});

// ─── Chat — lightweight fallback without AI streaming ────────────────────────

app.post('/api/chat', (req, res) => {
  const { mode, messages, context } = req.body;

  if (mode === 'builder' || mode === 'dashboard') {
    const pw = req.headers['x-admin-password'] || req.body?.adminPassword;
    if (pw !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`);

  if (mode === 'warmup') {
    const entity = context?.survey?.entity_word || 'brand';
    const client = context?.survey?.client_label || 'this organization';
    const userCount = messages.filter(m => m.role === 'user').length;

    if (userCount === 0) {
      send(`Before we map your journey with ${client}, I'd love to understand where you're coming from.\n\nHow long have you been in relationship with this ${entity}?`);
    } else if (userCount === 1) {
      send(`That's helpful context. One more: when you think about the feeling you're hoping for from this ${entity} — what word comes closest?`);
    } else {
      send(`You're ready. Let's map this together.\n<ready/>`);
    }
  } else if (mode === 'results') {
    const result = context?.result;
    const score = result?.overall_score ?? 0;
    if (score >= 68) {
      send(`Your audit shows strong emotional coherence overall. The areas where you scored highest are your anchors — protect them as you grow. If you want to go deeper on any specific dimension or gap, just ask.`);
    } else if (score >= 45) {
      send(`Your audit reveals a journey with clear intention, but some real gaps between what you're designing for and what's landing. The good news: these gaps are identified and named, which means they're workable. Want to explore any specific touchpoint or dimension?`);
    } else {
      send(`Your audit surfaces a significant gap between your vision and your customers' experience. This is honest, useful data — not a verdict. The dimensions and gaps in your report point to specific places to start. Would you like to talk through where to focus first?`);
    }
  } else if (mode === 'builder') {
    const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
    if (messages.filter(m => m.role === 'user').length <= 1) {
      send(`Tell me about the client: who are they, what kind of ${lastUser.toLowerCase().includes('product') ? 'product' : 'brand or organization'} is it, and what's the core feeling they want to create for their customers?`);
    } else {
      const template = {
        client_label: 'Client',
        entity_word: 'brand',
        intro_message: 'Welcome. This short audit will help us understand the gap between the feeling you intend to create and what your customers actually experience.',
        context: 'Custom survey — edit client_label and questions to match the specific client.',
        warmup_questions: [
          'How long have you been working with this brand?',
          'What feeling are you most proud of creating for your customers?'
        ],
        questions: [
          { id: 'q1', type: 'touchpoint_feelings', label: 'Map your brand journey' },
          { id: 'q2', type: 'open', label: 'What is the single biggest emotional gap you see in your customer experience right now?' },
          { id: 'q3', type: 'scale', label: 'How confident are you that your brand delivers on its emotional promise?', min: 1, max: 10 },
          { id: 'q4', type: 'multiple_choice', label: 'Where does the gap tend to appear most?', options: ['First impression', 'During the sale', 'After the purchase', 'In ongoing service'] },
          { id: 'q5', type: 'yes_no', label: 'Do your customers tell you unprompted how your brand makes them feel?' }
        ]
      };
      send(`Here's a survey template you can customize for this client:\n\n<survey>${JSON.stringify(template, null, 2)}</survey>\n\nEdit the client_label, entity_word, intro_message, and questions to fit the specific context. The touchpoint_feelings question (q1) is required for the audit to run.`);
    }
  } else if (mode === 'dashboard') {
    const audits = context?.audits || [];
    if (audits.length === 0) {
      send(`No audit data yet. Once you collect responses, I'll be able to surface patterns across them.`);
    } else {
      const scores = audits.map(a => a.result?.overall_score).filter(Boolean);
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const recent = audits.slice(0, 3).map(a => `${a.brand} (${a.result?.overall_score})`).join(', ');
      send(`You have ${audits.length} audit${audits.length !== 1 ? 's' : ''} on record. Average coherence score: ${avg}/100. Most recent: ${recent}. What would you like to explore?`);
    }
  } else {
    send(`Analysis complete. Review the dimensions and gaps above — each one points to a specific action. Let me know if you'd like to discuss any part of your results.`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

// Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🌿 Emotional Gap Audit (no-AI mode) running on http://localhost:${PORT}\n`);
});
