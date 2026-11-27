const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
require('dotenv').config()

let db
try {
  db = require('./config/db')
} catch {
  // Graceful fallback if config/db.js is missing
}

const app = express()
const PORT = process.env.PORT || 5000

// JSON request parsing (with 50MB payload limit for file attachments)
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Ensure backend data and upload directories exist
const dataDir = path.join(__dirname, 'data')
const uploadDir = path.join(__dirname, 'uploads', 'documents')
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

// Serve static uploaded documents
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// CORS configured for all local development ports (5173, 5174, 5175, etc.) and explicit origins
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174')
  .split(',')
  .map((origin) => origin.trim())

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, mobile apps, Postman)
      if (!origin) return callback(null, true)

      // Allow any localhost / 127.0.0.1 development port automatically
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true)
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error(`CORS blocked: Origin ${origin} not permitted`))
    },
    credentials: true,
  })
)

// GET /api/health — Verify backend availability
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'LegalCase Backend API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// GET /api/db-health — Verify MySQL database connectivity safely
app.get('/api/db-health', async (req, res) => {
  if (!db) {
    try {
      db = require('./config/db')
    } catch {
      return res.status(500).json({
        status: 'error',
        database: 'disconnected',
        message: 'Database configuration not loaded',
        timestamp: new Date().toISOString(),
      })
    }
  }

  try {
    const [rows] = await db.query('SELECT 1 AS connected')
    if (rows && rows.length > 0 && rows[0].connected === 1) {
      return res.status(200).json({
        status: 'ok',
        database: 'connected',
        targetDatabase: process.env.DB_NAME || 'legalcase_db',
        timestamp: new Date().toISOString(),
      })
    }
    return res.status(500).json({
      status: 'error',
      database: 'unexpected_result',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    // Avoid exposing credentials or sensitive database details
    return res.status(500).json({
      status: 'error',
      database: 'disconnected',
      message: 'Failed to connect to MySQL database',
      code: error.code || 'DB_CONNECTION_ERROR',
      timestamp: new Date().toISOString(),
    })
  }
})

// Mount Modular Business API Routes
const apiRoutes = require('./routes/api')
app.use('/api', apiRoutes)

// Safe error handler (avoids exposing stack traces or crashing)
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('CORS')) {
    return res.status(403).json({
      status: 'error',
      message: err.message,
    })
  }
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
  })
})

if (require.main === module) {
  app.listen(PORT, async () => {
    console.log(`LegalCase Backend Server running on port ${PORT}`)
    try {
      if (db) {
        const [rows] = await db.query('SELECT 1 AS connected')
        const [dbInfo] = await db.query('SELECT DATABASE() AS currentDb')
        const currentDb = dbInfo && dbInfo[0] ? dbInfo[0].currentDb : (process.env.DB_NAME || 'railway')
        const connHost = process.env.MYSQL_URL ? 'Live Railway (reseau.proxy.rlwy.net)' : `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`
        console.log(`MySQL Database '${currentDb}' connected successfully via ${connHost}`)
      }
    } catch (err) {
      console.error('MySQL Database connection error:', err.message)
    }
  })
}

module.exports = app
