import { Game } from '../Models/Game.js';
import generateQuestions from '../utils/questionGenerator.js';
import { User } from '../Models/User.js';

const activeGames = new Map();
const publicActiveGames = new Map(); 

const TOPIC_OPTIONS = ["solana", "music", "sports", "movies", "history", "fashion"];
const GAME_OPTIONS = ["basketball", "survivor", "dart", "conquest"];

export function gameHandlers(io, socket, activeRooms, { safeEmit, safeBroadcast, removeCircularReferences }) {

  // NEW: Emit player screen updates to spectators
  const emitPlayerScreenUpdate = (roomCode, playerId, action, data) => {
    io.to(`room-${roomCode}-viewers`).emit('player-screen-update', {
      playerId,
      action,
      data,
      timestamp: Date.now()
    });
    console.log(`🖥️ Player screen update for ${playerId}: ${action}`, data);
  };

  // NEW: Emit player role assignment to spectators
  const emitPlayerRoles = (roomCode, playerRoles) => {
    io.to(`room-${roomCode}-viewers`).emit('player-roles-assigned', {
      playerRoles,
      timestamp: Date.now()
    });
  };

  // NEW: Emit game progress updates function
  const emitGameProgress = (roomCode, progress) => {
    io.to(roomCode).emit('game-progress', progress);
  };

  // NEW: Emit question to all spectators and players
  const emitQuestionToAll = (roomCode, question, topic) => {
    io.to(roomCode).emit('question-selected', {
      question: question,
      topic: topic
    });
    console.log(`❓ Question emitted to all in room ${roomCode}: ${question.question.substring(0, 50)}...`);
  };

  // NEW: Emit game to all spectators and players
  const emitGameToAll = (roomCode, game) => {
    const selectedGame = {
      name: game,
      type: getGameType(game),
      description: getGameDescription(game),
      instructions: getGameInstructions(game)
    };
    
    io.to(roomCode).emit('game-selected', {
      game: selectedGame
    });
    console.log(`🎮 Game emitted to all in room ${roomCode}: ${game}`);
  };

  socket.on('start-game-from-room', async (roomCode) => {
    try {
      const user = socket.user;
      if (!user) {
        safeEmit(socket, 'room-error', { message: 'Authentication required' });
        return;
      }

      const room = activeRooms.get(roomCode);
      if (!room) {
        safeEmit(socket, 'room-error', { message: 'Room not found' });
        return;
      }

      const player = room.players.find(p => p.id === user._id.toString());
      if (!player || !player.isOwner) {
        safeEmit(socket, 'room-error', { message: 'Only room owner can start game' });
        return;
      }

      // Check if room is full
      if (room.players.length !== room.settings.playerCount) {
        safeEmit(socket, 'room-error', { message: `Room needs ${room.settings.playerCount} players to start` });
        return;
      }

      // Check if all players are ready
      const allReady = room.players.every(player => player.isReady);
      if (!allReady) {
        safeEmit(socket, 'room-error', { message: 'Not all players are ready' });
        return;
      }

      console.log(`🚀 Starting SINGLE ROUND game in room: ${roomCode}, Mode: ${room.settings.mode}`);

      // ✅ FIXED: Safe wager deduction with transaction
      const wager = room.settings.wager || 0;
      if (wager > 0) {
        try {
          const session = await User.startSession();
          session.startTransaction();
          
          const deductionResults = [];
          
          for (const player of room.players) {
            const user = await User.findById(player.id).session(session);
            if (!user) {
              throw new Error(`User ${player.id} not found`);
            }
            
            if (user.coinBalance < wager) {
              throw new Error(`Insufficient balance for ${user.name}. Needs ${wager} but has ${user.coinBalance}`);
            }
            
            user.coinBalance -= wager;
            await user.save({ session });
            deductionResults.push({ 
              userId: player.id, 
              name: player.name, 
              success: true,
              newBalance: user.coinBalance 
            });
            
            console.log(`💰 Deducted ${wager} from ${user.name}, new balance: ${user.coinBalance}`);
          }
          
          await session.commitTransaction();
          session.endSession();
          
          console.log('✅ All wagers deducted successfully:', deductionResults);
          
        } catch (deductionError) {
          await session.abortTransaction();
          session.endSession();
          
          console.error('❌ Wager deduction failed:', deductionError);
          safeEmit(socket, 'room-error', { 
            message: `Failed to deduct wagers: ${deductionError.message}` 
          });
          return; // ⚠️ STOP game start if deduction fails
        }
      }

      // ✅ Only proceed with game creation if deduction was successful
      console.log(`🎯 Creating game state for room: ${roomCode}`);
      
      // Create game state
      const gameState = createGameStateForMode(room, user);
      activeGames.set(roomCode, gameState);

      // NEW: Emit player roles to spectators immediately
      emitPlayerRoles(roomCode, gameState.playerRoles);

      // Update room status
      room.status = 'starting';
      safeBroadcast(io, roomCode, 'room-updated', room); 
      
      // Create game in database
      const game = new Game({
        roomCode: roomCode,
        mode: room.settings.mode,
        topic: gameState.selectedTopic,
        maxPlayers: room.settings.playerCount,
        playerCount: room.settings.playerCount,
        creator: user._id.toString(),
        players: room.players.map(p => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          team: p.team,
          socketId: p.socketId,
          isOwner: p.isOwner,
          isReady: p.isReady
        })),
        questions: [], 
        status: 'active',
        currentRound: 1,
        teamScores: { A: 0, B: 0 },
        startedAt: new Date(),
        wager: wager // ✅ Store wager amount in game record
      });

      await game.save();

      publicActiveGames.set(roomCode, {
        roomCode,
        mode: game.mode,
        topic: game.topic,
        players: game.players.map(p => ({ name: p.name, avatar: p.avatar, id : p.id })),
        startedAt: game.startedAt,
        wager: game.wager,
        status: 'active'
      });

      // ✅ Notify all connected viewers
      io.emit('active-games-updated', Array.from(publicActiveGames.values()));

      // For new modes, auto-start the round and emit content to spectators
      if (room.settings.mode === 'question-vs-question' || room.settings.mode === 'game-vs-game') {
        setTimeout(() => {
          startRoundForNewModes(roomCode, gameState);
        }, 3000);
      }

      // ✅ FIXED: Notify players with updated balance info
      safeBroadcast(io, roomCode, 'game-started', {
        room: room,
        game: game,
        gameState: gameState,
        redirectUrl: `/gameroom/${roomCode}/game`,
        wagerDeducted: wager,
        message: wager > 0 ? `${wager} coins deducted from each player` : 'Free game started'
      });

      safeBroadcast(io, roomCode, 'game-state-updated', gameState);

      console.log(`🎯 Single round game started for room: ${roomCode}, Wager: ${wager}`);

    } catch (error) {
      console.error('❌ Start game error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to start game: ' + error.message });
    }
  });

  // Start round for new modes - UPDATED with question consistency fix
  const startRoundForNewModes = async (roomCode, gameState) => {
    const room = activeRooms.get(roomCode);
    if (!room) return;

    gameState.roundStarted = true;
    gameState.phase = gameState.mode === 'question-vs-question' ? 'question-round' : 'game-round';
    
    // NEW: Emit content to spectators based on mode
    if (gameState.mode === 'question-vs-question' && gameState.selectedTopic) {
      try {
        // ✅ FIX: Store questions in gameState for consistency
        if (!gameState.questions || gameState.questions.length === 0) {
          gameState.questions = await generateQuestions(gameState.selectedTopic, 50);
        }
        
        if (gameState.questions.length > 0) {
          // ✅ FIX: Use consistent question index
          if (gameState.currentQuestionIndex === undefined) {
            gameState.currentQuestionIndex = 0;
          }
          
          const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
          gameState.currentQuestion = currentQuestion;
          
          console.log(`🎯 Emitting question ${gameState.currentQuestionIndex} to all:`, currentQuestion.question.substring(0, 50));
          
          emitQuestionToAll(roomCode, currentQuestion, gameState.selectedTopic);
          
          // NEW: Emit player screen updates for question start
          Object.keys(gameState.playerRoles).forEach(playerId => {
            if (gameState.playerRoles[playerId] === 'questions') {
              emitPlayerScreenUpdate(roomCode, playerId, 'question-started', {
                question: currentQuestion,
                topic: gameState.selectedTopic
              });
            }
          });
        }
      } catch (error) {
        console.error('❌ Question generation error in startRoundForNewModes:', error);
      }
    } else if (gameState.mode === 'game-vs-game' && gameState.selectedGame) {
      emitGameToAll(roomCode, gameState.selectedGame);
      gameState.currentGame = {
        name: gameState.selectedGame,
        type: getGameType(gameState.selectedGame),
        description: getGameDescription(gameState.selectedGame),
        instructions: getGameInstructions(gameState.selectedGame)
      };
      
      // NEW: Emit player screen updates for game start
      Object.keys(gameState.playerRoles).forEach(playerId => {
        if (gameState.playerRoles[playerId] === 'games') {
          emitPlayerScreenUpdate(roomCode, playerId, 'game-started', {
            game: gameState.currentGame
          });
        }
      });
    }
    
    // Start the round timer - 3 minutes only
    startRoundTimer(roomCode, 180);

    safeBroadcast(io, roomCode, 'round-started', {
      choice: gameState.mode === 'question-vs-question' ? 'questions' : 'games',
      topic: gameState.selectedTopic,
      game: gameState.selectedGame,
      timeLeft: 180
    });

    safeBroadcast(io, roomCode, 'game-state-updated', gameState);
  };

  // Start round event for new modes - UPDATED with question consistency fix
  socket.on('start-round', async (data) => {
    try {
      const { roomCode, choice, topic, game } = data;
      const gameState = activeGames.get(roomCode);
      if (!gameState) return;

      const room = activeRooms.get(roomCode);
      if (!room) return;

      // Update game state
      gameState.choice = choice;
      gameState.selectedTopic = topic;
      gameState.selectedGame = game;
      gameState.phase = choice === 'questions' ? 'question-round' : 'game-round';
      gameState.roundStarted = true;

      // NEW: Emit content to spectators
      if (choice === 'questions' && topic) {
        try {
          // ✅ FIX: Store questions in gameState for consistency
          if (!gameState.questions || gameState.questions.length === 0) {
            gameState.questions = await generateQuestions(topic, 50);
          }
          
          if (gameState.questions.length > 0) {
            // ✅ FIX: Use consistent question index
            if (gameState.currentQuestionIndex === undefined) {
              gameState.currentQuestionIndex = 0;
            }
            
            const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
            gameState.currentQuestion = currentQuestion;
            
            console.log(`🎯 Emitting question ${gameState.currentQuestionIndex} to all:`, currentQuestion.question.substring(0, 50));
            
            emitQuestionToAll(roomCode, currentQuestion, topic);
            
            // NEW: Emit player screen updates for question start
            Object.keys(gameState.playerRoles).forEach(playerId => {
              if (gameState.playerRoles[playerId] === 'questions') {
                emitPlayerScreenUpdate(roomCode, playerId, 'question-started', {
                  question: currentQuestion,
                  topic: topic
                });
              }
            });
          }
        } catch (error) {
          console.error('❌ Question generation error in start-round:', error);
        }
      } else if (choice === 'games' && game) {
        emitGameToAll(roomCode, game);
        gameState.currentGame = {
          name: game,
          type: getGameType(game),
          description: getGameDescription(game),
          instructions: getGameInstructions(game)
        };
        
        // NEW: Emit player screen updates for game start
        Object.keys(gameState.playerRoles).forEach(playerId => {
          if (gameState.playerRoles[playerId] === 'games') {
            emitPlayerScreenUpdate(roomCode, playerId, 'game-started', {
              game: gameState.currentGame
            });
          }
        });
      }

      // Start timer - 3 minutes only
      startRoundTimer(roomCode, 180);

      safeBroadcast(io, roomCode, 'round-started', {
        choice,
        topic,
        game,
        timeLeft: 180
      });

      safeBroadcast(io, roomCode, 'game-state-updated', gameState);

    } catch (error) {
      console.error('❌ Start round error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to start round' });
    }
  });

  // Make choice handler - UPDATED with question consistency fix
  socket.on('make-choice', async (data) => {
    try {
      const { roomCode, choice, topic, game } = data;
      const gameState = activeGames.get(roomCode);
      if (!gameState) {
        safeEmit(socket, 'game-error', { message: 'Game not found' });
        return;
      }

      if (gameState.phase !== 'choice') return;

      const user = socket.user;
      if (!user) return;

      if (gameState.winner.id !== user._id.toString()) {
        safeEmit(socket, 'room-error', { message: 'Only the winner can make the choice' });
        return;
      }

      const winnerTeam = gameState.winner.team;
      const loserTeam = winnerTeam === 'A' ? 'B' : 'A';
      
      gameState.teamRoundTypes = {
        [winnerTeam]: choice,
        [loserTeam]: choice === 'questions' ? 'games' : 'questions'
      };

      // NEW: Update player roles based on choice
      gameState.teams[winnerTeam].forEach(player => {
        gameState.playerRoles[player.id] = choice;
      });
      gameState.teams[loserTeam].forEach(player => {
        gameState.playerRoles[player.id] = choice === 'questions' ? 'games' : 'questions';
      });

      gameState.choice = choice;
      gameState.winnerChoice = choice;
      gameState.selectedTopic = topic;
      gameState.selectedGame = game;
      gameState.phase = 'round-started';

      // NEW: Emit updated player roles to spectators
      emitPlayerRoles(roomCode, gameState.playerRoles);

      // NEW: Emit content to spectators immediately when choice is made
      if (choice === 'questions' && topic) {
        try {
          // ✅ FIX: Store questions in gameState for consistency
          if (!gameState.questions || gameState.questions.length === 0) {
            gameState.questions = await generateQuestions(topic, 50);
          }
          
          if (gameState.questions.length > 0) {
            // ✅ FIX: Use consistent question index
            if (gameState.currentQuestionIndex === undefined) {
              gameState.currentQuestionIndex = 0;
            }
            
            const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
            gameState.currentQuestion = currentQuestion;
            
            console.log(`🎯 Emitting question ${gameState.currentQuestionIndex} to all:`, currentQuestion.question.substring(0, 50));
            
            emitQuestionToAll(roomCode, currentQuestion, topic);
            
            // NEW: Emit player screen updates for question start
            gameState.teams[winnerTeam].forEach(player => {
              emitPlayerScreenUpdate(roomCode, player.id, 'question-started', {
                question: currentQuestion,
                topic: topic
              });
            });
          }
          
          // Save to database
          await Game.findOneAndUpdate(
            { roomCode },
            { topic, questions: gameState.questions, currentRound: gameState.currentRound }
          );
          
        } catch (questionError) {
          console.error('❌ Question generation error:', questionError);
        }
      } else if (choice === 'games' && game) {
        // Emit game to spectators
        emitGameToAll(roomCode, game);
        gameState.currentGame = {
          name: game,
          type: getGameType(game),
          description: getGameDescription(game),
          instructions: getGameInstructions(game)
        };
        
        // NEW: Emit player screen updates for game start
        gameState.teams[winnerTeam].forEach(player => {
          emitPlayerScreenUpdate(roomCode, player.id, 'game-started', {
            game: gameState.currentGame
          });
        });
      }

      safeBroadcast(io, roomCode, 'choice-made', {
        choice,
        topic,
        game,
        winner: gameState.winner,
        teamRoundTypes: gameState.teamRoundTypes,
        playerRoles: gameState.playerRoles, // NEW: Include player roles
        phase: gameState.phase,
        timeLeft: 180
      });

      // Start the round timer - 3 minutes only
      startRoundTimer(roomCode, 180);

      setTimeout(() => {
        gameState.roundStarted = true;
        gameState.phase = choice === 'questions' ? 'question-round' : 'game-round';
        
        safeBroadcast(io, roomCode, 'round-started', {
          choice,
          topic,
          game,
          teamRoundTypes: gameState.teamRoundTypes,
          playerRoles: gameState.playerRoles, // NEW: Include player roles
          timeLeft: 180
        });

        activeGames.set(roomCode, gameState);
        safeBroadcast(io, roomCode, 'game-state-updated', gameState);

      }, 1000);

    } catch (error) {
      console.error('❌ Choice error:', error);
      safeBroadcast(io, roomCode, 'game-error', { 
        message: 'Failed to start game round.' 
      });
    }
  });

  // NEW: Select question handler - UPDATED with question consistency fix
  socket.on('select-question', async (data) => {
    try {
      const { roomCode, topic } = data;
      const gameState = activeGames.get(roomCode);
      if (!gameState) return;

      // ✅ FIX: Store questions in gameState for consistency
      if (!gameState.questions || gameState.questions.length === 0) {
        gameState.questions = await generateQuestions(topic, 50);
      }
      
      if (gameState.questions.length > 0) {
        // ✅ FIX: Use consistent question index
        if (gameState.currentQuestionIndex === undefined) {
          gameState.currentQuestionIndex = 0;
        }
        
        const currentQuestion = gameState.questions[gameState.currentQuestionIndex];
        gameState.currentQuestion = currentQuestion;
        gameState.selectedTopic = topic;

        console.log(`🎯 Emitting question ${gameState.currentQuestionIndex} to all:`, currentQuestion.question.substring(0, 50));

        // Emit to all players and spectators
        emitQuestionToAll(roomCode, currentQuestion, topic);

        // NEW: Emit player screen updates for question start
        Object.keys(gameState.playerRoles).forEach(playerId => {
          if (gameState.playerRoles[playerId] === 'questions') {
            emitPlayerScreenUpdate(roomCode, playerId, 'question-started', {
              question: currentQuestion,
              topic: topic
            });
          }
        });

        safeBroadcast(io, roomCode, 'game-state-updated', gameState);
      }

    } catch (error) {
      console.error('❌ Select question error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to select question' });
    }
  });

  // NEW: Next question handler for progression
  socket.on('next-question', async (data) => {
    try {
      const { roomCode } = data;
      const gameState = activeGames.get(roomCode);
      if (!gameState || !gameState.questions) return;

      // Move to next question
      gameState.currentQuestionIndex = (gameState.currentQuestionIndex || 0) + 1;
      
      if (gameState.currentQuestionIndex < gameState.questions.length) {
        const nextQuestion = gameState.questions[gameState.currentQuestionIndex];
        gameState.currentQuestion = nextQuestion;
        
        // Emit to ALL (players and spectators)
        emitQuestionToAll(roomCode, nextQuestion, gameState.selectedTopic);
        
        console.log(`➡️ Next question emitted to ALL (index ${gameState.currentQuestionIndex}): ${nextQuestion.question.substring(0, 50)}`);
        
        safeBroadcast(io, roomCode, 'game-state-updated', gameState);
      } else {
        console.log('✅ All questions completed for room:', roomCode);
        // Handle end of questions - you might want to end the round or loop back
        gameState.currentQuestionIndex = 0; // Loop back to start
        const firstQuestion = gameState.questions[0];
        gameState.currentQuestion = firstQuestion;
        emitQuestionToAll(roomCode, firstQuestion, gameState.selectedTopic);
      }
    } catch (error) {
      console.error('❌ Next question error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to load next question' });
    }
  });

  // Select game handler - emits to spectators (unchanged)
  socket.on('select-game', async (data) => {
    try {
      const { roomCode, game } = data;
      const gameState = activeGames.get(roomCode);
      if (!gameState) return;

      // Emit to all players and spectators
      emitGameToAll(roomCode, game);

      // Update game state
      gameState.currentGame = {
        name: game,
        type: getGameType(game),
        description: getGameDescription(game),
        instructions: getGameInstructions(game)
      };
      gameState.selectedGame = game;

      // NEW: Emit player screen updates for game start
      Object.keys(gameState.playerRoles).forEach(playerId => {
        if (gameState.playerRoles[playerId] === 'games') {
          emitPlayerScreenUpdate(roomCode, playerId, 'game-started', {
            game: gameState.currentGame
          });
        }
      });

      safeBroadcast(io, roomCode, 'game-state-updated', gameState);

    } catch (error) {
      console.error('❌ Select game error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to select game' });
    }
  });

  // Submit answer handler - emits to spectators
  socket.on('submit-answer', async (data) => {
    try {
      const { roomCode, answerIndex, questionId } = data;
      const gameState = activeGames.get(roomCode);
      if (!gameState) return;

      const user = socket.user;
      if (!user) return;

      const playerId = user._id.toString();

      // Update player answers in game state
      if (!gameState.playerAnswers) {
        gameState.playerAnswers = {};
      }
      gameState.playerAnswers[playerId] = answerIndex;

      // NEW: Emit to spectators watching this player
      emitPlayerScreenUpdate(roomCode, playerId, 'answer-selected', {
        answerIndex,
        questionId,
        playerName: user.name
      });

      // Existing global emission (keep this for other players)
      io.to(roomCode).emit('player-answered', {
        playerId: playerId,
        answerIndex: answerIndex,
        playerName: user.name
      });

      safeBroadcast(io, roomCode, 'game-state-updated', gameState);

      console.log(`📝 Player ${user.name} answered: ${answerIndex} in room ${roomCode}`);

    } catch (error) {
      console.error('❌ Submit answer error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to submit answer' });
    }
  });

  // Game progress handler - emits to spectators
  socket.on('update-game-progress', async (data) => {
    try {
      const { roomCode, progress } = data;
      const gameState = activeGames.get(roomCode);
      if (!gameState) return;

      const user = socket.user;
      if (!user) return;

      const playerId = user._id.toString();

      // Update game progress in game state
      if (!gameState.gameProgress) {
        gameState.gameProgress = {};
      }
      gameState.gameProgress[playerId] = progress;

      // NEW: Emit player screen update for game progress
      emitPlayerScreenUpdate(roomCode, playerId, 'game-progress', {
        progress,
        playerName: user.name
      });

      // Emit to all players and spectators
      emitGameProgress(roomCode, gameState.gameProgress);

      safeBroadcast(io, roomCode, 'game-state-updated', gameState);

    } catch (error) {
      console.error('❌ Update game progress error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to update game progress' });
    }
  });

  // Score submission
  socket.on('submit-score', async (data) => {
    try {
      const { roomCode, score, roundType, userId } = data;
      const gameState = activeGames.get(roomCode);
      
      if (!gameState) {
        safeEmit(socket, 'game-error', { message: 'Game not found' });
        return;
      }

      const player = Object.values(gameState.teams)
        .flat()
        .find(p => p.id === userId);
      
      if (!player) {
        safeEmit(socket, 'game-error', { message: 'Player not found in game' });
        return;
      }

      const playerTeam = player.team;

      // Update scores based on game mode
      if (gameState.mode === 'question-vs-game') {
        gameState.scores[playerTeam] += score;
      }
      
      // Always update individual player score
      if (!gameState.playerScores[userId]) {
        gameState.playerScores[userId] = 0;
      }
      gameState.playerScores[userId] += score;

      // NEW: Emit score update to spectators
      emitPlayerScreenUpdate(roomCode, userId, 'score-updated', {
        score,
        totalScore: gameState.playerScores[userId],
        playerName: player.name
      });

      safeBroadcast(io, roomCode, 'score-updated', {
        team: playerTeam,
        playerId: userId,
        playerName: player.name,
        scoreAdded: score,
        teamScore: gameState.scores[playerTeam],
        playerScores: gameState.playerScores,
        mode: gameState.mode
      });

    } catch (error) {
      console.error('❌ Score submission error:', error);
      safeEmit(socket, 'game-error', { message: error.message });
    }
  });

  // Roll die for question-vs-game mode
  socket.on('roll-die', async ({ roomCode, roll }) => {
    try {
      const gameState = activeGames.get(roomCode);
      if (!gameState || gameState.phase !== 'die-roll') return;

      const user = socket.user;
      if (!user) return;

      const canRoll = gameState.diceRollers.some(player => player.id === user._id.toString());
      if (!canRoll) {
        safeEmit(socket, 'room-error', { message: 'You are not allowed to roll in this phase' });
        return;
      }

      gameState.dieRolls[user._id] = roll;
      
      // NEW: Emit die roll to spectators
      emitPlayerScreenUpdate(roomCode, user._id.toString(), 'die-rolled', {
        roll,
        playerName: user.name
      });

      safeBroadcast(io, roomCode, 'die-rolled', {
        playerId: user._id,
        playerName: user.name,
        roll
      });

      const allRolled = gameState.diceRollers.every(player => gameState.dieRolls[player.id]);

      if (allRolled) {
        let winner = null;
        let highestRoll = 0;

        gameState.diceRollers.forEach(player => {
          const roll = gameState.dieRolls[player.id];
          if (roll > highestRoll) {
            highestRoll = roll;
            winner = player;
          }
        });

        gameState.winner = winner;
        gameState.phase = 'choice';

        // NEW: Emit winner to spectators
        emitPlayerScreenUpdate(roomCode, winner.id, 'die-roll-winner', {
          winner: winner.name,
          highestRoll
        });

        safeBroadcast(io, roomCode, 'die-roll-winner', {
          winner: winner,
          highestRoll
        });

        activeGames.set(roomCode, gameState);
        safeBroadcast(io, roomCode, 'game-state-updated', gameState);
      }

    } catch (error) {
      console.error('Die roll error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to process die roll' });
    }
  });

  // Get questions handler
  socket.on('get-questions', async (data) => {
    try {
      const { topic, count = 50, userId } = data;
      console.log('📚 Requesting questions for topic:', topic, 'user:', userId);

      const gameState = Array.from(activeGames.values()).find(
        game => Object.values(game.teams).flat().some(p => p.id === userId)
      );

      if (!gameState) {
        safeEmit(socket, 'questions-error', { message: 'Game not found' });
        return;
      }

      // Try to get questions from database first
      let game = await Game.findOne({ 
        roomCode: gameState.roomCode,
        topic: topic 
      });

      let questions = [];

      if (game && game.questions && game.questions.length > 0) {
        console.log('✅ Using cached questions from database:', game.questions.length);
        questions = game.questions;
      } else {
        console.log('🔄 Generating new questions for topic:', topic);
        try {
          questions = await generateQuestions(topic, count);
          
          // Save to database for future use
          if (questions.length > 0) {
            await Game.findOneAndUpdate(
              { roomCode: gameState.roomCode },
              { 
                topic: topic,
                questions: questions,
                $addToSet: { usedTopics: topic }
              },
              { upsert: true, new: true }
            );
          }
        } catch (genError) {
          console.error('❌ Question generation failed:', genError);
          safeEmit(socket, 'questions-error', { 
            message: 'Failed to generate questions: ' + genError.message 
          });
          return;
        }
      }

      if (questions.length === 0) {
        safeEmit(socket, 'questions-error', { 
          message: 'No questions available for this topic' 
        });
        return;
      }

      console.log('✅ Sending questions to client:', questions.length);
      safeEmit(socket, 'questions-loaded', { 
        questions: questions,
        topic: topic,
        count: questions.length
      });

    } catch (error) {
      console.error('❌ Get questions error:', error);
      safeEmit(socket, 'questions-error', { 
        message: 'Failed to load questions: ' + error.message 
      });
    }
  });

  // Get current game state
  socket.on('get-game-state', async (roomCode) => {
    try {
      const gameState = activeGames.get(roomCode);
      if (gameState) {
        const cleanGameState = createCleanGameState(gameState);
        safeEmit(socket, 'game-state', cleanGameState);
      } else {
        safeEmit(socket, 'game-error', { message: 'Game not found' });
      }
    } catch (error) {
      console.error('Get game state error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to get game state' });
    }
  });

  socket.on('get-active-games', () => {
    safeEmit(socket, 'active-games-list', Array.from(publicActiveGames.values()));
  });

  socket.on("join-as-viewer", ({ roomCode }) => {
    console.log(`👀 Viewer joined room: ${roomCode}`);
    socket.join(`room-${roomCode}-viewers`);
    
    // NEW: Send current player roles to the new viewer
    const gameState = activeGames.get(roomCode);
    if (gameState) {
      safeEmit(socket, 'player-roles-assigned', {
        playerRoles: gameState.playerRoles,
        timestamp: Date.now()
      });
      
      // ✅ FIX: Send current question to new spectator
      if (gameState.currentQuestion) {
        console.log(`📋 Sending current question to new spectator: ${gameState.currentQuestion.question.substring(0, 50)}...`);
        safeEmit(socket, 'question-selected', {
          question: gameState.currentQuestion,
          topic: gameState.selectedTopic,
          questionIndex: gameState.currentQuestionIndex || 0,
          totalQuestions: gameState.questions?.length || 0
        });
      }
      
      // ✅ FIX: Send current game to new spectator
      if (gameState.currentGame) {
        console.log(`🎮 Sending current game to new spectator: ${gameState.currentGame.name}`);
        safeEmit(socket, 'game-selected', {
          game: gameState.currentGame
        });
      }
    }
    
    io.to(`room-${roomCode}-viewers`).emit("viewer-joined", { id: socket.id });
  });

  // Quit game
  socket.on('quit-game', async (roomCode) => {
    try {
      const room = activeRooms.get(roomCode);
      if (room && room.players.length === 0) {
        activeGames.delete(roomCode);
      }
      safeEmit(socket, 'game-quit', { success: true });
    } catch (error) {
      console.error('Quit game error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to quit game' });
    }
  });

  // Return to room
  socket.on('return-to-room', (roomCode) => {
    const gameState = activeGames.get(roomCode);
    if (!gameState) return;

    activeGames.delete(roomCode);
    safeBroadcast(io, roomCode, 'returned-to-room', { roomCode });
  });

  // Rematch - creates completely new game
  socket.on('rematch', async (roomCode) => {
    try {
      const room = activeRooms.get(roomCode);
      if (!room) {
        safeEmit(socket, 'game-error', { message: 'Room not found' });
        return;
      }

      safeBroadcast(io, roomCode, 'rematching');
      
      // Clear current game state
      activeGames.delete(roomCode);

      // Create new game state for rematch
      const user = socket.user;
      const gameState = createGameStateForMode(room, user);
      
      // Ensure new random selections
      if (room.settings.mode === 'question-vs-question') {
        gameState.selectedTopic = TOPIC_OPTIONS[Math.floor(Math.random() * TOPIC_OPTIONS.length)];
      } else if (room.settings.mode === 'game-vs-game') {
        gameState.selectedGame = GAME_OPTIONS[Math.floor(Math.random() * GAME_OPTIONS.length)];
      }
      
      activeGames.set(roomCode, gameState);

      // NEW: Emit player roles to spectators
      emitPlayerRoles(roomCode, gameState.playerRoles);

      // For new modes, auto-start the new round
      if (room.settings.mode === 'question-vs-question' || room.settings.mode === 'game-vs-game') {
        setTimeout(() => {
          startRoundForNewModes(roomCode, gameState);
        }, 3000);
      }

      safeBroadcast(io, roomCode, 'game-state-updated', gameState);
      safeBroadcast(io, roomCode, 'rematched');

    } catch (error) {
      console.error('Rematch error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to start rematch' });
    }
  });

  // Helper to create game state - UPDATED with player roles
  function createGameStateForMode(room, user) {
    const isQuestionVsQuestion = room.settings.mode === 'question-vs-question';
    const isGameVsGame = room.settings.mode === 'game-vs-game';
    const isQuestionVsGame = room.settings.mode === 'question-vs-game';

    const getRandomTopic = () => TOPIC_OPTIONS[Math.floor(Math.random() * TOPIC_OPTIONS.length)];
    const getRandomGame = () => GAME_OPTIONS[Math.floor(Math.random() * GAME_OPTIONS.length)];

    const createCleanPlayer = (player) => ({
      id: player.id || player._id?.toString() || '',
      name: player.name || '',
      avatar: player.avatar || '👤',
      isOwner: Boolean(player.isOwner),
      team: player.team || null,
      isReady: Boolean(player.isReady)
    });

    let initialPhase, choice, selectedTopic, selectedGame, teams, diceRollers, teamRoundTypes;

    // NEW: Initialize player roles
    let playerRoles = {};

    if (isQuestionVsQuestion) {
      initialPhase = 'random-selection';
      choice = 'questions';
      selectedTopic = getRandomTopic();
      teams = { A: room.players.map(createCleanPlayer), B: [] };
      diceRollers = [];
      teamRoundTypes = null;
      
      // All players answer questions
      room.players.forEach(player => {
        playerRoles[player.id] = 'questions';
      });
    } else if (isGameVsGame) {
      initialPhase = 'random-selection';
      choice = 'games';
      selectedGame = getRandomGame();
      teams = { A: room.players.map(createCleanPlayer), B: [] };
      diceRollers = [];
      teamRoundTypes = null;
      
      // All players play games
      room.players.forEach(player => {
        playerRoles[player.id] = 'games';
      });
    } else {
      initialPhase = 'die-roll';
      choice = null;
      selectedTopic = null;
      selectedGame = null;
      const assignment = assignTeamsAndDiceRollers(room);
      teams = {
        A: assignment.teams.A.map(createCleanPlayer),
        B: assignment.teams.B.map(createCleanPlayer)
      };
      diceRollers = assignment.diceRollers.map(createCleanPlayer);
      teamRoundTypes = null;
      
      // For question-vs-game, roles will be assigned when choice is made
      room.players.forEach(player => {
        playerRoles[player.id] = 'waiting'; // Initial state
      });
    }

    const userTeam = Object.entries(teams).find(([_, players]) =>
      players.some(p => p.id === user._id.toString())
    )?.[0] || null;

    return {
      roomCode: room.code,
      phase: initialPhase,
      dieRolls: {},
      winner: null,
      choice,
      winnerChoice: null,
      selectedTopic,
      selectedGame,
      teams,
      diceRollers,
      teamRoundTypes,
      currentRound: 1, // ✅ Always start at round 1
      scores: { A: 0, B: 0 },
      playerScores: {},
      timeLimit: 180,
      roundTimer: null,
      startedAt: new Date(),
      mode: room.settings.mode,
      teamLeaders: isQuestionVsGame ? {
        A: teams.A.find(p => p.isOwner) || null,
        B: teams.B[0] || null
      } : null,
      userTeam,
      roundStarted: false,
      roundTimeLeft: 180,
      gameEnded: false, // ✅ Track if game has ended
      currentQuestion: null, // NEW: Track current question
      currentGame: null, // NEW: Track current game
      playerAnswers: {}, // NEW: Track player answers
      gameProgress: {}, // NEW: Track game progress
      playerRoles: playerRoles, // NEW: Track what each player is doing
      currentPlayerActions: {}, // NEW: Track real-time player actions
      questions: [], // ✅ NEW: Store questions array for consistency
      currentQuestionIndex: 0 // ✅ NEW: Track current question index
    };
  }

  // Assign teams and dice rollers
  function assignTeamsAndDiceRollers(room) {
    const createCleanPlayer = (player) => ({
      id: player.id || player._id?.toString() || '',
      name: player.name || '',
      avatar: player.avatar || '👤',
      isOwner: Boolean(player.isOwner),
      team: player.team || null,
      isReady: Boolean(player.isReady)
    });

    const cleanPlayers = room.players.map(createCleanPlayer);
    const teams = { A: [], B: [] };
    let diceRollers = [];
    
    if (cleanPlayers.length === 2) {
      teams.A = [cleanPlayers.find(p => p.isOwner)];
      teams.B = [cleanPlayers.find(p => !p.isOwner)];
      diceRollers = [teams.A[0], teams.B[0]];
      teams.A[0].team = 'A';
      teams.B[0].team = 'B';
    } else {
      const owner = cleanPlayers.find(p => p.isOwner);
      teams.A.push(owner);
      owner.team = 'A';
      
      const remainingPlayers = cleanPlayers.filter(p => !p.isOwner);
      const teamBLeader = {...remainingPlayers[Math.floor(Math.random() * remainingPlayers.length)]};
      teams.B.push(teamBLeader);
      teamBLeader.team = 'B';
      
      const otherPlayers = remainingPlayers.filter(p => p.id !== teamBLeader.id);
      otherPlayers.forEach((player, index) => {
        const cleanPlayer = {...player};
        if (index % 2 === 0) {
          teams.A.push(cleanPlayer);
          cleanPlayer.team = 'A';
        } else {
          teams.B.push(cleanPlayer);
          cleanPlayer.team = 'B';
        }
      });
      
      diceRollers = [owner, teamBLeader];
    }
    
    return { teams, diceRollers };
  }

  // ✅ FIXED: Timer that ends the game completely after 3 minutes
  const startRoundTimer = (roomCode, duration) => {
    const gameState = activeGames.get(roomCode);
    if (!gameState) return;

    // Clear any existing timer
    if (gameState.roundTimer) {
      clearInterval(gameState.roundTimer);
    }

    let timeLeft = duration;
    gameState.roundTimeLeft = timeLeft;
    gameState.roundStarted = true;
    
    gameState.roundTimer = setInterval(() => {
      timeLeft--;
      gameState.roundTimeLeft = timeLeft;
      
      safeBroadcast(io, roomCode, 'timer-update', { timeLeft });
      
      // ✅ When time reaches 0, END THE GAME (no next round)
      if (timeLeft <= 0) {
        clearInterval(gameState.roundTimer);
        gameState.roundTimer = null;
        
        // ✅ Mark game as ended and go straight to final results
        gameState.gameEnded = true;
        gameState.roundStarted = false;
        
        // ✅ Emit game-ended event for final results
        safeBroadcast(io, roomCode, 'game-ended', {
          scores: gameState.scores,
          playerScores: gameState.playerScores,
          mode: gameState.mode,
          final: true
        });

        publicActiveGames.delete(roomCode);
        io.emit('active-games-updated', Array.from(publicActiveGames.values()));

        
        console.log(`⏰ Game ended for room: ${roomCode}`);
      }
    }, 1000);
  };

  // NEW: Helper functions for game information
  function getGameType(gameName) {
    const gameTypes = {
      'basketball': 'typing',
      'survivor': 'reaction',
      'dart': 'accuracy',
      'conquest': 'strategy'
    };
    return gameTypes[gameName] || 'skill';
  }

  function getGameDescription(gameName) {
    const descriptions = {
      'basketball': 'Type words quickly to score baskets!',
      'survivor': 'Test your reaction time to survive!',
      'dart': 'Aim carefully and hit the bullseye!',
      'conquest': 'Strategic thinking to conquer territories!'
    };
    return descriptions[gameName] || 'Test your skills in this mini-game!';
  }

  function getGameInstructions(gameName) {
    const instructions = {
      'basketball': 'Type the words as fast as you can to score points. Faster typing = more baskets!',
      'survivor': 'Click when you see the target appear. Faster reactions = higher survival rate!',
      'dart': 'Aim and throw by clicking at the right moment. Precision is key!',
      'conquest': 'Make strategic decisions to capture territories and defeat opponents!'
    };
    return instructions[gameName] || 'Follow the on-screen instructions to play!';
  }

  // Clean game state functions (keep existing)
  function createCleanGameState(gameState) {
    if (!gameState) return null;
    switch (gameState.mode) {
      case 'question-vs-question':
        return createCleanIndividualModeState(gameState);
      case 'game-vs-game':
        return createCleanIndividualModeState(gameState);
      default:
        return createCleanTeamModeState(gameState);
    }
  }

  function createCleanIndividualModeState(gameState) {
    return {
      roomCode: gameState.roomCode,
      phase: gameState.phase,
      dieRolls: {},
      winner: null,
      choice: gameState.choice,
      winnerChoice: gameState.winnerChoice,
      selectedTopic: gameState.selectedTopic,
      selectedGame: gameState.selectedGame,
      teams: { A: safeMapPlayers(gameState.teams?.A || []), B: [] },
      diceRollers: [],
      teamRoundTypes: null,
      currentRound: gameState.currentRound,
      scores: { A: 0, B: 0 },
      playerScores: { ...gameState.playerScores },
      timeLimit: gameState.timeLimit,
      roundTimeLeft: gameState.roundTimeLeft,
      roundStarted: gameState.roundStarted,
      startedAt: gameState.startedAt,
      mode: gameState.mode,
      teamLeaders: null,
      userTeam: gameState.userTeam,
      isIndividualMode: true,
      gameEnded: gameState.gameEnded, // ✅ Include game ended flag
      currentQuestion: gameState.currentQuestion, // NEW: Include current question
      currentGame: gameState.currentGame, // NEW: Include current game
      playerAnswers: gameState.playerAnswers || {}, // NEW: Include player answers
      gameProgress: gameState.gameProgress || {}, // NEW: Include game progress
      playerRoles: gameState.playerRoles || {}, // NEW: Include player roles
      currentPlayerActions: gameState.currentPlayerActions || {}, // NEW: Include player actions
      questions: gameState.questions || [], // ✅ NEW: Include questions array
      currentQuestionIndex: gameState.currentQuestionIndex || 0 // ✅ NEW: Include question index
    };
  }

  function createCleanTeamModeState(gameState) {
    return {
      roomCode: gameState.roomCode,
      phase: gameState.phase,
      dieRolls: { ...gameState.dieRolls },
      winner: safeCreatePlayer(gameState.winner),
      choice: gameState.choice,
      winnerChoice: gameState.winnerChoice,
      selectedTopic: gameState.selectedTopic,
      selectedGame: gameState.selectedGame,
      teams: {
        A: safeMapPlayers(gameState.teams?.A || []),
        B: safeMapPlayers(gameState.teams?.B || [])
      },
      diceRollers: safeMapPlayers(gameState.diceRollers || []),
      teamRoundTypes: gameState.teamRoundTypes ? { ...gameState.teamRoundTypes } : null,
      currentRound: gameState.currentRound,
      scores: { ...gameState.scores },
      playerScores: { ...gameState.playerScores },
      timeLimit: gameState.timeLimit,
      roundTimeLeft: gameState.roundTimeLeft,
      roundStarted: gameState.roundStarted,
      startedAt: gameState.startedAt,
      mode: gameState.mode,
      teamLeaders: {
        A: safeCreatePlayer(gameState.teamLeaders?.A),
        B: safeCreatePlayer(gameState.teamLeaders?.B)
      },
      userTeam: gameState.userTeam,
      isIndividualMode: false,
      gameEnded: gameState.gameEnded, // ✅ Include game ended flag
      currentQuestion: gameState.currentQuestion, // NEW: Include current question
      currentGame: gameState.currentGame, // NEW: Include current game
      playerAnswers: gameState.playerAnswers || {}, // NEW: Include player answers
      gameProgress: gameState.gameProgress || {}, // NEW: Include game progress
      playerRoles: gameState.playerRoles || {}, // NEW: Include player roles
      currentPlayerActions: gameState.currentPlayerActions || {}, // NEW: Include player actions
      questions: gameState.questions || [], // ✅ NEW: Include questions array
      currentQuestionIndex: gameState.currentQuestionIndex || 0 // ✅ NEW: Include question index
    };
  }

  function safeCreatePlayer(player) {
    if (!player || typeof player !== 'object') return null;
    return {
      id: player.id || player._id?.toString() || '',
      name: player.name || '',
      team: player.team || '',
      isOwner: Boolean(player.isOwner)
    };
  }

  function safeMapPlayers(playersArray) {
    if (!Array.isArray(playersArray)) return [];
    return playersArray.map(player => ({
      id: player.id || player._id?.toString() || '',
      name: player.name || '',
      team: player.team || '',
      isOwner: Boolean(player.isOwner),
      avatar: player.avatar || '👤'
    }));
  }

  return { activeGames };
}