const fastify = require("fastify")({ logger: true });
const { Server } = require("socket.io");

const userRoutes = require("./routes/userRoutes");

// Must be decorated before server starts.
fastify.decorate("io", null);

fastify.register(userRoutes);

fastify.get("/", async () => {
  return { message: "Chat API running" };
});

const start = async () => {
  try {
    await fastify.listen({
      port: 5000,
      host: "192.168.13.42"
    });
    console.log("Server running on port 5000");

    // Attach socket.io to Fastify's underlying Node server
    const io = new Server(fastify.server, {
      cors: { origin: "*" }
    });

    // io.on("connection", (socket) => {
    //   console.log("User connected:", socket.id);

    //   socket.on("join", (userId) => {
    //     socket.join(userId);
    //     console.log("User joined room:", userId);
    //   });

    //   socket.on("disconnect", () => {
    //     console.log("User disconnected:", socket.id);
    //   });
    // });
    io.on("connection", (socket) => {
      console.log("User connected:", socket.id, "nsp:", socket.nsp.name);
    
      socket.on("join", (userId) => {
        socket.join(String(userId));
        console.log("User joined room:", userId, "socket:", socket.id, "rooms:", [...socket.rooms]);
      });
    
      socket.on("disconnect", (reason) => {
        console.log("User disconnected:", socket.id, "reason:", reason);
      });
    });
    

    // Make io available in handlers via request.server.io
    fastify.io = io;

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
