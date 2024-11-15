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

app.use(
  cors({
    origin: "http://localhost:3000",
  })
);

app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

const userScores = {};
let livesByDefault = 5;

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("joinRoom", ({ roomId, userName }) => {
    socket.join(roomId);
    console.log(`User ${userName} joined room N°: ${roomId}`);

    if (!userScores[roomId]) {
      userScores[roomId] = {};
    }
    if (!userScores[roomId][socket.id]) {
      userScores[roomId][socket.id] = {
        userName,
        correctAnswers: 0,
        lives: livesByDefault,
      };
    }

    const room = io.sockets.adapter.rooms.get(roomId);
    const users = Array.from(room || []).map((socketId) => {
      const user = userScores[roomId][socketId] || {
        userName: "Anonymous",
        correctAnswers: 0,
        lives: livesByDefault,
      };
      return {
        userName: user.userName,
        score: user.correctAnswers,
        lives: user.lives,
      };
    });
    io.to(roomId).emit("userList", users);

    if (!room.randomString) {
      const keys = Object.keys(dictionaryJson);
      const randomWord = keys[Math.floor(Math.random() * keys.length)];
      const randomSubstring = randomWord.substring(0, 3);
      room.randomString = randomSubstring;
      io.to(roomId).emit("randomString", randomSubstring);
    } else {
      socket.emit("randomString", room.randomString);
    }

    const roomUserCount = room ? room.size : 0;
    io.to(roomId).emit("userCount", roomUserCount);
  });

  socket.on("startGame", ({ roomId }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room && room.size > 1) {
      io.to(roomId).emit("gameStarted");
    } else {
      socket.emit(
        "gameError",
        "At least 2 players are required to start the game."
      );
    }
  });

  socket.on("correctAnswerAttempt", ({ roomId }) => {
    if (userScores[roomId] && userScores[roomId][socket.id]) {
      if (userScores[roomId][socket.id].lives > 0) {
        userScores[roomId][socket.id].correctAnswers += 1;
      } else {
        socket.emit("forbidden", "You have 0 lives and cannot continue.");
        return;
      }
    }
    const keys = Object.keys(dictionaryJson);
    const randomWord = keys[Math.floor(Math.random() * keys.length)];
    const randomSubstring = randomWord.substring(0, 3);
    io.sockets.adapter.rooms.get(roomId).randomString = randomSubstring;
    io.to(roomId).emit("randomString", randomSubstring);

    const room = io.sockets.adapter.rooms.get(roomId);
    const users = Array.from(room || []).map((socketId) => {
      const user = userScores[roomId][socketId] || {
        userName: "Anonymous",
        correctAnswers: 0,
        lives: livesByDefault,
      };
      return {
        userName: user.userName,
        score: user.correctAnswers,
        lives: user.lives,
      };
    });
    io.to(roomId).emit("userList", users);

    const playersWithLives = Array.from(room || []).filter(
      (socketId) =>
        userScores[roomId][socketId] && userScores[roomId][socketId].lives > 0
    );

    if (playersWithLives.length === 1) {
      const winner = userScores[roomId][playersWithLives[0]];
      io.to(roomId).emit("gameOver", `Game Over. Winner: ${winner.userName}`);
    }
  });

  socket.on("timeOver", ({ roomId }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const keys = Object.keys(dictionaryJson);
    const randomWord = keys[Math.floor(Math.random() * keys.length)];
    const randomSubstring = randomWord.substring(0, 3);
    io.sockets.adapter.rooms.get(roomId).randomString = randomSubstring;
    io.to(roomId).emit("randomString", randomSubstring);

    Array.from(room || []).forEach((socketId) => {
      if (userScores[roomId][socketId]) {
        if (typeof userScores[roomId][socketId].lives !== "number") {
          userScores[roomId][socketId].lives = livesByDefault;
        }
        if (userScores[roomId][socketId].lives > 0) {
          userScores[roomId][socketId].lives -= 1;
        }
      }
    });

    const users = Array.from(room || []).map((socketId) => {
      const user = userScores[roomId][socketId] || {
        userName: "Anonymous",
        correctAnswers: 0,
        lives: livesByDefault,
      };
      return {
        userName: user.userName,
        score: user.correctAnswers,
        lives: user.lives,
      };
    });
    io.to(roomId).emit("userList", users);

    const playersWithLives = Array.from(room || []).filter(
      (socketId) =>
        userScores[roomId][socketId] && userScores[roomId][socketId].lives > 0
    );

    if (playersWithLives.length === 1) {
      const winner = userScores[roomId][playersWithLives[0]];
      io.to(roomId).emit("gameOver", `Game Over. Winner: ${winner.userName}`);
    }
  });

  socket.on("pauseTimer", ({ roomId }) => {
    console.log("pauseTimer");
    io.to(roomId).emit("pauseTimerForAll");
  });

  socket.on("resumeTimer", ({ roomId }) => {
    console.log("resumeTimer");
    io.to(roomId).emit("resumeTimerForAll");
  });

  socket.on("disconnecting", () => {
    for (let roomId of socket.rooms) {
      if (roomId !== socket.id) {
        const room = io.sockets.adapter.rooms.get(roomId);
        if (userScores[roomId]) {
          delete userScores[roomId][socket.id];
        }
        const users = Array.from(room || [])
          .filter((socketId) => socketId !== socket.id)
          .map((socketId) => {
            const user = userScores[roomId][socketId] || {
              userName: "Anonymous",
              correctAnswers: 0,
              lives: livesByDefault,
            };
            return {
              userName: user.userName,
              score: user.correctAnswers,
              lives: user.lives,
            };
          });
        io.to(roomId).emit("userList", users);

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
