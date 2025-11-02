# Clara Reception System

This repo is structured to deploy smoothly on Vercel.

- `public/` is the static site root (served by Vercel).
- `api/` contains a Serverless Function that mounts the Express app exported from `server.js`.
- `vercel.json` configures the runtime and API routing.

## Deploying to Vercel

1. Create a new Vercel project and select this repository.
2. Root directory: the repository root.
3. Framework preset: None (Vercel will auto-detect).
4. Environment Variables: set the keys from `.env.example`.
5. Deploy.

After deploy, your API is available at `/api/*` on the same domain as the static site. Example:

- Appointment details: `/api/appointment/:id`
- Health check: `/api/health`

The Appointment Details frontend lives at `/appointment-frontend/`. Generate QR codes that point to:

```
https://<your-vercel-domain>/appointment-frontend/?id=<APPOINTMENT_ID>&api=https%3A%2F%2F<your-vercel-domain>
```

The `api` query param lets the page call the live API on the same domain.

## Local development

```bash
npm install
npm run dev
```

Then visit http://localhost:3000.

## Notes
- The API connects to MongoDB using `MONGODB_URI`.
- The `/api/appointment/:id` endpoint will use in-memory data if present (for QR payload flows) and otherwise falls back to MongoDB by `appointmentId`.
