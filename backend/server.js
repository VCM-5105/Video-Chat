import express from 'express';
import http from 'http';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { initDB, createUser, findUserByUsername, findUserById, getHistoryLogsForUser, getDmMessages, blockUser, unblockUser, reportUser } from './db.js';
import { initSocket } from './socket.js';
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is missing");
}

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://video-chat-umber-alpha.vercel.app"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());


const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token invalid or expired' });
    req.user = user;
    next();
  });
};


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, 'img-' + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// API Endpoints
// Auth
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    const hash = await bcrypt.hash(password, 10);
    const userId = await createUser(username, hash);
    const token = jwt.sign({ id: userId, username }, JWT_SECRET);
    res.status(201).json({ token, user: { id: userId, username } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    const user = await findUserByUsername(username);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Image Upload
app.post('/api/upload', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

// History Logs
app.get('/api/history', authenticateToken, async (req, res) => {
  try {
    const logs = await getHistoryLogsForUser(req.user.id);
    res.json(logs);
  } catch (error) {
    console.error('Fetch history logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DM message history
app.get('/api/chat/:partnerId', authenticateToken, async (req, res) => {
  try {
    const partnerId = parseInt(req.params.partnerId, 10);
    const messages = await getDmMessages(req.user.id, partnerId);
    res.json(messages);
  } catch (error) {
    console.error('Fetch DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Block/Unblock
app.post('/api/block', authenticateToken, async (req, res) => {
  try {
    const { blockedId } = req.body;
    if (!blockedId) return res.status(400).json({ error: 'Blocked ID is required' });
    await blockUser(req.user.id, blockedId);
    res.json({ success: true, message: 'User blocked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/unblock', authenticateToken, async (req, res) => {
  try {
    const { blockedId } = req.body;
    if (!blockedId) return res.status(400).json({ error: 'Blocked ID is required' });
    await unblockUser(req.user.id, blockedId);
    res.json({ success: true, message: 'User unblocked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Report
app.post('/api/report', authenticateToken, async (req, res) => {
  try {
    const { reportedId, reason } = req.body;
    if (!reportedId) return res.status(400).json({ error: 'Reported ID is required' });
    await reportUser(req.user.id, reportedId, reason);
    // Automatically block reported users by default for safety
    await blockUser(req.user.id, reportedId);
    res.json({ success: true, message: 'User reported and blocked successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Server Initialization
async function startServer() {
  await initDB();
  initSocket(server);
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
