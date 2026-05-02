# x-bookmark-reports UI

Notion-style dashboard UI for managing Twitter/X bookmarks, reports, and articles.

## Overview

This UI layer (`ui/`) provides a web-based interface for the `x-bookmark-reports` toolchain. It integrates with existing scripts without modifying them:

- `sync_bookmarks.sh` — Bookmark synchronization (incremental/full)
- `x-reader/scripts/x_reader.py` — Basic tweet reader
- `x-tweet-reader/main.py` — Enhanced tweet reader

## Architecture

```
ui/
├── src/
│   ├── app/              # Next.js App Router pages + API routes
│   │   ├── page.tsx       # Dashboard
│   │   ├── bookmarks/     # Bookmark management
│   │   ├── sync/          # Sync control center
│   │   ├── reports/       # Report library + editor
│   │   ├── articles/      # Article factory
│   │   ├── settings/      # Settings panel
│   │   └── api/           # RESTful API endpoints
│   ├── components/        # React components (layout, dashboard, bookmarks, sync, reports, settings, ui)
│   ├── hooks/             # Custom React hooks
│   ├── store/             # Zustand state stores
│   ├── lib/               # Utilities + backend services
│   │   ├── api.ts         # Frontend API client (with mock support)
│   │   ├── db.ts          # SQLite database layer
│   │   ├── sync-service.ts # sync_bookmarks.sh wrapper
│   │   ├── reader-service.ts # Python reader wrappers
│   │   ├── config.ts      # .env.twitter management
│   │   ├── logger.ts      # Unified logging
│   │   └── utils.ts       # cn() helper
│   ├── types/             # TypeScript shared types
│   └── db/                # Schema + mock data
├── CONTRACT.md           # API & Data Contract v1.0
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- The existing `x-bookmark-reports` repository at the parent level
- Python 3 (for running reader scripts)
- Bash (for running sync script)

### Installation

```bash
cd ui
npm install
```

### Development

```bash
npm run dev
```

Open http://localhost:3001

### Production

```bash
npm run build
npm start
```

## Environment

The UI reads configuration from `../.env.twitter` (relative to the `ui/` directory):

```
API_KEY=base64(auth_token+ct0+kdt+twid)
PROXY=http://127.0.0.1:7897
```

Settings can also be managed through the UI's Settings page.

## Features

### 1. Dashboard
- System status cards (sync time, bookmark count, pending, reports)
- Pipeline visualization (Sync → Read → Report → Article) with animated status
- Recent activity feed

### 2. Bookmarks
- Table/card dual view with pagination
- Full-text search, status/tag/category filters
- Batch operations (multi-select + bulk read)
- Detail view with tweet text, replies, external links, reports

### 3. Sync Control
- Incremental / full sync modes
- Real-time SSE progress stream
- Terminal-style colored log output
- Sync history with statistics
- .env.twitter configuration UI

### 4. Reports
- Library with filtering and search
- Split-screen Markdown editor (source + preview)
- Version history
- Export to Markdown
- Basic vs Enhanced comparison view

### 5. Articles
- Draft management from reports
- Markdown editor
- Version timeline
- Export formats (Markdown, HTML, WeChat)

### 6. Settings
- Environment configuration
- Schedule management (cron editor)
- Log viewer with component/level filters
- Data management (backup/restore)

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

All API endpoints follow the contract defined in `CONTRACT.md`:

- Response format: `{ success: boolean, data: T, error?: { code, message, detail } }`
- HTTP 200 for all responses (script errors return `success: false`)
- API_KEY is masked in responses (`abc****xyz`)
- SSE streams at `/api/sync/[jobId]/stream`

## Mock Mode

By default, the frontend runs in **mock mode** (`USE_MOCK = true` in `src/lib/api.ts`). This allows the UI to be fully functional without real backend services. To switch to real APIs:

```typescript
// src/lib/api.ts
export const USE_MOCK = false;
```

## Integration with Existing Scripts

The UI calls existing scripts via `child_process.spawn`:

```typescript
// sync_bookmarks.sh
spawn('bash', ['../sync_bookmarks.sh', '--full'], { cwd: '..' })

// x_reader.py
spawn('python3', ['x-reader/scripts/x_reader.py', url], { cwd: '..' })

// x-tweet-reader
spawn('python3', ['x-tweet-reader/main.py', url], { cwd: '..' })
```

**Important**: The UI never modifies scripts in the parent directory.

## Database

SQLite database is auto-initialized at `ui/data/x_bookmarks.db` on first start. The schema is applied from `src/db/schema.sql`. If `bookmarks_*.json` files exist in the parent directory, they are automatically imported.

## File Origins

| File Set | Source |
|----------|--------|
| `CONTRACT.md`, `types/api.ts`, `db/schema.sql`, `db/mock.ts` | Orchestrator (Stage 1) |
| `app/api/*`, `lib/db.ts`, `lib/sync-service.ts`, `lib/reader-service.ts`, `lib/config.ts`, `lib/logger.ts` | Backend Agent (Stage 2) |
| `app/*` (pages), `components/*`, `hooks/*`, `store/*`, `lib/api.ts` | Frontend Agent (Stage 3) |

## Troubleshooting

### Port already in use
```bash
npx next dev -p 3001
```

### Database locked
The database uses WAL mode (`journal_mode = WAL`). If you see locking errors, ensure no other process is accessing `data/x_bookmarks.db`.

### Script not found
Ensure the UI is running from within the `ui/` directory so that `../sync_bookmarks.sh` resolves correctly.

## License

Same as the parent `x-bookmark-reports` repository.
