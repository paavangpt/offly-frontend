# Offly frontend

React + Vite frontend for Offly authentication and role-specific workspaces, styled with Tailwind CSS 4. The Vite Tailwind plugin compiles the single required Tailwind entry stylesheet at `src/index.css`; component styling lives in its Tailwind `@layer` definitions.

## Local development

Run the backend on `http://localhost:8080`, then start the frontend:

```sh
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8080`. Set `OFFLY_API_PROXY` before starting Vite to use a different backend URL. For a separately hosted frontend, set `VITE_API_BASE_URL` to the backend origin and configure the backend’s CORS and cookie settings for that origin.

## Authentication and roles

- Login sends HTTP Basic credentials to `POST /api/auth/login`; the API sets the HttpOnly session cookie.
- The frontend checks `GET /api/auth/me` on load and opens the shared `/dashboard` route.
- The authenticated profile role selects the components rendered inside that dashboard. Employees get leave request creation, history, detail and timeline views, follow-up replies with documents, cancellation, and document downloads.
- Sign out calls `POST /api/auth/logout`.

Role routing is a frontend navigation guard. Any future role-specific data endpoints must also enforce authorization on the backend.

## Frontend design skill

The project skill and reference notes are in `skills/frontend-design/`. Source: [vipulgupta2048/codex-skills](https://github.com/vipulgupta2048/codex-skills/tree/master/skills/frontend-design), MIT.
