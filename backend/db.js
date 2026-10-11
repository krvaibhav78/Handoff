
const { Pool } = require("pg");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";

const poolConfig = process.env.DATABASE_URL
    ? {
          connectionString: process.env.DATABASE_URL,
          ...(isProduction
              ? { ssl: { rejectUnauthorized: true } }
              : {}),
      }
    : {
          user: process.env.DB_USER,
          host: process.env.DB_HOST,
          database: process.env.DB_NAME,
          password: process.env.DB_PASSWORD,
          port: Number(process.env.DB_PORT || 5432),
      };

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err.message);
});

module.exports = pool;
