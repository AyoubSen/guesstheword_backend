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

// Map to track users and their correct answers per room
const userScores = {};

io.on("connection", (socket) => {
  console.log("a user connected");

  socket.on("joinRoom", ({ roomId, userName }) => {
    socket.join(roomId);
    console.log(`User ${userName} joined room N°: ${roomId}`);

    // Initialize the user score if not already present
    if (!userScores[roomId]) {
      userScores[roomId] = {};
    }
    if (!userScores[roomId][socket.id]) {
      userScores[roomId][socket.id] = { userName, correctAnswers: 0 };
    }

    // Emit the updated user list with scores
    const room = io.sockets.adapter.rooms.get(roomId);
    const users = Array.from(room || []).map((socketId) => {
      const user = userScores[roomId][socketId] || {
        userName: "Anonymous",
        correctAnswers: 0,
      };
      return `${user.userName} (${user.correctAnswers})`;
    });
    io.to(roomId).emit("userList", users);

    // Emit random string if it's not already set
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

  socket.on("correctAnswerAttempt", ({ roomId, submittedWord }) => {
    if (
      dictionaryJson[submittedWord.toLowerCase()] && // Check if the word is in the dictionary
      submittedWord.includes(io.sockets.adapter.rooms.get(roomId).randomString) // Check if it includes the random substring
    ) {
      // Increment the correct answer count for the user
      if (userScores[roomId] && userScores[roomId][socket.id]) {
        userScores[roomId][socket.id].correctAnswers += 1;
      }

      // Generate a new random string for the next round
      const keys = Object.keys(dictionaryJson);
      const randomWord = keys[Math.floor(Math.random() * keys.length)];
      const randomSubstring = randomWord.substring(0, 3);
      io.sockets.adapter.rooms.get(roomId).randomString = randomSubstring;
      io.to(roomId).emit("randomString", randomSubstring);

      // Notify the user that their answer was correct
      socket.emit("answerResult", { correct: true });

      // Update the user list with scores
      const room = io.sockets.adapter.rooms.get(roomId);
      const users = Array.from(room || []).map((socketId) => {
        const user = userScores[roomId][socketId] || {
          userName: "Anonymous",
          correctAnswers: 0,
        };
        return `${user.userName} (${user.correctAnswers})`;
      });
      io.to(roomId).emit("userList", users);
    } else {
      // Notify the user that their answer was incorrect
      socket.emit("answerResult", { correct: false });
    }
  });

  socket.on("disconnecting", () => {
    for (let roomId of socket.rooms) {
      if (roomId !== socket.id) {
        const room = io.sockets.adapter.rooms.get(roomId);
        delete userScores[roomId][socket.id]; // Remove user from tracking on disconnect

        const users = Array.from(room || [])
          .filter((socketId) => socketId !== socket.id)
          .map((socketId) => {
            const user = userScores[roomId][socketId] || {
              userName: "Anonymous",
              correctAnswers: 0,
            };
            return `${user.userName} (${user.correctAnswers})`;
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
