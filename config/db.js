const mysql = require('mysql2/promise')
require('dotenv').config()

let pool

const connectionUri = process.env.MYSQL_URL || process.env.DATABASE_URL

// 1. Support full connection string if Railway or cloud provider provides MYSQL_URL or DATABASE_URL
if (connectionUri) {
  try {
    const parsed = new URL(connectionUri)
    pool = mysql.createPool({
      host: parsed.hostname,
      port: parseInt(parsed.port || '3306', 10),
      user: decodeURIComponent(parsed.username || 'root'),
      password: decodeURIComponent(parsed.password || ''),
      database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'railway',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: { rejectUnauthorized: false },
    })
  } catch {
    pool = mysql.createPool(connectionUri)
  }
} else {
  // 2. Support standard DB_* as well as Railway-provided MYSQL* environment variables
  const host = process.env.DB_HOST || process.env.MYSQLHOST || 'localhost'
  const port = parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306
  const user = process.env.DB_USER || process.env.MYSQLUSER || 'root'
  const password = process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || ''
  const database = process.env.DB_NAME || process.env.MYSQLDATABASE || 'legalcase_db'
  const isCloudHost = Boolean(process.env.MYSQLHOST || process.env.RAILWAY_ENVIRONMENT)

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: isCloudHost ? { rejectUnauthorized: false } : undefined,
  })
}

module.exports = pool
