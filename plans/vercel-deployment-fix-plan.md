# Vercel Deployment Fix Plan: Writer App API Calls

## Problem Summary

The Writer app (`/writer/`) works perfectly locally but fails on Vercel:
- After login, the story list doesn't populate
- Creating new stories doesn't work
- API calls fail (likely CORS errors)

## Root Cause Analysis

### Architecture Overview

The project uses an architecture where a FastAPI backend (running on the user's machine) is exposed via an ngrok tunnel:

```
┌──────────────────┐         ┌──────────────┐         ┌──────────────┐
│   Browser (Vercel) │  ──►  │  Vercel Edge  │  ──►  │  ngrok Tunnel │  ──►  │ FastAPI Backend │
└──────────────────┘         └──────────────┘         └──────────────┘         └─────────────────┘
```

### The Bug

In [`writer/js/config.js`](writer/js/config.js:1), the API base URL is configured as:

```js
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_BASE = isLocal ? 'http://127.0.0.1:8001/api' : 'https://curse-passivism-omnivore.ngrok-free.dev/api';
```

On Vercel (`isLocal = false`), **the browser makes direct requests to `https://curse-passivism-omnivore.ngrok-free.dev/api`** — a **cross-origin** request. This triggers CORS (Cross-Origin Resource Sharing) restrictions in the browser, blocking the API calls.

### Why Vercel Proxy Already Exists (But Isn't Used)

The [`vercel.json`](vercel.json:2) already has a rewrite rule that proxies `/api/*` requests through Vercel to ngrok:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://curse-passivism-omnivore.ngrok-free.dev/api/:path*"
    }
  ]
}
```

This means if the browser requests `/api/stories` from the same Vercel domain, Vercel will proxy it to ngrok server-to-server. **Server-to-server requests don't have CORS restrictions** — the browser only sees the response from its own origin (Vercel).

### Why the Main Portfolio Page Works

The root [`app.js`](app.js:224) already uses the Vercel proxy correctly:

```js
const apiEndpoint = isLocal ? 'http://127.0.0.1:8000/api/hello' : '/api/hello';
```

Only the Writer app's `config.js` bypasses the proxy.

## Solution

A single-line change in [`writer/js/config.js`](writer/js/config.js:3):

| Current (Broken) | Fixed |
|---|---|
| `'https://curse-passivism-omnivore.ngrok-free.dev/api'` | `'/api'` |

This makes the Writer app use the Vercel proxy, ensuring:
- ✅ Same-origin requests (no CORS issues)
- ✅ Authentication headers (`Authorization: Bearer`) are forwarded correctly
- ✅ All HTTP methods (GET, POST, DELETE) work through the proxy
- ✅ Consistent with how the main portfolio page already works

## Files Changed

| File | Change Type | Description |
|---|---|---|
| [`writer/js/config.js`](writer/js/config.js:3) | **Modify** | Change production `API_BASE` from ngrok URL to `/api` |

## Verification Steps

1. After applying the fix, commit and push to GitHub
2. Vercel will auto-deploy
3. Test on the Vercel deployment URL:
   - Navigate to `/writer/`
   - Log in
   - Click the story selector — stories should load
   - Create a new story — should succeed

## Potential Edge Cases

| Concern | Mitigation |
|---|---|
| Ngrok tunnel goes down | The Vercel proxy will return the same error as direct calls — no regression |
| Authentication headers dropped | Vercel rewrites forward all headers, including `Authorization` |
| Request body dropped | Vercel rewrites forward request bodies for POST/PUT/DELETE |
| Backend expects different path prefix | The proxy preserves `/api/:path*` so paths remain identical |
