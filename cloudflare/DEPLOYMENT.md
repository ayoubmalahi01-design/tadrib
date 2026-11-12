# Cloudflare Pages deployment

1. Push this project to a dedicated GitHub repository named `the-trainers` (or another name you choose).
2. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Select the The Trainers repository.
4. Framework preset: Vite.
5. Build command: `npm run build`.
6. Build output directory: `dist`.
7. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Settings → Environment variables for Production and Preview.
8. Deploy and open the HTTPS URL on Android Chrome or iPhone Safari.

`public/_redirects` supplies SPA route fallback. `public/manifest.webmanifest`, PNG icons, and the service worker provide the installable PWA shell.

Never add the Supabase `service_role` key to Cloudflare Pages. It belongs only in Supabase Edge Function secrets.
