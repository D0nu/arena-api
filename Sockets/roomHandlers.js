export const activeRooms = new Map();

export function roomHandlers(io, socket, { safeEmit, safeBroadcast, removeCircularReferences }) {
  

  socket.on('create-room', async (settings) => {
    try {
      const user = socket.user;
      if (!user) {
        safeEmit(socket, 'room-error', { message: 'Authentication required' });
        return;
      }

      console.log(`🚀 Creating room for user: ${user.name}`);

      // 🧹 Step 1: Remove user from any previous active room
      for (const [code, room] of activeRooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.id === user._id.toString());
        if (playerIndex !== -1) {
          console.log(`⚠️ Removing ${user.name} from previous room: ${code}`);
          room.players.splice(playerIndex, 1);

          // Remove empty rooms completely
          if (room.players.length === 0) {
            activeRooms.delete(code);
            console.log(`🗑️ Deleted empty room: ${code}`);
          }

          // Also ensure socket leaves the previous room
          socket.leave(code);
          break;
        }
      }

      // 🧠 Step 2: Generate unique room code
      const generateRoomCode = () => {
        return (
          Math.random().toString(36).substring(2, 6).toUpperCase() +
          '-' +
          Math.random().toString(36).substring(2, 6).toUpperCase()
        );
      };

      const roomCode = generateRoomCode();

      // ⚙️ Step 3: Default settings
      const defaultSettings = {
        wager: settings.wager || 0,
        mode: settings.mode || 'question-vs-game',
        playerCount: settings.playerCount || 2,
        difficulty: settings.difficulty || 'medium',
        topic: settings.topic || 'general',
        rounds: settings.rounds || 1,
        ...settings,
      };

      // 🧩 Step 4: Create room object
      const room = {
        code: roomCode,
        settings: defaultSettings,
        players: [
          {
            id: user._id.toString(),
            socketId: socket.id,
            name: user.name,
            avatar: user.avatar || '👤',
            isOwner: true,
            team: 'A',
            isReady: false,
          },
        ],
        ownerId: user._id.toString(),
        status: 'waiting',
        createdAt: new Date(),
      };

      // 💾 Step 5: Store in memory
      activeRooms.set(roomCode, room);

      // 🔗 Step 6: Join socket.io room
      socket.join(roomCode);

      console.log(`✅ Room created: ${roomCode} by ${user.name}`);
      console.log(`📋 Active rooms:`, Array.from(activeRooms.keys()));

      // 🔊 Step 7: Emit back to creator
      safeEmit(socket, 'room-created', {
        room,
        redirectUrl: `/room/${roomCode}`,
      });

      // Also emit room-state immediately
      safeEmit(socket, 'room-state', room);
      io.emit('created-rooms', Array.from(activeRooms.values()));

    } catch (error) {
      console.error('❌ Room creation error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to create room' });
    }
  });

  socket.on('get-rooms', async () => {
    try {
      const user = socket.user;
      if (!user) {
        safeEmit(socket, 'room-error', { message: 'Authentication required' });
        return;
      }
      io.emit('created-rooms', Array.from(activeRooms.values()));
    } catch (error) {
      console.error('❌ Room creation error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to create room' });
    }
  });

  // ✅ FIXED: Join room handler - Improved data handling
  socket.on('join-room', async (data) => {
    try {
      console.log('🎯 JOIN-ROOM REQUEST RECEIVED:', {
        rawData: data,
        dataType: typeof data,
        isString: typeof data === 'string',
        isObject: typeof data === 'object'
      });

      const user = socket.user;
      if (!user) {
        console.log('❌ No user found for join-room');
        safeEmit(socket, 'room-error', { message: 'Authentication required' });
        return;
      }

      // ✅ FIXED: Better room code extraction
      let roomCode;
      
      if (typeof data === 'string') {
        // Handle: "YUFY-JR1F"
        roomCode = data;
      } else if (typeof data === 'object' && data.roomCode) {
        // Handle: { roomCode: "YUFY-JR1F" }
        roomCode = data.roomCode;
      } else if (typeof data === 'object' && data.code) {
        // Handle: { code: "YUFY-JR1F" } - alternative format
        roomCode = data.code;
      } else {
        console.error('❌ Invalid room code format:', data);
        safeEmit(socket, 'room-error', { message: 'Invalid room code format' });
        return;
      }

      // ✅ FIXED: Normalize room code
      roomCode = roomCode.trim().toUpperCase().replace(/\s+/g, '');
      console.log(`🔍 Looking for room: "${roomCode}"`);

      // ✅ FIXED: Debug all available rooms
      const availableRooms = Array.from(activeRooms.keys());
      console.log(`📋 Available rooms (${availableRooms.length}):`, availableRooms);

      // 🧠 Step 1: Validate room existence
      const room = activeRooms.get(roomCode);
      if (!room) {
        console.log(`❌ Room "${roomCode}" not found in active rooms. Available: ${availableRooms.join(', ')}`);
        safeEmit(socket, 'room-not-found');
        return;
      }

      console.log(`✅ Room found:`, {
        code: room.code,
        players: room.players.length,
        maxPlayers: room.settings.playerCount,
        playerNames: room.players.map(p => p.name)
      });

      // Check if room is full
      if (room.players.length >= room.settings.playerCount) {
        console.log(`❌ Room ${roomCode} is full: ${room.players.length}/${room.settings.playerCount}`);
        safeEmit(socket, 'room-full');
        return;
      }

      // Check if user is already in room (reconnection)
      const existingPlayer = room.players.find(p => p.id === user._id.toString());
      if (existingPlayer) {
        console.log(`🔄 ${user.name} is reconnecting to room: ${roomCode}`);
        existingPlayer.socketId = socket.id; // update socket ID
        socket.join(roomCode);

        safeEmit(socket, 'room-joined', {
          room,
          redirectUrl: `/room/${roomCode}`,
        });

        // Send room state immediately
        safeEmit(socket, 'room-state', room);
        
        // Notify other players
        safeBroadcast(io, roomCode, 'player-reconnected', existingPlayer);
        safeBroadcast(io, roomCode, 'room-updated', room);
        return;
      }

      // 👤 Create new player
      const newPlayer = {
        id: user._id.toString(),
        socketId: socket.id,
        name: user.name,
        avatar: user.avatar || '👤',
        isOwner: false,
        team: null,
        isReady: false,
      };

      // 🎯 Assign team based on game mode
      if (room.settings.mode === 'question-vs-game') {
        assignTeamToNewPlayer(room, newPlayer);
      } else {
        // For non-team modes, no team assignment
        newPlayer.team = null;
      }

      // ➕ Add player to room
      room.players.push(newPlayer);
      socket.join(roomCode);

      // ✅ FIXED: Update room status after join
      const isRoomFull = room.players.length === room.settings.playerCount;
      const allPlayersReady = room.players.every(p => p.isReady);

      if (isRoomFull && allPlayersReady) {
        room.status = 'ready-to-start';
        console.log(`🎮 Room ${roomCode} became ready-to-start after join`);
      } else {
        room.status = 'waiting'; // Ensure it's waiting if not all conditions met
      }

      console.log(`✅ ${user.name} joined room: ${roomCode} as Team ${newPlayer.team}`);
      console.log(`📊 Room ${roomCode} now has ${room.players.length}/${room.settings.playerCount} players, status: ${room.status}`);

      // 🔊 Emit to joiner
      safeEmit(socket, 'room-joined', {
        room,
        redirectUrl: `/room/${roomCode}`,
      });

      // Send room state immediately
      safeEmit(socket, 'room-state', room);

      // 📢 Notify all players in room
      safeBroadcast(io, roomCode, 'player-joined', newPlayer);
      safeBroadcast(io, roomCode, 'room-updated', room);

      // Update rooms list for everyone
      io.emit('created-rooms', Array.from(activeRooms.values()));

    } catch (error) {
      console.error('❌ Room join error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to join room: ' + error.message });
    }
  });

  // ✅ Get room state
  socket.on('get-room-state', async (roomCode) => {
    try {
      console.log(`🔍 Getting room state for: ${roomCode}`);
      const room = activeRooms.get(roomCode);
      if (room) {
        console.log(`✅ Room state found for: ${roomCode}`);
        safeEmit(socket, 'room-state', room);
      } else {
        console.log(`❌ Room not found for state request: ${roomCode}`);
        safeEmit(socket, 'room-error', { message: 'Room not found' });
      }
    } catch (error) {
      console.error('Get room state error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to get room state' });
    }
  });

  // ✅ FIXED: Toggle ready handler - Now properly updates status in both directions
  socket.on('toggle-ready', async (roomCode) => {
    try {
      const user = socket.user;
      if (!user) return;

      console.log(`🔄 Toggle ready for user: ${user.name} in room: ${roomCode}`);

      const room = activeRooms.get(roomCode);
      if (!room) {
        safeEmit(socket, 'room-error', { message: 'Room not found' });
        return;
      }

      const player = room.players.find(p => p.id === user._id.toString());
      if (!player) {
        safeEmit(socket, 'room-error', { message: 'Player not found in room' });
        return;
      }

      // Toggle ready status
      player.isReady = !player.isReady;
      
      console.log(`✅ ${user.name} ready status: ${player.isReady}`);

      // ✅ FIXED: Check room status based on ALL conditions
      const isRoomFull = room.players.length === room.settings.playerCount;
      const allPlayersReady = room.players.every(p => p.isReady);
      
      // Update room status based on current conditions
      if (isRoomFull && allPlayersReady) {
        room.status = 'ready-to-start';
        console.log(`🎮 All players ready in room: ${roomCode} → status: ready-to-start`);
      } else {
        room.status = 'waiting'; // ✅ FIXED: Reset to waiting if conditions aren't met
        console.log(`🔄 Room ${roomCode} status reset to: waiting`);
      }

      // Notify all players
      safeBroadcast(io, roomCode, 'room-updated', room);
      safeBroadcast(io, roomCode, 'player-ready-updated', {
        playerId: user._id.toString(),
        isReady: player.isReady
      });

    } catch (error) {
      console.error('Toggle ready error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to toggle ready status' });
    }
  });

  // ✅ FIXED: Leave room handler - Now properly resets status
  socket.on('leave-room', async (roomCode) => {
    try {
      const user = socket.user;
      if (!user) return;

      console.log(`🚪 ${user.name} leaving room: ${roomCode}`);

      const room = activeRooms.get(roomCode);
      if (!room) {
        safeEmit(socket, 'room-left', { success: true });
        return;
      }

      const playerIndex = room.players.findIndex(p => p.id === user._id.toString());
      if (playerIndex === -1) {
        safeEmit(socket, 'room-left', { success: true });
        return;
      }

      // Remove player
      const removedPlayer = room.players.splice(playerIndex, 1)[0];
      
      // ✅ FIXED: Reset room status when player leaves
      room.status = 'waiting';
      console.log(`🔄 Room ${roomCode} status reset to waiting after player left`);
      
      // If owner left and there are other players, assign new owner
      if (removedPlayer.isOwner && room.players.length > 0) {
        room.players[0].isOwner = true;
        console.log(`👑 New owner assigned: ${room.players[0].name}`);
      }

      // Leave socket room
      socket.leave(roomCode);

      console.log(`✅ ${user.name} left room: ${roomCode}. Remaining players: ${room.players.length}`);

      // If room is empty, delete it
      if (room.players.length === 0) {
        setTimeout(() => {
          if (activeRooms.get(roomCode)?.players.length === 0) {
            activeRooms.delete(roomCode);
            console.log(`🗑️ Room ${roomCode} deleted (empty)`);
            io.emit('created-rooms', Array.from(activeRooms.values()));
          }
        }, 30000);
      } else {
        // Notify remaining players
        safeBroadcast(io, roomCode, 'player-left', {
          playerId: user._id.toString(),
          playerName: user.name,
          room: room
        });
        safeBroadcast(io, roomCode, 'room-updated', room);
        io.emit('created-rooms', Array.from(activeRooms.values()));
      }

      safeEmit(socket, 'room-left', { success: true });

    } catch (error) {
      console.error('Leave room error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to leave room' });
    }
  });

  // Reconnect to room handler
  socket.on('reconnect-to-room', async () => {
    try {
      const user = socket.user;
      if (!user) return;

      console.log(`🔁 Reconnect attempt for user: ${user.name}`);

      let userRoom = null;
      let roomCode = null;

      for (const [code, room] of activeRooms.entries()) {
        const player = room.players.find(p => p.id === user._id.toString());
        if (player) {
          userRoom = room;
          roomCode = code;
          player.socketId = socket.id; // Update socket ID
          break;
        }
      }

      if (!userRoom) {
        console.log(`❌ No room found for user: ${user.name}`);
        safeEmit(socket, "no-room-found");
        return;
      }

      socket.join(roomCode);
      console.log(`✅ ${user.name} reconnected to room: ${roomCode}`);
      safeEmit(socket, "room-reconnected", userRoom);
      safeBroadcast(io, roomCode, "room-updated", userRoom);

    } catch (error) {
      console.error("Room reconnection error:", error);
      safeEmit(socket, "room-error", { message: "Failed to reconnect to room" });
    }
  });

  // ✅ DEBUG: List all active rooms
  socket.on('debug-list-rooms', () => {
    console.log('🏠 DEBUG: ACTIVE ROOMS LIST:');
    const roomsList = Array.from(activeRooms.entries()).map(([code, room]) => ({
      code,
      playerCount: room.players.length,
      maxPlayers: room.settings.playerCount,
      players: room.players.map(p => ({ name: p.name, team: p.team, isOwner: p.isOwner, isReady: p.isReady })),
      status: room.status
    }));
    
    console.table(roomsList);
    
    safeEmit(socket, 'debug-rooms-list', { rooms: roomsList });
  });

  socket.on('update-room-settings', async (settings) => {
    try {
      const user = socket.user;
      if (!user) return;

      // Find room where user is owner
      let targetRoom = null;
      let roomCode = null;
      
      for (const [code, room] of activeRooms.entries()) {
        const player = room.players.find(p => p.id === user._id.toString());
        if (player && player.isOwner) {
          targetRoom = room;
          roomCode = code;
          break;
        }
      }

      if (!targetRoom) {
        safeEmit(socket, 'room-error', { message: 'Room not found or not owner' });
        return;
      }

      // Update settings
      targetRoom.settings = { ...targetRoom.settings, ...settings };

      console.log(`⚙️ Room ${roomCode} settings updated by ${user.name}`);
      safeBroadcast(io, roomCode, 'room-settings-updated', targetRoom.settings);
      safeBroadcast(io, roomCode, 'room-updated', targetRoom);

    } catch (error) {
      console.error('Room settings update error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to update room settings' });
    }
  });

  socket.on('close-room', async (roomCode) => {
    try {
      const user = socket.user;
      if (!user) return;

      const room = activeRooms.get(roomCode);
      if (!room) {
        safeEmit(socket, 'room-error', { message: 'Room not found' });
        return;
      }

      // Check if user is the room owner
      const player = room.players.find(p => p.id === user._id.toString());
      if (!player || !player.isOwner) {
        safeEmit(socket, 'room-error', { message: 'Only room owner can close the room' });
        return;
      }

      console.log(`🚫 Room ${roomCode} being closed by owner: ${user.name}`);

      // Notify all players in the room that it's being closed
      safeBroadcast(io, roomCode, 'room-closed', { 
        message: 'Room has been closed by the owner',
        roomCode: roomCode
      });
      
      safeBroadcast(io, roomCode, 'redirect-to-home');

      // Delete the room immediately
      activeRooms.delete(roomCode);
      console.log(`🗑️ Room ${roomCode} deleted by owner`);

      // Emit success to the owner
      safeEmit(socket, 'room-closed', { success: true });
      io.emit('created-rooms', Array.from(activeRooms.values()));

    } catch (error) {
      console.error('Close room error:', error);
      safeEmit(socket, 'room-error', { message: 'Failed to close room' });
    }
  });

  // NEW: Handler for when players return to room after game
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

  // NEW: Handler for room reset after game cleanup
  socket.on('room-reset-complete', (roomCode) => {
    try {
      console.log(`🔄 Room reset complete: ${roomCode}`);
      
      const room = activeRooms.get(roomCode);
      if (room) {
        room.status = 'waiting';
        
        // Reset all players' ready status
        room.players.forEach(player => {
          player.isReady = false;
        });
        
        safeBroadcast(io, roomCode, 'room-updated', room);
        console.log(`✅ Room ${roomCode} fully reset to waiting state`);
      }
      
    } catch (error) {
      console.error('Room reset complete error:', error);
    }
  });

  // NEW: Handler for checking if room can start game
  socket.on('check-room-ready', (roomCode) => {
    try {
      const room = activeRooms.get(roomCode);
      if (!room) {
        safeEmit(socket, 'room-ready-status', { canStart: false, reason: 'Room not found' });
        return;
      }

      const isRoomFull = room.players.length === room.settings.playerCount;
      const allPlayersReady = room.players.every(player => player.isReady);
      const canStart = isRoomFull && allPlayersReady;

      safeEmit(socket, 'room-ready-status', {
        canStart,
        isRoomFull,
        allPlayersReady,
        currentPlayers: room.players.length,
        requiredPlayers: room.settings.playerCount,
        readyPlayers: room.players.filter(p => p.isReady).length
      });

    } catch (error) {
      console.error('Check room ready error:', error);
      safeEmit(socket, 'room-ready-status', { canStart: false, reason: 'Error checking room status' });
    }
  });

  // 🔧 Helper: Assign team to new player
  function assignTeamToNewPlayer(room, newPlayer) {
    const teamACount = room.players.filter(p => p.team === 'A').length;
    const teamBCount = room.players.filter(p => p.team === 'B').length;
    
    console.log(`🎯 Assigning team for ${newPlayer.name}: A=${teamACount}, B=${teamBCount}, TotalPlayers=${room.players.length}`);
    
    // For 2-player games: new player always goes to Team B
    if (room.settings.playerCount === 2) {
      newPlayer.team = 'B';
      console.log(`🎯 2-player game: ${newPlayer.name} assigned to Team B`);
    }
    // For larger games: assign to smaller team, or random if equal
    else if (room.settings.playerCount > 2) {
      if (teamACount < teamBCount) {
        newPlayer.team = 'A';
      } else if (teamBCount < teamACount) {
        newPlayer.team = 'B';
      } else {
        // Teams are equal, assign randomly
        newPlayer.team = Math.random() < 0.5 ? 'A' : 'B';
      }
      console.log(`🔄 ${newPlayer.name} assigned to Team ${newPlayer.team} (A:${teamACount}, B:${teamBCount})`);
    }
    
    // Balance teams after assignment if needed
    balanceTeamsAfterJoin(room);
  }

  // 🔧 Helper: Balance teams after a player joins
  function balanceTeamsAfterJoin(room) {
    const teamACount = room.players.filter(p => p.team === 'A').length;
    const teamBCount = room.players.filter(p => p.team === 'B').length;
    const difference = Math.abs(teamACount - teamBCount);
    
    // If teams are unbalanced by more than 1 player, rebalance
    if (difference > 1) {
      console.log(`⚖️ Balancing teams after join: A=${teamACount}, B=${teamBCount}`);
      
      if (teamACount > teamBCount) {
        // Move a player from Team A to Team B (choose the most recent non-owner)
        const playerToMove = room.players
          .filter(p => p.team === 'A' && !p.isOwner)
          .slice(-1)[0]; // Get the last non-owner in Team A
        
        if (playerToMove) {
          playerToMove.team = 'B';
          console.log(`🔄 Balanced: Moved ${playerToMove.name} from Team A to Team B`);
        }
      } else if (teamBCount > teamACount) {
        // Move a player from Team B to Team A
        const playerToMove = room.players
          .filter(p => p.team === 'B')
          .slice(-1)[0]; // Get the last player in Team B
        
        if (playerToMove) {
          playerToMove.team = 'A';
          console.log(`🔄 Balanced: Moved ${playerToMove.name} from Team B to Team A`);
        }
      }
    }
  }

 
}