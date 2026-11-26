const mysql = require('mysql2/promise')
require('dotenv').config()

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'reseau.proxy.rlwy.net',
  port: parseInt(process.env.DB_PORT, 10) || 49631,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'dmFdLDnqQgBdNtaqdroSxvyQYvNklDji',
  database: process.env.DB_NAME || 'railway',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

module.exports = pool

