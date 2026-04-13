# Emotional Gap Audit

**A tool by Activate Vision** — [activate.vision](https://activate.vision)

Analyze the emotional coherence of any brand's customer journey. Discover where the emotional promise breaks down between touchpoints — and where to focus first.

---

## What it does

- Public landing page where anyone can run a free emotional audit of their customer journey
- Multi-step form that maps touchpoints with intended vs. actual feelings
- AI analysis via Claude Sonnet (emotional coherence score, five-dimension breakdown, coherence map, narrative, action items)
- Animated, premium results page with downloadable PDF
- Niya's private dashboard to view all audits, add notes, and run audits for clients

---

## Tech stack

- **Backend:** Node.js + Express
- **AI:** Anthropic Claude API (`claude-sonnet-4-20250514`)
- **PDF:** html-pdf-node
- **Data:** JSON file storage (`niya/audits.json`)
- **Frontend:** Vanilla JS + Tailwind concepts via custom CSS
- **Fonts:** Fraunces (display) + DM Sans (body) via Google Fonts

---

## Getting started

### 1. Clone and install

```bash
git clone <your-repo-url>
cd <repo-folder>
npm install
```

### 2. Add environment variables

Create a `.env` file in the root directory:

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
PORT=3000
```

Get your Anthropic API key at [console.anthropic.com](https://console.anthropic.com).

### 3. Run locally

```bash
npm start
```

App runs at **http://localhost:3000**

For development with auto-restart:
```bash
npm run dev
```

---

## File structure

```
/
├── public/
│   ├── index.html        Landing page + public audit form
│   ├── results.html      Audit results / report page
│   ├── admin.html        Niya's private dashboard
│   └── styles.css        Brand design system
├── niya/
│   └── audits.json       All saved audits (auto-created)
├── server.js             Express server + API endpoints
├── package.json
└── .env                  (not committed — add manually)
```

---

## Admin dashboard

Navigate to `/admin.html`

**Password:** `NiyaAV2026!`

Features:
- Overview with total audits, average score, this week's count
- Full audit list with expandable rows and inline note-taking
- New Audit tab to run audits for clients
- Export all audits as JSON

---

## API endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/audit` | — | Run a new audit |
| `GET` | `/api/audit/:id` | — | Get a single audit |
| `GET` | `/api/audits` | ✓ | Get all audits |
| `POST` | `/api/audit/:id/note` | ✓ | Save Niya's note |
| `DELETE` | `/api/audit/:id` | ✓ | Delete an audit |
| `GET` | `/api/export` | ✓ | Download all audits as JSON |
| `POST` | `/api/pdf` | — | Generate PDF for an audit |

Protected endpoints require the header: `x-admin-password: NiyaAV2026!`

---

## Deployment

### Railway

1. Push to GitHub
2. Connect repo at [railway.app](https://railway.app)
3. Add environment variable: `ANTHROPIC_API_KEY=your_key`
4. Deploy — Railway auto-detects Node.js

### Render

1. Push to GitHub
2. Create a new Web Service at [render.com](https://render.com)
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variable: `ANTHROPIC_API_KEY=your_key`

### VPS (any Linux server)

```bash
# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and install
git clone <repo> /var/www/niya
cd /var/www/niya
npm install

# Set up environment
echo "ANTHROPIC_API_KEY=your_key" > .env
echo "PORT=3000" >> .env

# Run with PM2
npm install -g pm2
pm2 start server.js --name niya
pm2 save
pm2 startup
```

---

## Notes

- Audit data is stored in `niya/audits.json`. On most platforms this file persists between deployments. For Railway/Render, consider adding a persistent volume.
- The dashboard password is set in `server.js` (`ADMIN_PASSWORD`) and can be overridden via environment variable `ADMIN_PASSWORD`.
- PDF generation requires Chromium. Railway and Render include it by default. On a custom VPS, install Chromium: `sudo apt-get install -y chromium-browser`

---

Built on the emotional intelligence framework of [Activate Vision](https://activate.vision). Powered by Claude AI.
