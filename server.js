const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

// Database setup
const db = new sqlite3.Database('./procurement_platform.db', (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to the SQLite database.');
    initDb();
  }
});

function initDb() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT UNIQUE,
      password TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      registrationNumber TEXT UNIQUE,
      address TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS rfps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      description TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfpId INTEGER,
      supplierId INTEGER,
      amount REAL,
      documents TEXT,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rfpId) REFERENCES rfps (id),
      FOREIGN KEY (supplierId) REFERENCES suppliers (id)
    )`
  ];

  db.serialize(() => {
    tables.forEach(table => db.run(table));
  });
}

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Helper function for database operations
function dbRun(query, params) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(query, params) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(query, params) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Error handler middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

// User Registration
app.post('/api/auth/register', async (req, res, next) => {
  const { name, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await dbRun('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);
    res.status(201).json({ message: 'User registered successfully', userId: result.lastID });
  } catch (error) {
    next(error);
  }
});

// User Login
app.post('/api/auth/login', async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const result = await bcrypt.compare(password, user.password);
    if (!result) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.status(200).json({ message: 'Login successful', userId: user.id });
  } catch (error) {
    next(error);
  }
});

// Supplier Onboarding
app.post('/api/suppliers/onboard', async (req, res, next) => {
  const { name, registrationNumber, address } = req.body;

  try {
    const result = await dbRun('INSERT INTO suppliers (name, registrationNumber, address) VALUES (?, ?, ?)', 
      [name, registrationNumber, address]);
    res.status(201).json({ message: 'Supplier onboarded successfully', supplierId: result.lastID });
  } catch (error) {
    next(error);
  }
});

// Submit Bid
app.post('/api/bids', async (req, res, next) => {
  const { rfpId, supplierId, amount, documents } = req.body;

  try {
    const result = await dbRun('INSERT INTO bids (rfpId, supplierId, amount, documents) VALUES (?, ?, ?, ?)', 
      [rfpId, supplierId, amount, documents]);
    res.status(201).json({ message: 'Bid submitted successfully', bidId: result.lastID });
  } catch (error) {
    next(error);
  }
});

// Evaluate Bids
app.post('/api/bids/evaluate', async (req, res, next) => {
  const { rfpId } = req.body;

  try {
    const bids = await dbAll('SELECT * FROM bids WHERE rfpId = ?', [rfpId]);
    await dbRun('UPDATE bids SET status = ? WHERE rfpId = ?', ['evaluated', rfpId]);
    res.status(200).json({ message: 'Bids evaluated successfully', evaluatedBidsCount: bids.length });
  } catch (error) {
    next(error);
  }
});

// Get all RFPs
app.get('/api/rfps', async (req, res, next) => {
  try {
    const rfps = await dbAll('SELECT * FROM rfps', []);
    res.status(200).json(rfps);
  } catch (error) {
    next(error);
  }
});

// Create a new RFP
app.post('/api/rfps', async (req, res, next) => {
  const { title, description } = req.body;

  try {
    const result = await dbRun('INSERT INTO rfps (title, description) VALUES (?, ?)', [title, description]);
    res.status(201).json({ message: 'RFP created successfully', rfpId: result.lastID });
  } catch (error) {
    next(error);
  }
});

// Get Winning Bid
app.get('/api/bids/winning/:rfpId', async (req, res, next) => {
  const { rfpId } = req.params;

  try {
    const winningBid = await dbGet('SELECT * FROM bids WHERE rfpId = ? ORDER BY amount ASC LIMIT 1', [rfpId]);
    if (!winningBid) {
      return res.status(404).json({ message: 'No bids found for this RFP' });
    }
    res.status(200).json({ winningBid });
  } catch (error) {
    next(error);
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
