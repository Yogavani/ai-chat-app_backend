const fastify = require("fastify")({ logger: true });

const userRoutes = require("./routes/userRoutes");

fastify.register(userRoutes);

fastify.get("/", async (request, reply) => {
  return { message: "Chat API running" };
});

const start = async () => {
  try {
    await fastify.listen({ port: 5000 });
    console.log("Server running on port 5000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();