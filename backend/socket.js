import { Server } from 'socket.io';
import { addHistoryLog, addMessage, checkBlock, updateUserStatus } from './db.js';
import jwt from 'jsonwebtoken';
import dotenv from "dotenv";
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is missing");
}

const activeSockets = new Map(); // userId -> socket.id
const userProfiles = new Map(); // socket.id -> { id, username }
const matchingQueue = []; // array of socket.ids in queue
const activeMatches = new Map(); // socket.id -> { partnerSocketId, room, startedAt, partnerId, partnerName }

function removeFromMatchingQueue(socketId) {
  const index = matchingQueue.indexOf(socketId);
  if (index !== -1) {
    matchingQueue.splice(index, 1);
  }
}

export function initSocket(server) {
  const corsOriginHandler = (origin, callback) => {
    if (!origin || origin.includes('localhost') || origin.endsWith('.vercel.app') || origin === 'https://video-chat-umber-alpha.vercel.app') {
      return callback(null, true);
    }
    return callback(null, true);
  };

  const io = new Server(server, {
    cors: {
      origin: corsOriginHandler,
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling']
  });

  // JWT Authentication for Sockets
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication error: Token missing'));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Authentication error: Token invalid'));
      socket.userId = decoded.id;
      socket.username = decoded.username;
      next();
    });
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    const username = socket.username;

    // Track active connection
    activeSockets.set(userId, socket.id);
    userProfiles.set(socket.id, { id: userId, username });
    console.log(`User connected: ${username} (Socket: ${socket.id})`);
    
    // Update online status in database
    try {
      await updateUserStatus(userId, 'online');
      socket.broadcast.emit('user-status-changed', { userId, status: 'online' });
    } catch (err) {
      console.error('Failed to update status on connect:', err);
    }

    // --- RANDOM MATCHING ---
    socket.on('search-match', async () => {
      // 1. Clean up previous match if any
      await handleDisconnectOrSkip(socket, io);

      // 2. Remove socket from queue if already there to prevent duplicates
      removeFromMatchingQueue(socket.id);

      // 3. Purge any disconnected or stale sockets from queue
      for (let i = matchingQueue.length - 1; i >= 0; i--) {
        const sId = matchingQueue[i];
        const s = io.sockets.sockets.get(sId);
        if (!s || !s.connected || !userProfiles.has(sId)) {
          matchingQueue.splice(i, 1);
        }
      }

      // 4. Find valid partner who is not the same user and not blocked
      let matchedPartnerIndex = -1;
      for (let i = 0; i < matchingQueue.length; i++) {
        const potentialPartnerSocketId = matchingQueue[i];
        const potentialPartnerSocket = io.sockets.sockets.get(potentialPartnerSocketId);
        const potentialPartnerProfile = userProfiles.get(potentialPartnerSocketId);
        
        if (potentialPartnerSocket && potentialPartnerSocket.connected && potentialPartnerProfile && potentialPartnerProfile.id !== userId) {
          const isBlocked = await checkBlock(userId, potentialPartnerProfile.id);
          if (!isBlocked) {
            matchedPartnerIndex = i;
            break;
          }
        }
      }

      if (matchedPartnerIndex !== -1) {
        const partnerSocketId = matchingQueue.splice(matchedPartnerIndex, 1)[0];
        const partnerSocket = io.sockets.sockets.get(partnerSocketId);
        const partnerProfile = userProfiles.get(partnerSocketId);

        if (partnerSocket && partnerSocket.connected && partnerProfile) {
          const roomId = `room-${socket.id}-${partnerSocketId}`;
          const startTime = new Date();

          // Joins room
          socket.join(roomId);
          partnerSocket.join(roomId);

          // Store match details
          activeMatches.set(socket.id, {
            partnerSocketId,
            room: roomId,
            startedAt: startTime,
            partnerId: partnerProfile.id,
            partnerName: partnerProfile.username
          });

          activeMatches.set(partnerSocketId, {
            partnerSocketId: socket.id,
            room: roomId,
            startedAt: startTime,
            partnerId: userId,
            partnerName: username
          });

          // Inform clients (one initiates WebRTC offer, one receives)
          socket.emit('matched', {
            roomId,
            partner: { id: partnerProfile.id, username: partnerProfile.username },
            initiator: true
          });

          partnerSocket.emit('matched', {
            roomId,
            partner: { id: userId, username },
            initiator: false
          });

          console.log(`Matched ${username} and ${partnerProfile.username} in room ${roomId}`);
          return;
        }
      }

      // If no match found, put in queue
      matchingQueue.push(socket.id);
      socket.emit('waiting', { message: 'Searching for a partner...' });
      console.log(`Added ${username} to matching queue. Queue size: ${matchingQueue.length}`);
    });

    // --- CANCEL SEARCH ---
    socket.on('cancel-search', () => {
      removeFromMatchingQueue(socket.id);
      console.log(`${username} cancelled search and was removed from queue.`);
    });

    // --- WebRTC SIGNALING ---
    socket.on('signal', (data) => {
      const match = activeMatches.get(socket.id);
      if (match) {
        io.to(match.partnerSocketId).emit('signal', {
          signal: data.signal,
          sender: socket.id
        });
      }
    });

    // --- RANDOM CHAT MESSAGES ---
    socket.on('send-room-message', (data) => {
      const match = activeMatches.get(socket.id);
      if (match) {
        io.to(match.room).emit('room-message', {
          senderId: userId,
          senderName: username,
          type: data.type,
          content: data.content,
          sentAt: new Date()
        });
      }
    });

    // --- SKIP / DISCONNECT FROM MATCH ---
    socket.on('skip-match', async () => {
      console.log(`${username} requested skip`);
      removeFromMatchingQueue(socket.id);
      await handleDisconnectOrSkip(socket, io);
    });

    // --- DIRECT DM RE-ENGAGEMENT ---
    socket.on('send-direct-message', async (data) => {
      const { receiverId, content, type } = data;
      if (!receiverId || !content) return;

      try {
        const isBlocked = await checkBlock(userId, receiverId);
        if (isBlocked) {
          socket.emit('dm-error', { error: 'Message blocked or recipient unavailable' });
          return;
        }

        const messageId = await addMessage(userId, receiverId, type || 'text', content, 1);
        const savedMessage = {
          id: messageId,
          sender_id: userId,
          receiver_id: receiverId,
          sender_name: username,
          message_type: type || 'text',
          content,
          sent_at: new Date()
        };

        socket.emit('direct-message-sent', savedMessage);

        const receiverSocketId = activeSockets.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('direct-message', savedMessage);
        }
      } catch (err) {
        console.error('Failed to send DM:', err);
        socket.emit('dm-error', { error: 'Failed to deliver message' });
      }
    });

    // Check online status of specific list of user IDs
    socket.on('get-users-status', (userIds, callback) => {
      const statuses = {};
      userIds.forEach(id => {
        statuses[id] = activeSockets.has(id) ? 'online' : 'offline';
      });
      callback(statuses);
    });

    // --- BLOCK EVENT FOR CURRENT CHAT ---
    socket.on('block-current-partner', async () => {
      const match = activeMatches.get(socket.id);
      if (match) {
        try {
          removeFromMatchingQueue(socket.id);
          await handleDisconnectOrSkip(socket, io, true);
        } catch (err) {
          console.error(err);
        }
      }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${username}`);
      
      removeFromMatchingQueue(socket.id);
      await handleDisconnectOrSkip(socket, io);

      activeSockets.delete(userId);
      userProfiles.delete(socket.id);

      try {
        await updateUserStatus(userId, 'offline');
        socket.broadcast.emit('user-status-changed', { userId, status: 'offline' });
      } catch (err) {
        console.error('Failed to update status on disconnect:', err);
      }
    });
  });
}

// Clean up matches, calculate call duration, write log, and notify partner
async function handleDisconnectOrSkip(socket, io, isBlockOrReport = false) {
  const match = activeMatches.get(socket.id);
  if (!match) return;

  const partnerSocketId = match.partnerSocketId;
  const partnerSocket = io.sockets.sockets.get(partnerSocketId);
  const roomId = match.room;
  const startedAt = match.startedAt;
  const endedAt = new Date();
  const durationSeconds = Math.round((endedAt - startedAt) / 1000);

  try {
    await addHistoryLog(socket.userId, match.partnerId, startedAt.toISOString(), endedAt.toISOString(), durationSeconds);
    await addHistoryLog(match.partnerId, socket.userId, startedAt.toISOString(), endedAt.toISOString(), durationSeconds);
  } catch (err) {
    console.error('Error logging history to DB:', err);
  }

  if (partnerSocket) {
    partnerSocket.emit('peer-disconnected', {
      reason: isBlockOrReport ? 'blocked' : 'skipped',
      durationSeconds
    });
    partnerSocket.leave(roomId);
  }

  activeMatches.delete(socket.id);
  activeMatches.delete(partnerSocketId);

  socket.leave(roomId);
  console.log(`Cleaned up room ${roomId} between ${socket.username} and ${match.partnerName}. Duration: ${durationSeconds}s`);
}
