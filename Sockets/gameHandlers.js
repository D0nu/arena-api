import { Game } from '../Models/Game.js';
import generateQuestions from '../utils/questionGenerator.js';
import { User } from '../Models/User.js';
import { StoreWallet } from '../Models/StoreWallet.js'; 
import { transferSolWithRetry } from '../utils/solanaUtils.js';

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


const cleanupGameAndResetRoom = async (roomCode) => {
  try {
    console.log(`🔄 Cleaning up game and resetting room: ${roomCode}`);
    
   
    activeGames.delete(roomCode);
    publicActiveGames.delete(roomCode);

    try {
      const result = await Game.deleteOne({ roomCode: roomCode });
      console.log(`🗑️ Removed ${result.deletedCount} game document(s) for room: ${roomCode}`);
    } catch (dbError) {
      console.error('❌ Database cleanup error:', dbError);
      // Continue anyway - might be no game document
    }
    
    // Get the room and reset its status
    const room = activeRooms.get(roomCode);
    if (room) {
      // Reset room to waiting state
      room.status = 'waiting';
      
      // Reset all players' ready status
      room.players.forEach(player => {
        player.isReady = false;
      });
      
      console.log(`✅ Room ${roomCode} reset to waiting state`);
      
      // Notify all players about room reset
      safeBroadcast(io, roomCode, 'room-updated', room);
      safeBroadcast(io, roomCode, 'game-ended-cleanup', {
        message: 'Game ended and room reset',
        room: room
      });
    }
    
    // Notify all clients about active games update
    io.emit('active-games-updated', Array.from(publicActiveGames.values()));
    
  } catch (error) {
    console.error('❌ Game cleanup error:', error);
  }
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

      if (room.status !== 'waiting' && room.status !== 'ready-to-start') {
        safeEmit(socket, 'room-error', { 
          message: 'Room is not ready to start a new game. Please wait for current game to end.' 
        });
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

      try {
        await Game.deleteOne({ roomCode: roomCode });
        console.log(`🧹 Cleaned up previous game document for room: ${roomCode}`);
      } catch (dbError) {
        console.error('❌ Error cleaning up previous game:', dbError);
        // Continue anyway - might be no previous game
      }

      
      const wager = room.settings.wager || 0;
           
        if (wager > 0) {
          try {
            console.log(`💰 Starting wager deduction for room ${roomCode}: ${wager} coins per player`);

            const session = await User.startSession();
            session.startTransaction();
            
            const deductionResults = [];
            
            for (const player of room.players) {
              console.log(`🔍 Processing wager deduction for ${player.name} (${player.id})`);

              const user = await User.findById(player.id).session(session);
              if (!user) {
                throw new Error(`User ${player.id} not found`);
              }
              
              if (user.coinBalance < wager) { // ✅ Use coinBalance
                throw new Error(`Insufficient balance for ${user.name}. Needs ${wager} but has ${user.coinBalance}`);
              }
              
              user.coinBalance -= wager; // ✅ Deduct from coinBalance
              await user.save({ session });
              deductionResults.push({ 
                userId: player.id, 
                name: player.name, 
                success: true,
                oldBalance: user.coinBalance + wager,
                newBalance: user.coinBalance 
              });
              
              console.log(`💰 Deducted ${wager} from ${user.name}, new balance: ${user.coinBalance}`);
              
              // ✅ Emit to EACH player individually
              io.to(player.socketId).emit('user-balance-updated', {
                userId: player.id,
                amountChange: -wager,
                newBalance: user.coinBalance, // ✅ Send coinBalance
                type: 'wager_deduction',
                wagerAmount: wager,
                gameRoom: roomCode
              });
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
            return; 
          }
        }

     
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

      safeBroadcast(io, roomCode, 'game-state-updated',createCleanGameState(gameState));

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

    safeBroadcast(io, roomCode, 'game-state-updated', createCleanGameState(gameState));
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

      safeBroadcast(io, roomCode, 'game-state-updated',createCleanGameState(gameState));

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
        safeBroadcast(io, roomCode, 'game-state-updated', createCleanGameState(gameState));

      }, 1000);

    } catch (error) {
      console.error('❌ Choice error:', error);
      safeBroadcast(io, roomCode, 'game-error', { 
        message: 'Failed to start game round.' 
      });
    }
  });

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

        safeBroadcast(io, roomCode, 'game-state-updated', createCleanGameState(gameState));
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
        
        safeBroadcast(io, roomCode, 'game-state-updated', createCleanGameState(gameState));
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

      
      emitGameToAll(roomCode, game);

      gameState.currentGame = {
        name: game,
        type: getGameType(game),
        description: getGameDescription(game),
        instructions: getGameInstructions(game)
      };
      gameState.selectedGame = game;

      
      Object.keys(gameState.playerRoles).forEach(playerId => {
        if (gameState.playerRoles[playerId] === 'games') {
          emitPlayerScreenUpdate(roomCode, playerId, 'game-started', {
            game: gameState.currentGame
          });
        }
      });

      safeBroadcast(io, roomCode, 'game-state-updated', createCleanGameState(gameState));

    } catch (error) {
      console.error('❌ Select game error:', error);
      safeEmit(socket, 'game-error', { message: 'Failed to select game' });
    }
  });

    socket.on('player-action', (actionData) => {
    const { roomCode, playerId, playerName, action, data, timestamp } = actionData;
    
    console.log(`📡 Broadcasting player action: ${playerName} - ${action}`);
    
    
    io.to(`room-${roomCode}-viewers`).emit('player-screen-update', {
      playerId,
      playerName,
      action,
      data,
      timestamp: timestamp || Date.now()
    });
    

    socket.to(roomCode).emit('player-screen-update', {
      playerId,
      playerName,
      action,
      data,
      timestamp: timestamp || Date.now()
    });
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

      safeBroadcast(io, roomCode, 'game-state-updated', createCleanGameState(gameState));

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

      safeBroadcast(io, roomCode, 'game-state-updated',createCleanGameState(gameState));

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
        safeBroadcast(io, roomCode, 'game-state-updated', createCleanGameState(gameState));
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

  // Add this function before the quit-game handler
async function removePlayerFromRoom(roomCode, playerId) {
  const room = activeRooms.get(roomCode);
  if (!room) return;

  const player = room.players.find(p => p.id === playerId);
  if (!player) return;

  // Remove player from room
  room.players = room.players.filter(p => p.id !== playerId);
  
  // Notify remaining players
  safeBroadcast(io, roomCode, 'room-updated', room);
  safeBroadcast(io, roomCode, 'game-alert', {
    type: 'player_left',
    message: `${player.name} left the room`
  });

  // Navigate quitting player back to room
  io.to(player.socketId).emit('navigate-to-room', { roomCode });
}
  
socket.on('quit-game', async (roomCode) => {
  try {
    console.log(`🎮 Player quitting game from room: ${roomCode}`);
    
    const user = socket.user;
    if (!user) return;

    const room = activeRooms.get(roomCode);
    const gameState = activeGames.get(roomCode);
    
    if (!room || !gameState) {
      console.log('❌ Room or game state not found for quit-game');
      return;
    }

    const quittingPlayerId = user._id.toString();
    const quittingPlayer = room.players.find(p => p.id === quittingPlayerId);
    
    if (!quittingPlayer) {
      console.log('❌ Quitting player not found in room');
      return;
    }

    console.log(`👤 Player ${quittingPlayer.name} quitting game from room ${roomCode}`);

    // ✅ Check if game has already ended
    if (gameState.gameEnded) {
      console.log('ℹ️ Game already ended, just removing player');
      await removePlayerFromRoom(roomCode, quittingPlayerId);
      return;
    }

    // ✅ Store quitting player's current score
    const quittingPlayerScore = gameState.playerScores?.[quittingPlayerId] || 0;
    
    // Mark player as quit in game state
    if (!gameState.quitPlayers) {
      gameState.quitPlayers = {};
    }
    gameState.quitPlayers[quittingPlayerId] = {
      playerId: quittingPlayerId,
      playerName: quittingPlayer.name,
      finalScore: quittingPlayerScore,
      team: quittingPlayer.team,
      quitTime: new Date()
    };

    // Remove player from active participation
    if (gameState.playerRoles) {
      gameState.playerRoles[quittingPlayerId] = 'quit';
    }

    // ✅ Get active players AFTER marking the quitter
    const activePlayers = room.players.filter(player => 
      !gameState.quitPlayers?.[player.id]
    );

    console.log(`📈 Remaining active players: ${activePlayers.length}/${room.players.length}`);

   
    const quitReason = getQuitReason(room.players.length, activePlayers.length, gameState.mode);
    console.log(`🎯 Quit reason: ${quitReason}`);

    // Handle 1v1 OR when only 2 players remain
    if (room.players.length === 2 || (activePlayers.length === 2 && !gameState.mode.includes('vs'))) {
      console.log('🎯 1v1 quit scenario detected - ending game');
      await handle1v1GameEnd(roomCode, gameState, quittingPlayerId);
      
    } else if (shouldEndGameDueToTeamElimination(gameState, room, activePlayers)) {
      console.log('🏈 Team elimination scenario detected');
      await handleTeamEliminationEnd(roomCode, gameState, activePlayers);
      
    } else if (activePlayers.length === 1) {
      console.log('👑 Last player standing scenario detected');
      await handleLastPlayerStanding(roomCode, gameState, activePlayers[0]);
      
    } else if (activePlayers.length === 0) {
      console.log('🚫 All players quit scenario detected');
      await handleAllPlayersQuit(roomCode, gameState);
      
    } else {
      console.log('🔄 Game continues scenario detected');
      await handleGameContinues(roomCode, gameState, quittingPlayerId);
    }

    // ✅ Update game state and notify players
    safeBroadcast(io, roomCode, 'game-state-updated', createCleanGameState(gameState));
    
    // ✅ Send detailed quit notification with reason
    safeBroadcast(io, roomCode, 'player-quit-game', {
      playerId: quittingPlayerId,
      playerName: quittingPlayer.name,
      finalScore: quittingPlayerScore,
      remainingPlayers: activePlayers.length,
      totalPlayers: room.players.length,
      gameEnded: gameState.gameEnded || false,
      reason: quitReason
    });

    console.log(`✅ Quit game processed for ${quittingPlayer.name}, reason: ${quitReason}`);

  } catch (error) {
    console.error('❌ Quit game error:', error);
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

  // Add handler for when players return to room after game
  socket.on('return-to-room-after-game', (roomCode) => {
    try {
      console.log(`🔄 Player returning to room after game: ${roomCode}`);
      
      const room = activeRooms.get(roomCode);
      if (room && room.status === 'starting') {
        // Ensure room is reset to waiting
        room.status = 'waiting';
        
        safeBroadcast(io, roomCode, 'room-updated', room);
      }
      
    } catch (error) {
      console.error('Return to room error:', error);
    }
  });

    socket.on('return-to-room-after-quit', (roomCode) => {
      try {
        console.log(`🔄 Player returning to room after quit game: ${roomCode}`);
        
        const room = activeRooms.get(roomCode);
        if (room) {
          // Ensure room is properly reset
          room.status = 'waiting';
          
          // Reset all players' ready status
          room.players.forEach(player => {
            player.isReady = false;
          });
          
          safeBroadcast(io, roomCode, 'room-updated', room);
          console.log(`✅ Room ${roomCode} reset after quit return`);
        }
        
      } catch (error) {
        console.error('Return to room after quit error:', error);
      }
    });



 
socket.on('rematch', async (roomCode) => {
  try {
    const room = activeRooms.get(roomCode);
    if (!room) {
      safeEmit(socket, 'game-error', { message: 'Room not found' });
      return;
    }

    const wager = room.settings.wager || 0;
    
    // ✅ DEDUCT WAGERS FOR REMATCH (same logic as game start)
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
          
          console.log(`💰 Rematch: Deducted ${wager} from ${user.name}, new balance: ${user.coinBalance}`);
        }
        
        await session.commitTransaction();
        session.endSession();
        
        console.log('✅ All rematch wagers deducted successfully:', deductionResults);
        
      } catch (deductionError) {
        await session.abortTransaction();
        session.endSession();
        
        console.error('❌ Rematch wager deduction failed:', deductionError);
        safeEmit(socket, 'room-error', { 
          message: `Failed to deduct wagers for rematch: ${deductionError.message}` 
        });
        return; // ⚠️ STOP rematch if deduction fails
      }
    }

    // Clean up existing game first
    await cleanupGameAndResetRoom(roomCode);
    
    safeBroadcast(io, roomCode, 'rematching');
    
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

    // ✅ Notify players about rematch with wager info
    safeBroadcast(io, roomCode, 'game-state-updated',createCleanGameState (gameState));
    safeBroadcast(io, roomCode, 'rematched', {
      wagerDeducted: wager,
      message: wager > 0 ? `${wager} coins deducted from each player for rematch` : 'Free rematch started'
    });

    console.log(`🔄 Rematch started for room: ${roomCode}, Wager: ${wager}`);

  } catch (error) {
    console.error('Rematch error:', error);
    safeEmit(socket, 'game-error', { message: 'Failed to start rematch' });
  }
});

  // Add this to your gameHandlers for debugging
  socket.on('debug-game-state', (roomCode) => {
    const gameState = activeGames.get(roomCode);
    const room = activeRooms.get(roomCode);
    const publicGame = publicActiveGames.get(roomCode);
    
    console.log('🔍 DEBUG GAME STATE:', {
      roomCode,
      activeGameExists: !!gameState,
      roomExists: !!room,
      roomStatus: room?.status,
      publicGameExists: !!publicGame,
      activeGamesCount: activeGames.size,
      publicActiveGamesCount: publicActiveGames.size
    });
    
    safeEmit(socket, 'debug-game-state-response', {
      activeGameExists: !!gameState,
      roomExists: !!room,
      roomStatus: room?.status,
      publicGameExists: !!publicGame
    });
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
      
      gameState.roundTimer = setInterval(async () => { 
        timeLeft--;
        gameState.roundTimeLeft = timeLeft;
        
        safeBroadcast(io, roomCode, 'timer-update', { timeLeft });
        
        if (timeLeft <= 0) {
          clearInterval(gameState.roundTimer);
          gameState.roundTimer = null;
          
          // ✅ Mark game as ended
          gameState.gameEnded = true;
          gameState.roundStarted = false;

          const room = activeRooms.get(roomCode); 
          if (!room) return;

          gameState.scores = calculateFinalScores(gameState, room);
          const winners = determineWinners(gameState, room);

          if (winners.length > 1 || gameState.scores.A === gameState.scores.B) {
            console.log(`🤝 Game ended in a draw for room: ${roomCode}`);
            await handleGameDraw(roomCode, gameState);
          } else {
            // ✅ NORMAL GAME END - Show results first, then cleanup later
            const winner = winners[0];
            
            console.log(`🏆 Normal game end - Winner: ${winner.name}`);
            
            const hasWager = room.settings.wager > 0;
            const winnings = hasWager ? Math.floor(room.settings.wager * room.players.length * 0.9) : 0;

            // ✅ BROADCAST FINAL RESULTS TO ALL PLAYERS WITH PROPER MESSAGES
            safeBroadcast(io, roomCode, 'game-ended', {
              scores: gameState.scores,
              playerScores: gameState.playerScores,
              mode: gameState.mode,
              final: true,
              winners: winners,
              isDraw: false,
              hasWager: hasWager,
              wagerAmount: room.settings.wager || 0,
              winnings: winnings,
              showResults: true,
              autoReturnDelay: 8000,
              message: hasWager 
                ? `You won ${winnings} coins! 🎉` 
                : 'You won the game! 🎉',
              leaderboard: {
                wagerOutcomes: Object.fromEntries(
                  room.players.map(player => [
                    player.id,
                    {
                      amount: room.settings.wager || 0,
                      type: winners.find(w => w.id === player.id) ? 'win' : 'loss',
                      message: winners.find(w => w.id === player.id) ? 
                        'Winner!' : 'Better luck next time!'
                    }
                  ])
                )
              }
            });

            // ✅ DISTRIBUTE WINNINGS IMMEDIATELY
            if (hasWager) {
              await distributeWinnings(roomCode, winners);
            }

            // ✅ DELAY CLEANUP TO ALLOW PLAYERS TO SEE RESULTS
            setTimeout(async () => {
              // Reset room status but don't cleanup game state yet
              room.status = 'waiting';
              room.players.forEach(player => {
                player.isReady = false;
              });
              
              safeBroadcast(io, roomCode, 'room-updated', room);
              safeBroadcast(io, roomCode, 'return-to-room', { 
                roomCode,
                message: 'Returning to room...'
              });
              
              console.log(`✅ Game results shown, returning players to room: ${roomCode}`);
              
              // Clean up game state after players have returned to room
              setTimeout(async () => {
                await cleanupGameAndResetRoom(roomCode);
              }, 2000);
              
            }, 8000); // ✅ 8 second delay to show results
          }
          
          console.log(`⏰ Game ended for room: ${roomCode}`);
        }
      }, 1000);
    };


    async function handle1v1GameEnd(roomCode, gameState, quittingPlayerId) {
      console.log(`🎯 1v1 game ending due to player quit`);
      
      const room = activeRooms.get(roomCode);
      if (!room) {
        console.error('❌ Room not found for 1v1 game end');
        return;
      }

      const quittingPlayer = room.players.find(p => p.id === quittingPlayerId);
      const remainingPlayer = room.players.find(p => p.id !== quittingPlayerId);
      
      if (remainingPlayer && quittingPlayer) {
        gameState.gameEnded = true;
        gameState.roundStarted = false;
        
        // Stop any running timers
        if (gameState.roundTimer) {
          clearInterval(gameState.roundTimer);
          gameState.roundTimer = null;
        }
        
        // ✅ FIX: Calculate final scores properly
        gameState.scores = calculateFinalScores(gameState, room);
        
        // ✅ FIX: In 1v1 quit, remaining player automatically wins regardless of scores
        const winners = [remainingPlayer];
        const isDraw = false; // Quitting means no draw
        
        console.log(`🏆 1v1 Winner: ${remainingPlayer.name} (opponent quit)`);
        
        const hasWager = room && room.settings && room.settings.wager > 0;

        // ✅ DISTRIBUTE WINNINGS FIRST
        if (hasWager) {
          console.log(`💰 1v1 Wager distribution: Winner gets both wagers`);
          await distributeWinnings(roomCode, winners, false);
        }

        
        const winnerMessage = hasWager 
          ? `${quittingPlayer.name} forfeited. You win ${room.settings.wager * 2} coins! 🎉` 
          : `${quittingPlayer.name} forfeited. You win! 🎉`;
        
        const quitterMessage = hasWager 
          ? `You forfeited the match. You lost ${room.settings.wager} coins! 💸`
          : `You forfeited the match. You lose!`;

      
        io.to(remainingPlayer.socketId).emit('opponent-quit', {
          scores: gameState.scores,
          playerScores: gameState.playerScores,
          mode: gameState.mode,
          final: true,
          winner: remainingPlayer,
          winners: winners,
          quittingPlayer: quittingPlayer,
          reason: 'opponent_quit',
          hasWager: hasWager,
          wagerAmount: hasWager ? room.settings.wager : 0,
          winnings: hasWager ? room.settings.wager * 2 : 0, 
          showResults: true,
          autoReturnDelay: 8000,
          messages: {
            winner: winnerMessage,
            quitter: quitterMessage
          }
        });

        // Notify the QUITTER
        io.to(quittingPlayer.socketId).emit('opponent-quit', {
          scores: gameState.scores,
          playerScores: gameState.playerScores,
          mode: gameState.mode,
          final: true,
          winner: remainingPlayer,
          winners: winners,
          quittingPlayer: quittingPlayer,
          reason: 'you_quit',
          hasWager: hasWager,
          wagerAmount: hasWager ? room.settings.wager : 0,
          showResults: true,
          autoReturnDelay: 8000,
          messages: {
            winner: winnerMessage,
            quitter: quitterMessage
          }
        });

        // ✅ DELAY ROOM RESET TO SHOW RESULTS
        setTimeout(async () => {
          room.status = 'waiting';
          room.players.forEach(player => {
            player.isReady = false;
          });
          
          safeBroadcast(io, roomCode, 'room-updated', room);
          safeBroadcast(io, roomCode, 'return-to-room', { 
            roomCode,
            message: 'Returning to room...'
          });
          
          console.log(`✅ 1v1 game results shown, returning players to room: ${roomCode}`);
          
          setTimeout(async () => {
            await cleanupGameAndResetRoom(roomCode);
          }, 2000);
        }, 8000);
      }
    }

async function handleGameDraw(roomCode, gameState) {
  const room = activeRooms.get(roomCode);
  if (!room) return;

  gameState.gameEnded = true;
  gameState.isDraw = true;
  gameState.roundStarted = false;

  // Stop any running timers
  if (gameState.roundTimer) {
    clearInterval(gameState.roundTimer);
    gameState.roundTimer = null;
  }

  const hasWager = room?.settings?.wager > 0;

  if (hasWager) {
    console.log(`💰 Draw Wager distribution: Both players get refund minus house fee`);
    await distributeWinnings(roomCode, room.players, true);
  }

  // ✅ BROADCAST DRAW WITH RESULTS
  safeBroadcast(io, roomCode, 'game-ended', {
    scores: gameState.scores,
    playerScores: gameState.playerScores,
    mode: gameState.mode,
    final: true,
    winners: [],
    isDraw: true,
    reason: 'draw',
    hasWager: hasWager,
    wagerAmount: hasWager ? room.settings.wager : 0,
    showResults: true, // ✅ NEW: Show results screen
    autoReturnDelay: 8000, // ✅ NEW: Return after 8 seconds
    message: 'Game ended in a draw!'
  });

  // ✅ DELAY ROOM RESET TO SHOW RESULTS
  setTimeout(async () => {
    // Reset room status
    room.status = 'waiting';
    room.players.forEach(player => {
      player.isReady = false;
    });

    safeBroadcast(io, roomCode, 'room-updated', room);
    safeBroadcast(io, roomCode, 'return-to-room', { 
      roomCode,
      message: 'Returning to room...'
    });
    
    console.log(`✅ Draw results shown, returning players to room: ${roomCode}`);
    
    // Clean up after players have returned
    setTimeout(async () => {
      await cleanupGameAndResetRoom(roomCode);
    }, 2000);
    
  }, 8000); // ✅ 8 second delay
}


async function handleLastPlayerStanding(roomCode, gameState, lastPlayer) {
  console.log(`👑 Last player standing: ${lastPlayer.name}`);
  
  const room = activeRooms.get(roomCode);
  if (!room) return;

  gameState.gameEnded = true;
  gameState.roundStarted = false;
  
  // Stop any running timers
  if (gameState.roundTimer) {
    clearInterval(gameState.roundTimer);
    gameState.roundTimer = null;
  }

  // Calculate final scores including quitting players
  gameState.scores = calculateFinalScores(gameState, room);
  
  console.log(`🏆 Last player winner: ${lastPlayer.name}`);

  const hasWager = room && room.settings && room.settings.wager > 0;
  
  // Emit game ended with final results and leaderboard
  safeBroadcast(io, roomCode, 'game-ended', {
    scores: gameState.scores,
    playerScores: gameState.playerScores,
    mode: gameState.mode,
    final: true,
    winner: lastPlayer,
    winners: [lastPlayer],
    reason: 'last_player_standing',
    hasWager: hasWager,
    wagerAmount: hasWager ? room.settings.wager : 0,
    message: `${lastPlayer.name} wins! All other players have quit.`,
    leaderboard: {
      wagerOutcomes: Object.fromEntries(
        room.players.map(player => [
          player.id,
          {
            amount: hasWager ? room.settings.wager : 0,
            type: player.id === lastPlayer.id ? 'win' : 'loss',
            message: player.id === lastPlayer.id ? 
              'Winner! Last player standing!' : 'Better luck next time!'
          }
        ])
      )
    }
  });

  if (hasWager) {
    await distributeWinnings(roomCode, [lastPlayer]);
  }

  // Reset room status
  room.status = 'waiting';
  room.players.forEach(player => {
    player.isReady = false;
  });

  // Notify all players about room reset
  safeBroadcast(io, roomCode, 'room-updated', room);
  
  setTimeout(async () => {
    await cleanupGameAndResetRoom(roomCode);
  }, 5000);
}

      async function handleAllPlayersQuit(roomCode, gameState) {
    console.log(`🚫 All players quit the game`);
    
    const room = activeRooms.get(roomCode);
    
    // Calculate final scores based on quitting players' scores
    gameState.scores = calculateFinalScores(gameState, room);
    gameState.gameEnded = true;
    
    // Emit game ended with final standings and leaderboard
    safeBroadcast(io, roomCode, 'game-ended', {
      scores: gameState.scores,
      playerScores: gameState.playerScores,
      mode: gameState.mode,
      final: true,
      winner: null,
      reason: 'all_players_quit',
      leaderboard: {
        wagerOutcomes: Object.fromEntries(
          room.players.map(player => [
            player.id,
            {
              amount: room.settings.wager || 0,
              type: 'cancelled',
              message: 'Game cancelled - All players quit'
            }
          ])
        )
      }
    });

    // No wager distribution since all players quit
    
    // Clean up immediately
    await cleanupGameAndResetRoom(roomCode);
  }

    


async function handleGameContinues(roomCode, gameState, quittingPlayerId) {
  console.log(`🔄 Game continues without player ${quittingPlayerId}`);
  
  const room = activeRooms.get(roomCode);
  if (!room) return;

  const quittingPlayer = room.players.find(p => p.id === quittingPlayerId);
  if (!quittingPlayer) return;

  // Get current active players count
  const activePlayers = room.players.filter(player => 
    !gameState.quitPlayers?.[player.id]
  );
  const remainingPlayersCount = activePlayers.length;

  console.log(`📊 Game continues with ${remainingPlayersCount} players`);

  // ✅ ACTUAL GAME CONTINUATION LOGIC:

  // 1. Update game state for remaining players
  if (gameState.teams) {
    // Remove quitting player from their team
    Object.keys(gameState.teams).forEach(team => {
      gameState.teams[team] = gameState.teams[team].filter(player => 
        player.id !== quittingPlayerId
      );
    });
    
    console.log(`🔄 Updated teams after player quit:`, {
      teamA: gameState.teams.A.length,
      teamB: gameState.teams.B.length
    });
  }

  // 2. Update player roles if needed
  if (gameState.playerRoles) {
    delete gameState.playerRoles[quittingPlayerId];
    console.log(`🎭 Removed ${quittingPlayer.name} from player roles`);
  }

  // 3. Handle specific game mode adjustments
  if (gameState.mode === 'question-vs-game') {
    // If a dice roller quit, replace them
    if (gameState.diceRollers) {
      const quittingDiceRoller = gameState.diceRollers.find(dr => dr.id === quittingPlayerId);
      if (quittingDiceRoller) {
        // Replace with another player from the same team
        const team = quittingDiceRoller.team;
        const replacementPlayer = gameState.teams[team]?.find(p => p.id !== quittingPlayerId);
        if (replacementPlayer) {
          gameState.diceRollers = gameState.diceRollers.map(dr => 
            dr.id === quittingPlayerId ? replacementPlayer : dr
          );
          console.log(`🎲 Replaced dice roller ${quittingPlayer.name} with ${replacementPlayer.name}`);
        }
      }
    }
  }

  // 4. Determine the appropriate message based on game mode
  let message = `${quittingPlayer.name} quit the game.`;
  let detailedMessage = '';
  
  if (gameState.mode.includes('vs')) {
    message += ` Game continues with ${remainingPlayersCount} players.`;
    detailedMessage = `${quittingPlayer.name} from Team ${quittingPlayer.team} has quit. Game continues with ${remainingPlayersCount} players.`;
  } else {
    message += ` ${remainingPlayersCount} players remaining.`;
    detailedMessage = `${quittingPlayer.name} has quit. ${remainingPlayersCount} players remaining in the game.`;
  }

  // 5. Emit player quit notification
  safeBroadcast(io, roomCode, 'player-quit-continue', {
    playerId: quittingPlayer.id,
    playerName: quittingPlayer.name,
    playerTeam: quittingPlayer.team,
    finalScore: gameState.playerScores?.[quittingPlayer.id] || 0,
    remainingPlayers: remainingPlayersCount,
    totalPlayers: room.players.length,
    message: message,
    detailedMessage: detailedMessage,
    gameMode: gameState.mode,
    updatedTeams: gameState.teams
  });

  // 6. Send a general game alert
  safeBroadcast(io, roomCode, 'game-alert', {
    type: 'player_quit_continue',
    message: message,
    detailedMessage: detailedMessage,
    severity: 'info',
    quittingPlayer: {
      id: quittingPlayer.id,
      name: quittingPlayer.name,
      team: quittingPlayer.team
    },
    remainingPlayers: remainingPlayersCount
  });

  // 7. Update game state for all clients
  safeBroadcast(io, roomCode, 'game-state-updated',createCleanGameState(gameState));

  // 8. Send specific update to spectators
  io.to(`room-${roomCode}-viewers`).emit('spectator-update', {
    type: 'player_quit_continue',
    quittingPlayer: quittingPlayer.name,
    remainingPlayers: remainingPlayersCount,
    updatedTeams: gameState.teams,
    timestamp: new Date()
  });

  console.log(`✅ Game continues in room ${roomCode} with ${remainingPlayersCount} players`);
}

async function handleTeamEliminationEnd(roomCode, gameState, activePlayers) {
  const room = activeRooms.get(roomCode);
  if (!room) return;

  // Determine winning team (the only team with active players)
  const winningTeam = activePlayers[0]?.team;
  const winningTeamPlayers = room.players.filter(player => 
    player.team === winningTeam && !gameState.quitPlayers?.[player.id]
  );

  gameState.gameEnded = true;
  gameState.roundStarted = false;
  
  // Stop any running timers
  if (gameState.roundTimer) {
    clearInterval(gameState.roundTimer);
    gameState.roundTimer = null;
  }

  // Calculate final scores
  gameState.scores = calculateFinalScores(gameState, room);
  
  console.log(`🏆 Team ${winningTeam} wins by elimination! Winners: ${winningTeamPlayers.map(p => p.name).join(', ')}`);

  const hasWager = room && room.settings && room.settings.wager > 0;

  // Broadcast game ended with leaderboard data
  safeBroadcast(io, roomCode, 'game-ended', {
    scores: gameState.scores,
    playerScores: gameState.playerScores,
    mode: gameState.mode,
    final: true,
    winners: winningTeamPlayers,
    winningTeam: winningTeam,
    isDraw: false,
    reason: 'team_elimination',
    hasWager: hasWager,
    wagerAmount: hasWager ? room.settings.wager : 0,
    message: `Team ${winningTeam} wins! All opponents have quit.`,
    leaderboard: {
      wagerOutcomes: Object.fromEntries(
        room.players.map(player => [
          player.id,
          {
            amount: room.settings.wager || 0,
            type: winningTeamPlayers.find(w => w.id === player.id) ? 'win' : 'loss',
            message: winningTeamPlayers.find(w => w.id === player.id) ? 
              'Winner!' : 'Better luck next time!'
          }
        ])
      )
    }
  });

  // Distribute winnings if there's a wager
  if (hasWager) {
    await distributeWinnings(roomCode, winningTeamPlayers);
  }

  // Reset room status
  room.status = 'waiting';
  room.players.forEach(player => {
    player.isReady = false;
  });

  // Notify all players about room reset
  safeBroadcast(io, roomCode, 'room-updated', room);

  // Clean up after delay
  setTimeout(async () => {
    await cleanupGameAndResetRoom(roomCode);
  }, 5000);
}



function getQuitReason(totalPlayers, activePlayers, gameMode) {
  if (totalPlayers === 2) {
    return 'opponent_quit';
  } else if (activePlayers === 1) {
    return 'last_player_standing';
  } else if (activePlayers === 0) {
    return 'all_players_quit';
  } else if (gameMode.includes('vs')) {
    return 'player_quit_team_game';
  } else {
    return 'player_quit_ffa';
  }
}

function shouldEndGameDueToTeamElimination(gameState, room, activePlayers) {
  // Only check for team-based games
  if (!gameState.teams || !gameState.mode.includes('vs')) {
    return false;
  }

  const activeTeams = new Set();
  
  // Count active players per team
  activePlayers.forEach(player => {
    if (player.team) {
      activeTeams.add(player.team);
    }
  });

  console.log(`🏈 Team check: ${activeTeams.size} active teams out of ${Object.keys(gameState.teams).length} total teams`);

  // If only one team has active players remaining, game should end
  return activeTeams.size === 1;
}
    // Helper function to determine winners (handles draws)
function determineWinners(gameState, room) {
  console.log('🎯 Determining winners for mode:', gameState.mode, {
    scores: gameState.scores,
    playerScores: gameState.playerScores,
    players: room.players.map(p => ({ id: p.id, name: p.name, team: p.team }))
  });

  const winners = [];
  const playerScores = gameState.playerScores || {};
  
  if (gameState.mode === 'question-vs-game' || gameState.mode === 'question-vs-question' || gameState.mode === 'game-vs-game') {
    // Team-based games
    if (gameState.scores.A > gameState.scores.B) {
      // Team A wins
      winners.push(...room.players.filter(p => p.team === 'A'));
      console.log('🏆 Team A wins:', winners.map(w => w.name));
    } else if (gameState.scores.B > gameState.scores.A) {
      // Team B wins
      winners.push(...room.players.filter(p => p.team === 'B'));
      console.log('🏆 Team B wins:', winners.map(w => w.name));
    } else {
      winners.push(...room.players);
      console.log(`🤝 Team game ended in a draw for room: ${gameState.roomCode}`);
    }
  } else {
    // Individual games (questions-only or games-only)
    // Get all scores and sort players by score
    const playersByScore = room.players
      .map(player => ({
        player,
        score: playerScores[player.id] || 0
      }))
      .sort((a, b) => b.score - a.score); // Sort by score descending

    console.log('📊 Players sorted by score:', 
      playersByScore.map(p => `${p.player.name}: ${p.score}`));

    if (playersByScore.length > 0) {
      const highestScore = playersByScore[0].score;
      
      // Find all players who match the highest score
      const highScorers = playersByScore
        .filter(p => p.score === highestScore)
        .map(p => p.player);

      winners.push(...highScorers);

      console.log(`🎯 Highest score: ${highestScore}`, 
        `Winners: ${winners.map(w => w.name).join(', ')}`);
    }

    if (winners.length > 1) {
      console.log(`🤝 Individual game ended in a draw between:`, 
        winners.map(w => w.name));
    } else if (winners.length === 1) {
      console.log(`🏆 Single winner:`, winners[0].name);
    }
  }
  
  console.log(`🏆 Winners determined: ${winners.map(w => w.name).join(', ')}`);
  return winners;
}





// Helper function to calculate final scores including quitting players
function calculateFinalScores(gameState, room) {
  const scores = { A: 0, B: 0 };
  
  // Calculate team scores based on game mode
  if (gameState.mode === 'question-vs-game' || gameState.mode === 'question-vs-question' || gameState.mode === 'game-vs-game') {
    // Team-based scoring
    room.players.forEach(player => {
      const playerScore = gameState.playerScores?.[player.id] || 0;
      if (player.team === 'A') {
        scores.A += playerScore;
      } else if (player.team === 'B') {
        scores.B += playerScore;
      }
    });
  } else {
    // Individual scoring (all players in team A for individual modes)
    room.players.forEach(player => {
      const playerScore = gameState.playerScores?.[player.id] || 0;
      scores.A += playerScore; // In individual modes, all scores go to team A
    });
  }
  
  console.log(`📊 Final scores calculated:`, scores);
  return scores;
}





async function distributeWinnings(roomCode, winners, isDraw = false) {
  const room = activeRooms.get(roomCode);
  if (!room || !room.settings.wager) return;

  const wagerAmount = room.settings.wager;
  const houseFeeRate = 0.10; // 10% house fee

  console.log('💰 DISTRIBUTING WINNINGS:', {
    roomCode,
    wagerAmount,
    winners: winners.map(w => w.name),
    isDraw,
    players: room.players.map(p => ({ name: p.name, id: p.id }))
  });

  try {
    if (isDraw) {
      // Draw - refund both players minus house fee
      const refundAmount = Math.floor(wagerAmount * (1 - houseFeeRate));
      const houseFee = wagerAmount - refundAmount;
      const totalHouseFee = houseFee * room.players.length;
      
      console.log(`🤝 DRAW: Refunding ${refundAmount} coins to each player (house fee: ${houseFee} coins per player)`);
      
      // ✅ ADD TOTAL HOUSE FEE TO STORE WALLET
      await addToStoreWallet(totalHouseFee, roomCode, 'draw_house_fee');
      
      for (const player of room.players) {
        // ✅ FIX: Add refund amount back to player (they already lost wager at start)
        await User.findByIdAndUpdate(player.id, {
          $inc: { coinBalance: refundAmount } // ✅ Use coinBalance, not balance
        });
        
        const updatedBalance = await getUpdatedBalance(player.id);
        
        console.log(`💰 DRAW REFUND: ${player.name} got ${refundAmount} coins back. New balance: ${updatedBalance}`);
        
        // Notify player
        io.to(player.socketId).emit('user-balance-updated', {
          userId: player.id,
          type: 'draw_refund',
          amount: refundAmount,
          wagerAmount: wagerAmount,
          houseFee: houseFee,
          newBalance: updatedBalance,
          netChange: refundAmount // ✅ POSITIVE change (they get coins back)
        });
      }
    } else {
      // Calculate total pot and winner shares
      const totalPot = wagerAmount * room.players.length;
      const houseFee = Math.floor(totalPot * houseFeeRate);
      const winningPool = totalPot - houseFee;
      
      // Split winning pool among winners if multiple winners
      const winnerShare = Math.floor(winningPool / winners.length);
      
      console.log(`🏆 WINNINGS CALCULATION:`, {
        totalPot,
        houseFee,
        winningPool,
        winnerCount: winners.length,
        sharePerWinner: winnerShare
      });
      
      // Add house fee to store wallet
      await addToStoreWallet(houseFee, roomCode, 'win_house_fee');
      
      // Process all players
      for (const player of room.players) {
        const isWinner = winners.some(winner => winner.id === player.id);
        let updatedBalance = await getUpdatedBalance(player.id);
        
        if (isWinner) {
          // Winner gets their share of the pool
          await User.findByIdAndUpdate(player.id, {
            $inc: { coinBalance: winnerShare }
          });
          
          updatedBalance = await getUpdatedBalance(player.id);
          const netGain = winnerShare - wagerAmount;
          
          console.log(`💰 WINNER ${player.name}:`, {
            share: winnerShare,
            wagerPaid: wagerAmount,
            netGain,
            newBalance: updatedBalance
          });
          
          // Notify winner
          io.to(player.socketId).emit('user-balance-updated', {
            userId: player.id,
            type: 'wager_win',
            amount: winnerShare,
            wagerAmount: wagerAmount,
            houseFee: Math.floor(houseFee / room.players.length), // Per-player house fee
            newBalance: updatedBalance,
            netChange: winnerShare,
            netGain: netGain,
            winnerCount: winners.length
          });
        } else {
          // Loser: already lost their wager at game start, just notify
          console.log(`💸 LOSER ${player.name}: lost ${wagerAmount} coins. Balance: ${updatedBalance}`);
          
          // Notify loser
          io.to(player.socketId).emit('user-balance-updated', {
            userId: player.id,
            type: 'wager_loss',
            amount: wagerAmount,
            newBalance: updatedBalance,
            netChange: -wagerAmount // ✅ NEGATIVE change (they lost coins)
          });
        }
      }
    }
  } catch (error) {
    console.error('❌ Error distributing winnings:', error);
  }
}




async function getUpdatedBalance(userId) {
  const user = await User.findById(userId).select('coinBalance');
  return user.coinBalance; // ✅ Always return coinBalance
}

async function addToStoreWallet(coinsAmount, roomCode, transactionType = 'house_fee') {
  try {
    if (!coinsAmount || coinsAmount <= 0) {
      console.log('💰 No coins to add to store wallet');
      return;
    }

    const COINS_TO_SOL_RATE = 100000; // 100,000 coins = 1 SOL
    const solAmount = coinsAmount / COINS_TO_SOL_RATE;
    
    console.log(`💰 Converting ${coinsAmount} coins to ${solAmount} SOL for transaction: ${transactionType}`);

    // Update store wallet in database
    const storeWallet = await StoreWallet.findOneAndUpdate(
      {},
      { 
        $inc: { 
          balance: coinsAmount,
          solBalance: solAmount,
          totalCoinsEarned: coinsAmount,
          totalSolEarned: solAmount
        },
        $push: {
          transactions: {
            amount: coinsAmount,
            solAmount: solAmount,
            type: transactionType,
            roomCode: roomCode,
            conversionRate: COINS_TO_SOL_RATE,
            timestamp: new Date()
          }
        }
      },
      { new: true, upsert: true }
    );

    console.log(`💰 Store wallet updated: +${coinsAmount} coins (+${solAmount} SOL). New balance: ${storeWallet.balance} coins, ${storeWallet.solBalance} SOL`);
    
    // Send SOL to your main wallet if accumulated enough
    await transferToMainWalletIfNeeded(storeWallet.solBalance);
    
  } catch (error) {
    console.error('❌ Error updating store wallet:', error);
  }
}

async function transferToMainWalletIfNeeded(currentSolBalance) {
  const TRANSFER_THRESHOLD = 0.1; 
  const STORE_WALLET_SECRET_KEY = process.env.STORE_WALLET_SECRET_KEY;
  const STORE_WALLET = process.env.STORE_WALLET || 'C15eFWuTezWVrEEog3vserFaj44bYT98EpNo9ShFKQWq'; 
  if (currentSolBalance >= TRANSFER_THRESHOLD) {
    try {
      console.log(`🚚 Transferring ${currentSolBalance} SOL to main wallet...`);
      
      const transferResult = await transferSolWithRetry( // ✅ Use transferSolWithRetry for better reliability
        STORE_WALLET_SECRET_KEY,
        STORE_WALLET,
        currentSolBalance
      );
      
      if (transferResult.success) {
        // Reset store wallet SOL balance after transfer
        await StoreWallet.findOneAndUpdate(
          {},
          { 
            $set: { solBalance: 0 },
            $push: {
              transactions: {
                amount: 0,
                solAmount: -currentSolBalance,
                type: 'transfer_to_main',
                toAddress: STORE_WALLET,
                signature: transferResult.signature,  
                explorerUrl: transferResult.explorerUrl, 
                timestamp: new Date()
              }
            }
          }
        );
        
        console.log(`✅ Successfully transferred ${currentSolBalance} SOL to main wallet`);
        console.log(`🔗 Transaction: ${transferResult.explorerUrl}`);
      } else {
        throw new Error(transferResult.error);
      }
      
    } catch (error) {
      console.error('❌ Error transferring SOL to main wallet:', error);
      
      // Log the failed transfer attempt
      await StoreWallet.findOneAndUpdate(
        {},
        { 
          $push: {
            transactions: {
              amount: 0,
              solAmount: 0,
              type: 'transfer_failed',
              toAddress: STORE_WALLET,
              error: error.message,
              timestamp: new Date()
            }
          }
        }
      );
    }
  } else {
    console.log(`💤 SOL balance ${currentSolBalance} below transfer threshold ${TRANSFER_THRESHOLD}`);
  }
}






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
    gameEnded: gameState.gameEnded,
    // ✅ EXCLUDE roundTimer - it contains circular references and cannot be serialized

    currentQuestion: gameState.currentQuestion ? {
      question: gameState.currentQuestion.question,
      options: gameState.currentQuestion.options,
      correctAnswer: gameState.currentQuestion.correctAnswer,
    
    } : null,
    
    currentGame: gameState.currentGame ? {
      name: gameState.currentGame.name,
      type: gameState.currentGame.type,
      description: gameState.currentGame.description

    } : null,
    playerAnswers: gameState.playerAnswers || {},
    gameProgress: gameState.gameProgress || {},
    playerRoles: gameState.playerRoles || {},
    currentPlayerActions: gameState.currentPlayerActions || {},

    questions: [],
    currentQuestionIndex: gameState.currentQuestionIndex || 0
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
    gameEnded: gameState.gameEnded,
    // Apply same fixes to team mode
    currentQuestion: gameState.currentQuestion ? {
      question: gameState.currentQuestion.question,
      options: gameState.currentQuestion.options,
      correctAnswer: gameState.currentQuestion.correctAnswer,
    } : null,
    currentGame: gameState.currentGame ? {
      name: gameState.currentGame.name,
      type: gameState.currentGame.type,
      description: gameState.currentGame.description
    } : null,
    playerAnswers: gameState.playerAnswers || {},
    gameProgress: gameState.gameProgress || {},
    playerRoles: gameState.playerRoles || {},
    currentPlayerActions: gameState.currentPlayerActions || {},
    questions: [], // Don't send full questions array
    currentQuestionIndex: gameState.currentQuestionIndex || 0
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