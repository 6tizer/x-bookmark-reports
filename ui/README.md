# x-bookmark-reports UI

Next.js Dashboard UI for managing the Twitter/X bookmark → deep report → finished article → Notion pipeline.

## Overview

The UI layer (`ui/`) provides a web-based control panel for the `x-bookmark-reports` Python toolchain. It does **not** modify the backend scripts — it triggers them via `child_process.spawn` and reads state from the filesystem + SQLite.

5 main pages:

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Pipeline stats cards + 4-node pipeline status |
| Bookmarks | `/bookmarks` | Bookmark list (author, title, engagement) |
| Sync | `/sync` | Pipeline control center (trigger each stage, view logs) |
| Articles | `/articles` | Finished articles list |
| Settings | `/settings` | General / LLM & Web Search / Schedule / Logs / Data tabs |

Settings page has 5 tabs (2026-06-27 overhaul):

- **General** — Notion DB ID, Auto Sync toggle, proxy, data path
- **LLM & Web Search** — DeepSeek / xAI / Exa API keys + model selection + baseUrl (with eye-toggle plaintext view)
- **Schedule** — launchd scheduling (cron editor + current schedule display)
- **Logs** — Log viewer (component/level filters)
- **Data** — Export / clear / backup

## Architecture

```
ui/
├── src/
│   ├── app/                  # Next.js App Router pages + API routes
│   │   ├── page.tsx          # Dashboard
│   │   ├── bookmarks/        # Bookmark list + detail
│   │   ├── sync/             # Pipeline control
│   │   ├── articles/         # Article list + detail
│   │   ├── settings/         # Settings page (5 tabs)
│   │   └── api/              # RESTful API endpoints (32 routes)
│   ├── components/           # React components
│   │   ├── layout/           # Sidebar, ClientLayout
│   │   ├── dashboard/        # StatCards, PipelineStatus, ActivityFeed
│   │   ├── bookmarks/        # BookmarkTable, BookmarkCard
│   │   ├── sync/             # PipelineActions, SyncTerminal
│   │   ├── articles/         # ArticleTable, ArticleDetail
│   │   ├── settings/         # GeneralSettings, LLMSettings, ScheduleSettings, LogsSettings, DataSettings
│   │   └── ui/               # shadcn/ui primitives
│   ├── hooks/                # Custom React hooks
│   ├── store/                # Zustand state stores
│   ├── lib/
│   │   ├── api.ts            # Frontend API client
│   │   ├── db.ts             # SQLite database layer
│   │   ├── fs-data.ts        # Filesystem data layer (reads output/)
│   │   ├── sync-service.ts   # sync_bookmarks.sh wrapper
│   │   ├── config.ts         # .env management
│   │   ├── logger.ts         # Unified logging
│   │   └── utils.ts          # cn() helper
│   ├── types/                # TypeScript shared types
│   └── db/                   # Schema + mock data
├── data/
│   └── x_bookmarks.db        # SQLite DB (logs, bookmark metadata, settings)
├── CONTRACT.md               # API contract (Phase 1, partial — see warning inside)
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm
- Parent `x-bookmark-reports` repo with Python backend scripts in `bin/` and `lib/`
- `.venv/bin/python3` with `openai` installed (for `article_pipeline.py`)
- System `python3` (3.9+) for `coordinator.py` and `upload_to_notion.py`
- Bash (for `sync_bookmarks.sh` and `auto_run.sh`)

### Installation

```bash
cd ui
npm install
```

### Development

```bash
npm run dev
```

Open `http://127.0.0.1:3001` (recommended — bypasses system HTTP proxy) or `http://localhost:3001`.

### Production

```bash
npm run build
npm start
```

### Clear cache (502 / white screen / "Cannot find module './NNN.js'")

```bash
npm run dev:clean
```

## Environment

The UI reads configuration from the parent-level `../.env` (relative to `ui/`):

