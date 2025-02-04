import 'dotenv/config';
import { db } from '../db';
import { videoClips } from '../db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';

// Set DATABASE_URL directly if not using .env
process.env.DATABASE_URL = "postgresql://neondb_owner:npg_Qg28shXLZdYB@ep-restless-cake-a10s445f-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const query = db.query as Record<string, any>;

async function cleanupDatabase() {
  try {
    // Wait for DB connection
    console.log('Connecting to database...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Get all clips from database
    const dbClips = await query.videoClips.findMany();
    console.log(`Found ${dbClips.length} clips in database`);

    // Get all files in uploads directory
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    const files = await fs.readdir(uploadsDir);
    console.log(`Found ${files.length} files in uploads directory`);

    // Find clips that don't have corresponding files
    const clipsToRemove = dbClips.filter(clip => {
      const filename = path.basename(clip.url.replace(/^\/uploads\//, ''));
      return !files.includes(filename);
    });

    console.log(`Found ${clipsToRemove.length} clips to remove`);

    // Remove clips from database
    for (const clip of clipsToRemove) {
      console.log(`Removing clip: ${clip.name} (${clip.url})`);
      await db.delete(videoClips).where(eq(videoClips.id, clip.id));
    }

    console.log('Database cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    process.exit(0);
  }
}

cleanupDatabase(); 