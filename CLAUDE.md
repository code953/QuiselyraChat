# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

NekoraChat is a single-user, self-hosted AI chat client built with Next.js 16 (App Router), React 19, and TypeScript. It supports multiple LLM providers via the OpenAI SDK's compatible API format. The UI language is Chinese. Full design document: `project.md`.

## Project Phases & Roadmap

The project follows a milestone-based roadmap. Refer to `project.md` §九 for details.

| Phase | Scope | Status |
|---|---|---|
| **M0 Prototype** | Single OpenAI chat + SQLite + password + basic UI | ✅ Done |
| **M1 MVP** | Multi-provider, model list fetch & capability testing, personas, conversation management, context window management, model fallback, Docker deploy | ✅ Current |
| **M2 Full** | Image generation (DALL·E/SD/Flux), full-text search, share links, web search API, PWA, data backup/restore, usage dashboard | 🔜 Next |
| **M3 Advanced** | File parsing (PDF/Word/OCR), Function Calling framework, voice I/O, i18n, accessibility, plugin system | 📋 Planned |

### M1 Completed Features

- Single password login → JWT auth
- Multi-provider LLM support with OpenAI-compatible API (OpenAI, Anthropic, Google, xAI, DeepSeek, Moonshot, 智谱, OpenRouter, Ollama, custom)
- Remote model list fetching from `/v1/models` + user-selected model library
- Model capability testing (chat, vision, tools) with test result persistence
- Persona system (5 built-in + custom with system prompts, greeting, recommended model)
- Conversation management: folders, pin, archive, streaming chat
- Context window management: auto-truncation at 90% of max tokens
- Model fallback on retryable errors (429, 503, timeout)
- Token usage & cost tracking
- API key AES-256-GCM encryption
- Docker single-container deployment

### M2 Key Features to Implement

- **Web search**: pluggable search providers — native (智谱, Grok, OpenAI, Claude, Gemini, Perplexity) and generic (Tavily, Bing, Brave, SearXNG via Function Calling). Three trigger modes: auto/forced/off. New `search_configs` table needed.
- **Image generation**: DALL·E 3, Stable Diffusion, Flux. Prompt templates, generation gallery. New `images` table needed.
- **Share links**: read-only conversation snapshots with token-based access. New `share_tokens` table needed.
- **File attachments**: drag/drop/paste upload, server-side storage (local disk / S3), multi-modal input for vision models.
- **Full-text search**: search across conversation titles and message content.
- **Data backup/restore**: one-click export all data as JSON/Markdown, import/restore.
- **Usage dashboard**: aggregated token consumption and cost visualization.
- **PWA**: Service Worker caching for offline basic UI.

## Commands

```bash
npm run dev          # Start dev server (Webpack mode, recommended on Windows)
npm run dev:turbo    # Start dev server (Turbopack, may fail on Windows with libsql junction errors)
npm run build        # Production build (standalone output)
npm run start        # Start production server
npm run lint         # ESLint
npx tsc --noEmit     # Type-check without emitting
```

### Database Migrations

```bash
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit migrate    # Apply pending migrations
npx drizzle-kit push       # Push schema directly (dev only)
```

### Docker

```bash
docker compose up -d --build   # Build and start container
```

## Architecture

### Stack

- **Framework**: Next.js 16 App Router, React 19, TypeScript 5
- **Styling**: Tailwind CSS 4, Radix UI, shadcn/ui-style components (New York variant)
- **State**: Zustand stores (client-side), SQLite via Drizzle ORM (server-side)
- **LLM**: OpenAI SDK (`openai` package) wrapping all providers through a unified `/v1/chat/completions` interface
- **Auth**: Single password → bcrypt verify → JWT, stored in `localStorage` as `nekorachat_token`
- **Encryption**: AES-256-GCM for API key storage in the database

### Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json).

### Data Flow

```
Browser (Zustand stores) → fetch with JWT Bearer token
  → /api/* route handlers (withAuth middleware)
    → Drizzle ORM → SQLite (file:./data/app.db)
    → OpenAI SDK → external LLM providers (streaming SSE)
```

### Key Directories