```
TWITTER_API_IO_KEY=...
NOTION_TOKEN=...
NOTION_DB_ID=...
DEEPSEEK_API_KEY=...
XAI_API_KEY=...
EXA_API_KEY=...
PROXY=http://127.0.0.1:7897
BOOKMARKS_PATH=../twitter_data/bookmarks.json
XAI_MODEL=grok-4.3
DEEPSEEK_MODEL=deepseek-chat
NOTION_UPLOAD_LIVE=true
```

Settings can also be managed through the UI's Settings → General / LLM & Web Search tabs. API keys support eye-toggle plaintext view via `/api/settings/plaintext-key`.

## Backend Integration

The UI triggers backend Python scripts via `child_process.spawn`:

```typescript
// Sync Bookmarks (Step 1 + 2)
execSync('bash sync_bookmarks.sh', { cwd: '..' })
spawn('python3', ['bin/coordinator.py', '--deep-batch'], { cwd: '..' })

// Run Pipeline (Step 3)
spawn('.venv/bin/python3', ['bin/article_pipeline.py', 'run-batch', '--resume'], { cwd: '..' })

// Upload to Notion (Step 4)
spawn('.venv/bin/python3', ['bin/upload_to_notion.py', '--mode', 'finished', '--live'], { cwd: '..' })
```

Each API route uses `pgrep` + `kill -9` to terminate same-type old processes before spawning a new one, preventing concurrent writes to shared state files.

The full 4-step pipeline runs automatically every 3 hours via `launchd (com.tizer.bookmark-auto)` calling `auto_run.sh` from the project root.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| State | Zustand |
| UI Components | shadcn/ui patterns |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Icons | Lucide React |
| Animation | Framer Motion |
| Database | SQLite (better-sqlite3) |
| API Style | RESTful + Server-Sent Events |

## API Contract

See [CONTRACT.md](./CONTRACT.md) for the Phase 1 contract (partial — marked DEPRECATED PARTIAL).

For the current API surface, the source of truth is `src/app/api/` (32 routes). Known deviations from the Phase 1 contract are documented in [`../docs/UI_AUDIT_2026-06-27.md`](../docs/UI_AUDIT_2026-06-27.md).

## Database

SQLite database is auto-initialized at `ui/data/x_bookmarks.db` on first start. The schema is applied from `src/db/schema.sql`. If `bookmarks_*.json` files exist in the parent directory, they are automatically imported.

The DB stores:

- `logs` — pipeline run logs (currently masked by `isDbEmpty()` bug, see B046)
- `bookmarks` — bookmark metadata cache
- `settings` — UI settings (key/value)
- `articles` — article metadata cache

## Troubleshooting

### Port already in use
```bash
npx next dev -p 3001
```

### 502 / white screen (Cursor Simple Browser or system proxy)
The system HTTP proxy forwards `127.0.0.1` to the proxy server, causing 502.

```bash
# Option 1: Use 127.0.0.1 directly
open http://127.0.0.1:3001

# Option 2: Bypass proxy in env
export NO_PROXY="127.0.0.1,localhost,::1,0.0.0.0"
export no_proxy="$NO_PROXY"

# Option 3: Use the launcher
../Open\ Dashboard\ UI.command
```

### "Cannot find module './NNN.js'" (build cache corruption)
```bash
npm run dev:clean
```

### Database locked
The database uses WAL mode (`journal_mode = WAL`). If you see locking errors, ensure no other process is accessing `data/x_bookmarks.db`.

### Script not found
Ensure the UI is running from within the `ui/` directory so that `../bin/coordinator.py` etc. resolve correctly.

## Known Issues

See [`../docs/UI_AUDIT_2026-06-27.md`](../docs/UI_AUDIT_2026-06-27.md) for the full UI audit (31+ bugs, 4 P0 / 6 P1 / 9 P2).

Top-priority bugs being tracked in [`../BUGS.md`](../BUGS.md):

- B046 `isDbEmpty()` semantic error
- B047 Dashboard `totalBookmarks` wrong source
- B048 Bookmarks page reads deep drafts
- B049 Schedule Cron settings don't write launchd
- B050 Cross-provider model bug

## License

Same as the parent `x-bookmark-reports` repository.
