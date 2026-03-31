require("dotenv").config();
const fastify = require("fastify")({ logger: true, ignoreTrailingSlash: true });
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const os = require("os");
const fastifyStatic = require("@fastify/static");
const fastifyMultipart = require("@fastify/multipart");
const db = require("./db");

const userRoutes = require("./routes/userRoutes");

// Must be decorated before server starts.
fastify.decorate("io", null);

fastify.register(fastifyMultipart, {
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});
fastify.register(fastifyStatic, {
  root: path.join(process.cwd(), "uploads"),
  prefix: "/uploads/"
});

fastify.register(userRoutes);

fastify.get("/", async () => {
  return { message: "Chat API running" };
});

fastify.get("/test-db", async (request, reply) => {
  try {
    await db.query("SELECT 1");
    return { success: true };
  } catch (err) {
    return reply.code(500).send({ error: err.message });
  }
});

fastify.get("/uploads/profile-images/:fileName", async (request, reply) => {
  const { fileName } = request.params;
  const safeFileName = path.basename(fileName);
  const filePath = path.join(process.cwd(), "uploads", "profile-images", safeFileName);

  if (!fs.existsSync(filePath)) {
    return reply.code(404).send({ message: "File not found" });
  }

  const extension = path.extname(safeFileName).toLowerCase();
  const mimeMap = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp"
  };
  reply.type(mimeMap[extension] || "application/octet-stream");
  return fs.createReadStream(filePath);
});

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || "0.0.0.0";

const isHostAvailable = (host) => {
  if (!host) return false;
  if (host === "0.0.0.0" || host === "::" || host === "localhost" || host === "127.0.0.1") {
    return true;
  }

  const interfaces = os.networkInterfaces();
  return Object.values(interfaces)
    .flat()
    .some((iface) => iface && iface.address === host);
};

const start = async () => {
  try {
    await fastify.ready();
    console.log(fastify.printRoutes());

    let listeningHost = isHostAvailable(HOST) ? HOST : "0.0.0.0";
    if (HOST !== listeningHost) {
      fastify.log.warn(`Host ${HOST} not available, using ${listeningHost}:${PORT}`);
    }
    try {
      await fastify.listen({ port: PORT, host: listeningHost });
    } catch (err) {
      if (err?.code === "EADDRNOTAVAIL" && listeningHost !== "0.0.0.0") {
        fastify.log.warn(
          `Host ${listeningHost} not available, retrying on 0.0.0.0:${PORT}`
        );
        listeningHost = "0.0.0.0";
        await fastify.listen({ port: PORT, host: listeningHost });
      } else {
        throw err;
      }
    }
    console.log(`Server running on ${listeningHost}:${PORT}`);

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
    io.on("connection", (socket) => {
      socket.on("join", (userId) => {
        socket.join(String(userId));
        // optional: mark online + broadcast status
        io.emit("user-status", { userId, online: true });
      });
    
      socket.on("typing", ({ fromUserId, toUserId }) => {
        // console.log("typing room members", toUserId, [...(io.sockets.adapter.rooms.get(String(toUserId)) || [])]);
        io.to(String(toUserId)).emit("typing", { fromUserId, toUserId });
      });
      
      socket.on("stop-typing", ({ fromUserId, toUserId }) => {
        io.to(String(toUserId)).emit("stop-typing", { fromUserId, toUserId });
      });
      
    
      socket.on("get-user-status", ({ userId }) => {
        const room = io.sockets.adapter.rooms.get(String(userId));
        socket.emit("user-status", { userId, online: Boolean(room && room.size) });
      });
      
    });
    io.on("connection", (socket) => {
      socket.on("messages-seen", async ({ messageIds, fromUserId, toUserId }) => {
        // 1) update DB as seen (optional but recommended)
        // await markMessagesSeen(messageIds, fromUserId);
    
        // 2) notify original sender that receiver has seen them
        io.to(String(toUserId)).emit("messages-seen", {
          messageIds,
          fromUserId,
          toUserId
        });
      });
    
      socket.on("message-seen", async ({ messageIds, fromUserId, toUserId, messageId }) => {
        const ids = Array.isArray(messageIds) ? messageIds : [messageId].filter(Boolean);
    
        // await markMessagesSeen(ids, fromUserId);
    
        io.to(String(toUserId)).emit("message-seen", {
          messageIds: ids,
          fromUserId,
          toUserId
        });
      });
    });
    

    // Make io available in handlers via request.server.io
    fastify.io = io;

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  try {
    fastify.log.info(`Received ${signal}. Closing server...`);
    await fastify.close();
    await db.end();
    fastify.log.info("Server and DB pool closed cleanly.");
    process.exit(0);
  } catch (error) {
    fastify.log.error(error, "Error during graceful shutdown");
    process.exit(1);
  }
};

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    void gracefulShutdown(signal);
  });
});

start();