- `src/app/api/` — API route handlers. All protected routes use `withAuth()` from `src/lib/middleware.ts`.
- `src/app/(chat)/` — Main chat page, wrapped in `AuthGuard`.
- `src/app/settings/` — Settings pages for providers, models, personas.
- `src/components/ui/` — shadcn/ui primitives (Button, Dialog, Select, etc.).
- `src/components/` — Feature components (chat-input, message-bubble, sidebar, markdown-renderer, etc.).
- `src/db/schema.ts` — All 8 Drizzle table definitions and TypeScript types.
- `src/db/seed.ts` — Built-in persona definitions (5 defaults).
- `src/lib/` — Server utilities: auth, encryption, LLM client factory, API helpers.
- `src/stores/` — Zustand stores: auth, chat, conversation, folder, model-config, model, persona.
- `drizzle/` — SQL migration files.

### Database Tables (SQLite)

`conversations`, `messages`, `personas`, `modelConfigs`, `models`, `folders`, `usageLogs`, `settings` — defined in `src/db/schema.ts`. Foreign keys use `CASCADE` deletes. Messages and models have composite indexes for performance.

### LLM Provider System

All providers use the OpenAI SDK through `createLLMClient()` in `src/lib/llm-client.ts`. Provider presets (OpenAI, Anthropic, Google, xAI, DeepSeek, Moonshot, 智谱, OpenRouter, Ollama, custom) define default base URLs. API keys are encrypted with AES-256-GCM before database storage (`src/lib/encryption.ts`).

Model parameters resolve in priority order: model-level override > persona params > provider-level config defaults.

### Streaming Chat

Chat responses stream via SSE with a custom event format: `data: {content, messageId, usage, done, error}\n\n`. The client-side chat store (`src/stores/chat.ts`) reassembles chunks, handles retry/fallback logic, and manages optimistic updates.

### Authentication Pattern

- `withAuth()` wraps every protected API route — extracts and verifies JWT from `Authorization: Bearer` header.
- Client stores token in `localStorage` and attaches it via `getAuthHeaders()` from `src/lib/api-helpers.ts`.
- `AuthGuard` component on protected pages redirects to `/login` if no valid token.

## Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `ACCESS_PASSWORD` | Yes | Login password (bcrypt hash or plaintext) |
| `JWT_SECRET` | Yes | JWT signing key (32+ chars recommended) |
| `ENCRYPTION_KEY` | Yes | AES key for API key encryption (64 hex chars / 32 bytes) |
| `DATABASE_URL` | No | SQLite path, default `file:./data/app.db` |
| `OPENAI_API_KEY` | No | For optional auto title generation |
| `OPENAI_BASE_URL` | No | Base URL for title generation endpoint |
| `OPENAI_MODEL` | No | Model for title generation |

## Conventions

- API routes return `{ code, message }` on error with standard codes: `BAD_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, `INTERNAL_ERROR`.
- IDs use `nanoid` (21-char default).
- The project uses `next build --experimental-build-mode compile` for production builds.
- `output: "standalone"` in next.config.ts for Docker deployment.
- Windows dev uses `--webpack` flag to avoid Turbopack junction issues with `@libsql`.

## Design Intent (from project.md)

Key design decisions that should guide future development:

- **Single-user by design** — no users table, no multi-tenant complexity. All data belongs to one person.
- **Server-side centralized storage** — all chat history, config, personas persist on the server database, not in the browser. The browser only stores the JWT login token. This enables seamless cross-device access.
- **OpenAI SDK as universal adapter** — all LLM providers are accessed via the `openai` npm package through OpenAI-compatible endpoints. Provider differences are handled by base URL presets, not separate client implementations.
- **Context window management** — auto-truncate early messages when approaching model's context limit (keep system prompt + recent N turns). Planned: optional summary compression of truncated history.
- **Model fallback chain** — on 429/503/timeout, automatically retry with the next model in a configured fallback chain.
- **Search API is separate from chat model** — web search providers have their own config (`search_configs` table in M2). Native search (智谱/Grok/OpenAI/Claude/Gemini/Perplexity) uses provider-specific params directly; generic search (Tavily/Bing/SearXNG) injects via Function Calling for any model.
- **Branch conversations** — messages have `parentMessageId` for tree-structured branching (fork). Currently stored in schema but UI for branching is M2+.
- **Performance targets** — virtual scrolling for message lists, lazy-loaded code highlighting, SQLite WAL mode, composite indexes on hot query paths (`messages(conversationId, createdAt)`, `models(modelConfigId, enabled)`).
