import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./schema";

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;
neonConfig.useSecureWebSocket = true;
neonConfig.pipelineConnect = false;

// Create a singleton pool instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  max: 20,
  idleTimeoutMillis: 30000,
  keepAlive: true
});

// Test connection and export db instance
let db: ReturnType<typeof drizzle>;

async function initDB() {
  try {
    await pool.connect();
    console.log('Database connected successfully');
    db = drizzle(pool, { schema });
  } catch (error) {
    console.error('Database connection error:', error);
    process.exit(1);
  }
}

// Initialize DB connection
initDB().catch(console.error);

// Add error handler
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  initDB().catch(console.error);
});

export { db, pool };