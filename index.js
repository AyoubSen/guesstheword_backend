import express from "express";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Server } from "socket.io";
import cors from "cors";
import dictionaryJson from "./words_dictionary.json" assert { type: "json" };
const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use CORS middleware for Express
app.use(
  cors({
    origin: "http://localhost:3000",
  })
);

let connectedUsers = 0;

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("joinRoom", (roomId) => {
    socket.join(roomId);
    console.log(`User joined room N°: ${roomId}`);

    if (!io.sockets.adapter.rooms.get(roomId).randomString) {
      const keys = Object.keys(dictionaryJson);
      const randomWord = keys[Math.floor(Math.random() * keys.length)];
      const randomSubstring = randomWord.substring(0, 3);
      io.sockets.adapter.rooms.get(roomId).randomString = randomSubstring;

      io.to(roomId).emit("randomString", randomSubstring);
    } else {
      const existingRandomString =
        io.sockets.adapter.rooms.get(roomId).randomString;
      socket.emit("randomString", existingRandomString);
    }

    const room = io.sockets.adapter.rooms.get(roomId);
    const roomUserCount = room ? room.size : 0;
    io.to(roomId).emit("userCount", roomUserCount);
  });

  socket.on("correctAnswer", (roomId) => {
    const keys = Object.keys(dictionaryJson);
    const randomWord = keys[Math.floor(Math.random() * keys.length)];
    const randomSubstring = randomWord.substring(0, 3);

    io.sockets.adapter.rooms.get(roomId).randomString = randomSubstring;
    io.to(roomId).emit("randomString", randomSubstring);
  });

  socket.on("disconnecting", () => {
    for (let roomId of socket.rooms) {
      if (roomId !== socket.id) {
        const room = io.sockets.adapter.rooms.get(roomId);
        const roomUserCount = room ? room.size - 1 : 0;
        io.to(roomId).emit("userCount", roomUserCount);
      }
    }
    console.log("a user disconnected");
  });
});

server.listen(8000, () => {
  console.log("server running at http://localhost:8000");
});
