const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});


let room = {
  presenter: {

  },
  players: {

  }
};

let questions = [];

let currentQuestion = 0;

io.on("connection", (socket) => {
  console.log("a user connected");
  socket.on("disconnect", () => {
    console.log("user disconnected");
    delete room.presenter[socket.id];
    delete room.players[socket.id];

    io.emit('user_disconnected', room);
  });

  socket.on('join', (data) => {

    if (data.type === 'player') {
      room = {
        ...room,
        players: {
          ...room.players,
          [socket.id]: {
            userName: data.userName,
            score: 0,
            type: data.type
          }
        }
      }
    }

    if (data.type === 'presenter') {
      room = {
        ...room,
        presenter: {
          [socket.id]: {
            userName: data.userName,
            type: data.type
          }
        }
      }
    }

    io.emit('user_connected', room);

    console.log(room);
  });
});

server.listen(8080, () => {
  console.log("listening on *:8080");
});
