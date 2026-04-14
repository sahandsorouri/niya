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
const AUDITS_PATH = path.join(__dirname, 'niya', 'audits.json');

// Ensure niya directory and audits.json exist
const niyaDir = path.join(__dirname, 'niya');
if (!fs.existsSync(niyaDir)) fs.mkdirSync(niyaDir, { recursive: true });
if (!fs.existsSync(AUDITS_PATH)) fs.writeFileSync(AUDITS_PATH, '[]', 'utf8');

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

// ─── Routes ─────────────────────────────────────────────────────────────────

// POST /api/audit — run a new audit
app.post('/api/audit', async (req, res) => {
  try {
    const { name, brand, business_type, touchpoints, source = 'public', niya_notes = '' } = req.body;

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
      result,
      niya_notes,
      source
    };

    const audits = readAudits();
    audits.unshift(audit);
    writeAudits(audits);

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

// Catch-all: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🌿 Emotional Gap Audit running on http://localhost:${PORT}\n`);
});
