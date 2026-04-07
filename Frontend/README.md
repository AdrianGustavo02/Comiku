# React + Vite

This template now includes a ready-to-use Firebase and Firestore connection layer for Comiku.

## Firestore Setup

1. Copy [.env.example](.env.example) to `.env`.
2. Fill in the values from your Firebase project.
3. Run `npm install` if you have not installed dependencies yet.
4. Start the app with `npm run dev` and verify the connection status on screen.

The frontend only needs the public Firebase config values. If you later want server-side access to Firestore, the backend can use `firebase-admin` with a service account.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
