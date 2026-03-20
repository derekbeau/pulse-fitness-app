const apiPort = process.env.API_PORT ?? process.env.VITE_API_PORT ?? process.env.PORT ?? '3101';

export const apiBaseURL = process.env.API_BASE_URL ?? `http://127.0.0.1:${apiPort}`;
