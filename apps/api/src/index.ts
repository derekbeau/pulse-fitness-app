import Fastify from "fastify";

export const buildServer = () => {
  const app = Fastify({ logger: true });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
};

const start = async () => {
  const app = buildServer();

  try {
    const address = await app.listen({ host: "0.0.0.0", port: 3001 });
    app.log.info(`API server listening at ${address}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== "test") {
  void start();
}
