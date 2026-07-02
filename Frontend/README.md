# React + Vite

## Firestore Setup

1. Copy [.env.example](.env.example) to `.env`.
2. Fill in the values from your Firebase project.
3. Run `npm install` if you have not installed dependencies yet.
4. Start the app with `npm run dev` and verify the connection status on screen.

## Deploy on GitHub Pages

1. Keep local development as-is: `npm run dev` still serves from `/`.
2. Push to `main` to trigger the workflow in [.github/workflows/deploy-frontend-pages.yml](../.github/workflows/deploy-frontend-pages.yml).
3. In your repository, set these GitHub repository Variables (Settings > Secrets and variables > Actions > Variables):
	- `VITE_BACKEND_URL`
	- `VITE_FIREBASE_API_KEY`
	- `VITE_FIREBASE_AUTH_DOMAIN`
	- `VITE_FIREBASE_PROJECT_ID`
	- `VITE_FIREBASE_STORAGE_BUCKET`
	- `VITE_FIREBASE_MESSAGING_SENDER_ID`
	- `VITE_FIREBASE_APP_ID`
	- `VITE_FIREBASE_MEASUREMENT_ID`
4. Enable GitHub Pages source as GitHub Actions.

The workflow sets `VITE_BASE_PATH` automatically to `/<repo-name>/` for Pages. No manual change is needed for local runs.

The frontend only needs the public Firebase config values. If you later want server-side access to Firestore, the backend can use `firebase-admin` with a service account.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
