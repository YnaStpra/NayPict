<!-- BEGIN:nextjs-agent-rules -->
# Project Overview

NayPict is a modern, high-performance web-based photo gallery application.
- **Production URL**: `https://www.naypict.my.id`
- **Domain & Edge**: DomaiNesia domain delegated to Cloudflare Nameservers (`clayton.ns.cloudflare.com`, `sloan.ns.cloudflare.com`), proxied to Vercel with Full (Strict) SSL/TLS, Bot Fight Mode, and HTTP 308 permanent redirect from `*.vercel.app`.
- **Database**: Neon Serverless PostgreSQL (`process.env.DATABASE_URL`) via Drizzle ORM in production; fallback to `data/naypict.sqlite` for local development.
- **Media Storage**: Cloudflare R2 private bucket with a dedicated Cloudflare Worker Media Gateway (`workers/media-gateway/`) for public derivatives (`previews/`, `thumbnails/`) and server-proxied authenticated downloads (`/media/{key}`).
- **Cache & Rate Limiting**: Upstash Redis REST / Vercel KV (`UPSTASH_REDIS_REST_URL` or `KV_REST_API_URL`) with fallback to database cache and sliding window rate limiting.
- **Bot Defense**: Cloudflare Turnstile CAPTCHA on `/login` and comments (`/photo/comment/add`).

# Git Workflow Rules

- **Branch Synchronization**: Always keep `main` and `develop` branches strictly in sync when committing code changes.

# Language & UI Conventions

- **Strict English UI**: All user-facing UI text, buttons, modals, toasts, tooltips, and alerts must strictly be in English.

# Commenting Guidelines

- Every method must include a brief comment explaining its purpose.
- In backend files, include a module description right after the `import` statements (separated by a blank line).
- Add inline comments for complex logic blocks.

# General Coding Conventions

- Keep variable and component names concise yet expressive. Avoid excessive length, over-abstraction/over-engineering, or unnecessary defensive checks that clutter the code.

# Backend Conventions

- Adhere to the MVC architecture. Explicitly specify return types for all Service methods.
- If required, retrieve the current user ID from `context.js` in the API layer and pass it to the Service layer as the **last** parameter.
- Place input parameter types in `entity/bo` and return/response types in `entity/vo`.

# Frontend Conventions

- Import and reuse backend type definitions for API requests and responses.
- Avoid unnecessary component abstraction—only extract components when truly needed.
- Document the purpose of every state, ref, and key variable inside components.

<!-- END:nextjs-agent-rules -->