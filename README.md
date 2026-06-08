# Emotional Gap Audit

**A tool by Activate Vision** — [activate.vision](https://activate.vision) · [niya.sorouri.com](https://niya.sorouri.com)

Analyze the emotional coherence of any brand's customer journey. Discover where the emotional promise breaks down between touchpoints — and where to focus first.

---

## Two versions

| Version | File | Requires API key | How to run |
|---------|------|-----------------|------------|
| **No-AI** (default) | `server.js` | No | `npm start` |
| **Cloud AI** | `server-cloud.js` | Yes (Anthropic) | `npm run start:cloud` |

The no-AI version uses a rule-based emotion classification engine to score touchpoints and generate insights. The output format is identical — same JSON schema, same results page, same PDF. No network calls, no API costs.

The cloud version calls Claude Sonnet and produces richer, more contextual narrative text.

---

## What it does

- Public landing page where anyone can run a free emotional audit of their customer journey
- Multi-step form that maps touchpoints with intended vs. actual feelings
- Emotional coherence score, five-dimension breakdown, coherence map, narrative, and action items
- Animated results page with downloadable PDF
- Private admin dashboard to view all audits, add notes, and run audits for clients
- Survey builder: create custom audit links for specific clients
- AI chat assistant on results and dashboard pages (available in cloud version; graceful fallback in no-AI version)

---

## Tech stack

- **Backend:** Node.js + Express
- **Analysis engine:** Rule-based emotion classifier (no-AI) or Anthropic Claude Sonnet (cloud)
- **PDF:** Puppeteer (requires Chromium on the server)
- **Data:** JSON file storage (`niya/audits.json`, `niya/surveys.json`)
- **Frontend:** Vanilla JS with custom CSS design system
- **Fonts:** Fraunces (display) + DM Sans (body) via Google Fonts

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/sahandsorouri/niya-emotion-audit
cd niya-emotion-audit
npm install
```

### 2. Environment variables

Create a `.env` file. For the default no-AI version, only PORT is needed:

```
PORT=3000
# ADMIN_PASSWORD=NiyaAV2026!   (optional override)
```

If you want to run the cloud version, add your Anthropic key:

```
ANTHROPIC_API_KEY=your_key_here
PORT=3000
```

Get an Anthropic API key at [console.anthropic.com](https://console.anthropic.com).

### 3. Run

```bash
# No-AI version (no API key needed)
npm start

# Cloud AI version
npm run start:cloud

# Development with auto-restart
npm run dev
npm run dev:cloud
```

App runs at **http://localhost:3000**

---

## File structure

```
/
├── public/
│   ├── index.html        Landing page + public audit form
│   ├── results.html      Audit results / report page
│   ├── admin.html        Private dashboard
│   ├── survey.html       Client survey page
│   └── styles.css        Brand design system
├── niya/
│   ├── audits.json       Saved audits (auto-created)
│   └── surveys.json      Survey configs (auto-created)
├── server.js             No-AI version (rule-based engine)
├── server-cloud.js       Cloud AI version (Anthropic Claude)
├── package.json
└── .env                  (not committed — add manually)
```

---

## How the no-AI engine works

Each touchpoint has an `intended_feeling` and an `actual_feeling`. The engine:

1. Classifies each text into one of five emotion categories: high positive, low positive, neutral, high negative, low negative
2. Scores the match using a cross-category scoring matrix (e.g. "inspired" intended vs. "confused" actual = 14/100)
3. Adds a small bonus for word overlap between the two texts
4. Derives the five audit dimensions from the touchpoint scores:
   - **First Signal** — score of the first touchpoint
   - **Transition Fidelity** — consistency of scores step to step
   - **Trust Architecture** — presence of trust/safety language in intended feelings
   - **Overwhelm Index** — absence of stress/confusion in actual feelings (high = good)
   - **Emotional Coherence** — weighted average of overall and transition scores
5. Generates insights, gaps, headline, and narrative from score ranges

---

## Admin dashboard

Navigate to `/admin.html`

Default password: `NiyaAV2026!`

Override via environment variable: `ADMIN_PASSWORD=your_password`

Features:
- Overview with total audits, average score, this week's count
- Full audit list with expandable rows and inline note-taking
- New Audit tab to run audits for clients
- Survey builder with shareable client links
- Export all audits as JSON

---

## API endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/audit` | — | Run a new audit |
| `GET` | `/api/audit/:id` | — | Get a single audit |
| `GET` | `/api/audits` | ✓ | Get all audits |
| `POST` | `/api/audit/:id/note` | ✓ | Save a note on an audit |
| `DELETE` | `/api/audit/:id` | ✓ | Delete an audit |
| `GET` | `/api/export` | ✓ | Download all audits as JSON |
| `POST` | `/api/pdf` | — | Generate PDF for an audit |
| `GET` | `/api/survey/:slug` | — | Get a survey config |
| `GET` | `/api/surveys` | ✓ | List all surveys |
| `POST` | `/api/surveys` | ✓ | Create a survey |
| `PUT` | `/api/survey/:slug` | ✓ | Update a survey |
| `DELETE` | `/api/survey/:slug` | ✓ | Delete a survey |
| `POST` | `/api/survey/:slug/summarize` | ✓ | Summarize survey responses |
| `POST` | `/api/chat` | — / ✓ | Chat assistant (SSE streaming) |

Protected endpoints require the header: `x-admin-password: <password>`

---

## Deployment

### VPS with PM2 (current setup)

```bash
# Clone to server
git clone https://github.com/sahandsorouri/niya-emotion-audit /path/to/niya
cd /path/to/niya
npm install

# Set environment
echo "PORT=3010" > .env

# Start with PM2
pm2 start server.js --name niya
pm2 save
pm2 startup
```

To update after a git push:

```bash
git pull origin main && pm2 restart niya
```

### Railway / Render

1. Push to GitHub and connect the repo
2. Build command: `npm install`
3. Start command: `npm start`
4. No API key required for the default version

### Notes

- Audit data lives in `niya/audits.json`. On stateless platforms (Railway, Render) this resets on redeploy — add a persistent volume if you need data to survive.
- PDF generation requires Chromium on the server: `sudo apt-get install -y chromium-browser`
- To switch to the cloud AI version on an existing deployment, change the start command to `node server-cloud.js` and add `ANTHROPIC_API_KEY` to the environment.

---

Built on the emotional intelligence framework of [Activate Vision](https://activate.vision).
