const express = require('express');
const ngrok = require('ngrok');
require('dotenv').config();
const app = express();
const http = require('http');
const fetch = require('node-fetch');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['PUT', 'GET', 'POST', 'DELETE', 'OPTIONS'],
    credentials: false,
  },
});

let gameCode = '';

(async function () {
  const ngrokUrl = await ngrok.connect({
    proto: 'http',
    addr: 8080,
    authtoken: process.env.AUTH_TOKEN_1,
  });
  gameCode = ngrokUrl.slice(8, ngrokUrl.indexOf('.ngrok-free.app'));
})();

const createRanking = (players) => {
  const ranking = Object.keys(players)
    .map((key) => {
      return {
        userName: players[key].userName,
        socketId: key,
        score: players[key].score,
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranking;
};

const assignRanks = (ranking) => {
  let rank = 1;
  let lastScore = ranking[0].score;
  let lastRank = 1;
  ranking.forEach((player, index) => {
    if (player.score === lastScore) {
      ranking[index].rank = lastRank;
    } else {
      ranking[index].rank = rank;
      lastRank = rank;
      lastScore = player.score;
    }
    rank++;
  });
  return ranking;
};

let room = {
  presenter: {},
  players: {},
};

let questions = [];

let currentQuestion = 0;

let real_answer_to_check = '';

let number_of_answers = 0;

let isGameStarted = false;

io.on('connection', (socket) => {
  console.log('a user connected');

  socket.on('disconnect', () => {
    delete room.presenter[socket.id];
    delete room.players[socket.id];
    console.log('a user disconnected');
    io.emit('user_disconnected', room);

    if (Object.keys(room.players).length !== 0) {
      const { real_answer, ...question } = questions[currentQuestion];

      number_of_answers--;
      if (number_of_answers < 0) {
        number_of_answers = 0;
      }
      io.to(Object.keys(room.presenter)[0]).emit(
        'new_answer',
        number_of_answers
      );

      if (question.collectionName === 'quiz_question') {
        if (number_of_answers === Object.keys(room.players).length) {
          io.emit('close_answers_checked', real_answer_to_check);
        }
      } else if (
        question.collectionName === 'music_question' ||
        question.collectionName === 'open_question'
      ) {
        if (number_of_answers === Object.keys(room.players).length) {
          io.emit('open_answers_checked');
          io.to(Object.keys(room.presenter)[0]).emit(
            'open_answers_checked_presenter',
            room
          );
          Object.keys(room.players).forEach((socketId) => {
            room.players[socketId].currentOpenAnswer = '';
          });
        }
      }
    }
  });

  socket.on('join', (data) => {
    if (data.type === 'player') {
      if (isGameStarted) {
        const { real_answer, ...question } = questions[currentQuestion];
        socket.emit('next_question', question);
      }

      room = {
        ...room,
        players: {
          ...room.players,
          [socket.id]: {
            userName: data.userName,
            score: 0,
            type: data.type,
            currentOpenAnswer: '',
          },
        },
      };
    }

    if (data.type === 'presenter') {
      socket.emit('game_code', gameCode);
      // socket.emit('game_code', 'Temp');

      room = {
        ...room,
        presenter: {
          [socket.id]: {
            userName: data.userName,
            type: data.type,
          },
        },
      };
    }

    io.emit('user_connected', room);
  });

  socket.on('start_game', (quizId) => {
    const urls = [
      `http://127.0.0.1:8090/api/collections/quiz_question/records?perPage=100&filter=(quiz="${quizId}")`,
      `http://127.0.0.1:8090/api/collections/music_question/records?perPage=100&filter=(quiz="${quizId}")`,
      `http://127.0.0.1:8090/api/collections/open_question/records?perPage=100&filter=(quiz="${quizId}")`,
    ];
    const requests = urls.map((url) => fetch(url));
    Promise.all(requests)
      .then((responses) => Promise.all(responses.map((r) => r.json())))
      .then((data) => {
        const filteredData = data.filter((record) =>
          record.hasOwnProperty('items')
        );
        questions = filteredData
          .map((d) => d.items)
          .flat(2)
          .sort(() => Math.random() - 0.5);
        isGameStarted = true;
        io.emit('game_started');

        const { real_answer, ...question } = questions[currentQuestion];
        io.emit('next_question', question);
        real_answer_to_check = real_answer;
      });
  });

  socket.on('times_up', () => {
    if (questions[currentQuestion].collectionName === 'quiz_question') {
      io.emit('close_answers_checked', real_answer_to_check);
    } else {
      io.emit('open_answers_checked');
      io.to(Object.keys(room.presenter)[0]).emit(
        'open_answers_checked_presenter',
        room
      );
      Object.keys(room.players).forEach((socketId) => {
        room.players[socketId].currentOpenAnswer = '';
      });
    }
  });

  socket.on('answer', (answer) => {
    const { real_answer, ...question } = questions[currentQuestion];
    if (answer.questionId === question.id) {
      number_of_answers++;

      io.to(Object.keys(room.presenter)[0]).emit(
        'new_answer',
        number_of_answers
      );

      if (
        question.collectionName === 'quiz_question' &&
        real_answer === answer.answer
      ) {
        socket.emit('good_answer');
        room = {
          ...room,
          players: {
            ...room.players,
            [socket.id]: {
              ...room.players[socket.id],
              score: room.players[socket.id].score + 1,
            },
          },
        };
      }

      if (question.collectionName === 'quiz_question') {
        if (number_of_answers === Object.keys(room.players).length) {
          io.emit('close_answers_checked', real_answer_to_check);
        }
      }

      if (
        question.collectionName === 'music_question' ||
        question.collectionName === 'open_question'
      ) {
        room = {
          ...room,
          players: {
            ...room.players,
            [socket.id]: {
              ...room.players[socket.id],
              currentOpenAnswer: answer.answer,
            },
          },
        };

        if (number_of_answers === Object.keys(room.players).length) {
          io.emit('open_answers_checked');
          io.to(Object.keys(room.presenter)[0]).emit(
            'open_answers_checked_presenter',
            room
          );
          Object.keys(room.players).forEach((socketId) => {
            room.players[socketId].currentOpenAnswer = '';
          });
        }
      }
    }
  });

  socket.on('check_open_answers', (rightSockets) => {
    rightSockets.forEach((socketId) => {
      room = {
        ...room,
        players: {
          ...room.players,
          [socketId]: {
            ...room.players[socketId],
            score: room.players[socketId].score + 1,
          },
        },
      };
    });
  });

  socket.on('go_next_question', () => {
    currentQuestion++;
    number_of_answers = 0;
    io.to(Object.keys(room.presenter)[0]).emit('new_answer', number_of_answers);
    if (currentQuestion === questions.length) {
      const ranking = createRanking(room.players);
      const rankedRanking = assignRanks(ranking);
      isGameStarted = false;
      io.to(Object.keys(room.presenter)[0]).emit(
        'game_finished',
        rankedRanking
      );
      Object.keys(room.players).forEach((socketId) => {
        io.to(socketId).emit('game_finished', {
          ...rankedRanking.find((player) => player.socketId === socketId),
          questionQty: currentQuestion,
        });
      });
      room = {
        presenter: {},
        players: {},
      };
      currentQuestion = 0;
    } else {
      console.log(currentQuestion);
      console.log(questions);
      const { real_answer, ...question } = questions[currentQuestion];
      io.emit('next_question', question);
      real_answer_to_check = real_answer;
    }
  });
});

server.listen(8080, () => {
  console.log('listening on *:8080');
});
