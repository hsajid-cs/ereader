# Ereader

A Kindle-style e-reader: an Express/Postgres backend and an Expo (React Native) app, sharing types through `packages/shared`.

```
backend/          Express + Prisma API (auth, books, progress, annotations, collections, stats, sync)
mobile/           Expo app (library, reader, offline sync, stats)
packages/shared/  TypeScript types used by both
```

## Features

- Accounts with JWT access/refresh tokens; offline-first: highlights, notes, bookmarks, reading position
  and reading time are queued on the device and synced later (queue is isolated per user)
- Library: import EPUB / PDF / TXT (several at once), covers and title/author read from EPUB metadata,
  search, sort, filter, grid/list, collections, edit and delete
- Text reader (EPUB, TXT): pagination that adapts to font size and screen, themes (light/sepia/dark),
  serif/sans, line spacing, margins, brightness, in-book search, table of contents,
  word-range highlights (4 colours), notes, bookmarks, dictionary lookup, read aloud, handwriting layer,
  export highlights
- PDF reader (pdf.js in a WebView): continuous scroll, synced position, page bookmarks
- Reading stats: daily goal, today / week minutes, streak

## Develop

Requires Node 22+ and PostgreSQL.

```bash
npm install
npm run build -w @ereader/shared          # the packages consume shared/dist

# backend
cp backend/.env.example backend/.env       # edit DATABASE_URL and secrets
cd backend && npx prisma migrate deploy && npm run dev     # http://localhost:4000

# mobile (a physical device needs your computer's LAN address, not localhost)
cd mobile && EXPO_PUBLIC_API_URL=http://192.168.1.10:4000 npx expo start
```

Checks: `npm run typecheck`, `npm run lint`, `npm test` (the backend tests need the PostgreSQL
database from `backend/.env.test`). An opt-in end-to-end test of the mobile API client:
`E2E_SERVER=http://localhost:4001 npm test -w @ereader/mobile -- e2e` against a running backend.

## Deploy

```bash
export JWT_ACCESS_SECRET=...   # 16+ characters each; the server refuses weak secrets in production
export JWT_REFRESH_SECRET=...
docker compose up --build       # API on :4000, Postgres and uploads in named volumes
```

Book files are stored on local disk (`UPLOADS_DIR`); mount a persistent volume. Put the API behind
HTTPS in production. `mobile/app.json` allows cleartext HTTP so development against a LAN server
works; remove `usesCleartextTraffic` and `NSAllowsArbitraryLoads` for a store release.

Build installable apps with EAS: `cd mobile && npx eas build --profile preview --platform android`.

## Known limits

- EPUBs are read as plain text: images and rich formatting are dropped.
- Pages are estimated from font metrics, so breaks are approximate.
- Highlights are stored as character offsets into the extracted text; they stay valid across font changes
  but not if the book file changes.
- PDFs support bookmarks only (no highlights or notes) and load pdf.js from a CDN.
- Reading position is last-write-wins across devices.
