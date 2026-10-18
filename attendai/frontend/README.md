# AttendAI frontend

React 19 + TypeScript + Vite + Tailwind CSS 4 + Recharts. Needs Node 20.19 or newer (`node -v`).

```
npm install
npm run dev        # http://localhost:5173
```

The backend must be running on http://localhost:8000. To point somewhere else, copy `.env.example` to `.env` and edit `VITE_API_URL`.

`npm run build` type-checks and creates the production bundle in `dist/`.
