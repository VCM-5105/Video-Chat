import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'chat_app.db');

let db;

export async function initDB() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await db.run('PRAGMA foreign_keys = ON');

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'offline'
    );

    CREATE TABLE IF NOT EXISTS history_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      partner_id INTEGER NOT NULL,
      started_at DATETIME NOT NULL,
      ended_at DATETIME NOT NULL,
      duration_seconds INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER,
      message_type TEXT CHECK(message_type IN ('text', 'image', 'gif')) DEFAULT 'text',
      content TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_history_dm INTEGER DEFAULT 0,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_id INTEGER NOT NULL,
      blocked_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id),
      FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL,
      reported_id INTEGER NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reported_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  console.log('Database initialized and tables verified.');
  return db;
}

export function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call initDB first.');
  }
  return db;
}

// User helper methods
export async function createUser(username, passwordHash) {
  const result = await db.run(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    [username, passwordHash]
  );
  return result.lastID;
}

export async function findUserByUsername(username) {
  return await db.get('SELECT * FROM users WHERE username = ?', [username]);
}

export async function findUserById(id) {
  return await db.get('SELECT id, username, status, created_at FROM users WHERE id = ?', [id]);
}

export async function updateUserStatus(id, status) {
  return await db.run('UPDATE users SET status = ? WHERE id = ?', [status, id]);
}

// Logs helper methods
export async function addHistoryLog(userId, partnerId, startedAt, endedAt, durationSeconds) {
  return await db.run(
    'INSERT INTO history_logs (user_id, partner_id, started_at, ended_at, duration_seconds) VALUES (?, ?, ?, ?, ?)',
    [userId, partnerId, startedAt, endedAt, durationSeconds]
  );
}

export async function getHistoryLogsForUser(userId) {
  
  return await db.all(`
    SELECT 
      hl.id,
      hl.partner_id,
      u.username as partner_name,
      u.status as partner_status,
      hl.started_at,
      hl.ended_at,
      hl.duration_seconds,
      EXISTS(SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = hl.partner_id) as is_blocked_by_user,
      EXISTS(SELECT 1 FROM blocks WHERE blocker_id = hl.partner_id AND blocked_id = ?) as is_user_blocked_by_partner
    FROM history_logs hl
    JOIN users u ON hl.partner_id = u.id
    WHERE hl.user_id = ?
    ORDER BY hl.started_at DESC
  `, [userId, userId, userId]);
}

// Message helper methods
export async function addMessage(senderId, receiverId, type, content, isHistoryDm = 0) {
  const result = await db.run(
    'INSERT INTO messages (sender_id, receiver_id, message_type, content, is_history_dm) VALUES (?, ?, ?, ?, ?)',
    [senderId, receiverId, type, content, isHistoryDm]
  );
  return result.lastID;
}

export async function getDmMessages(userId, partnerId) {
  return await db.all(`
    SELECT m.*, u.username as sender_name 
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE is_history_dm = 1 AND (
      (sender_id = ? AND receiver_id = ?) OR
      (sender_id = ? AND receiver_id = ?)
    )
    ORDER BY sent_at ASC
  `, [userId, partnerId, partnerId, userId]);
}

// Blocks & Reports helper methods
export async function blockUser(blockerId, blockedId) {
  return await db.run(
    'INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)',
    [blockerId, blockedId]
  );
}

export async function unblockUser(blockerId, blockedId) {
  return await db.run(
    'DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?',
    [blockerId, blockedId]
  );
}

export async function checkBlock(userA, userB) {
  const result = await db.get(
    'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    [userA, userB, userB, userA]
  );
  return !!result;
}

export async function reportUser(reporterId, reportedId, reason) {
  return await db.run(
    'INSERT INTO reports (reporter_id, reported_id, reason) VALUES (?, ?, ?)',
    [reporterId, reportedId, reason]
  );
}
