const express = require("express");
const app = express();
const http = require("http");
const fetch = require("node-fetch");
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

let real_answer_to_check = '';

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
  });

  socket.on('start_game', (quizId) => {
    console.log(quizId);
    const urls = [
      `http://127.0.0.1:8090/api/collections/quiz_question/records?perPage=100&filter=(quiz="${quizId}")`,
      `http://127.0.0.1:8090/api/collections/music_question/records?perPage=100&filter=(quiz="${quizId}")`,
      `http://127.0.0.1:8090/api/collections/open_question/records?perPage=100&filter=(quiz="${quizId}")`];
    const requests = urls.map(url => fetch(url));
    Promise.all(requests)
      .then(responses => Promise.all(responses.map(r => r.json())))
      .then(data => {
        questions = data.map(d => d.items).flat(2).sort(() => Math.random() - 0.5);
        io.emit('game_started');

        const {real_answer, ...question} = questions[currentQuestion];
        io.emit('next_question', question);
        real_answer_to_check = real_answer;
        currentQuestion++;

        let timer = setInterval(() => {
          if (currentQuestion === questions.length) {
            clearInterval(timer);
            io.emit('game_finished');
            currentQuestion = 0;
          } else {
            const {real_answer, ...question} = questions[currentQuestion];
            io.emit('next_question', question);
            real_answer_to_check = real_answer;
            currentQuestion++;
          }
        }, 1000);
      });

  });
});

server.listen(8080, () => {
  console.log("listening on *:8080");
});
