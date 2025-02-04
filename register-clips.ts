import { db } from "./db";
import { videoClips } from "./db/schema";
import path from "path";
import fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

// Set DATABASE_URL directly
process.env.DATABASE_URL = "postgresql://neondb_owner:npg_Qg28shXLZdYB@ep-restless-cake-a10s445f-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

const execAsync = promisify(exec);
const projectRoot = 'c:\\Users\\Dell\\Downloads\\VideoVibeGenerator\\VideoVibeGenerator';
const ffprobePath = path.resolve(projectRoot, 'ffmpeg', 'ffmpeg-7.1-essentials_build', 'bin', 'ffprobe.exe');

async function registerClips() {
  try {
    console.log('Project root:', projectRoot);
    
    // Clear existing clips
    await db.delete(videoClips);
    
    const uploadsDir = path.resolve(projectRoot, 'uploads');
    console.log('Uploads directory:', uploadsDir);
    
    // Register clips

    const clips = [
      {
        name: "6.mp4",
        path: "1738341933460-6.mp4",
        category: "motivation"
      },
      {
        name: "4.mp4",
        path: "1738341995515-4.mp4",
        category: "motivation"
      },
      {
        name: "giant-axe_video_hook.mp4",
        path: "1738342040705-giant-axe_video_hook.mp4",
        category: "hooks"
      }
    ];

    for (const clip of clips) {
          const filePath = path.resolve(uploadsDir, clip.path);
      console.log("Processing clip:", { name: clip.name, path: filePath });
      
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      if (!exists) {
        console.error(`File not found: ${filePath}`);
        continue;
      }

      const { stdout } = await execAsync(
        `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
      );
      const duration = parseFloat(stdout).toFixed(2);

      await db.insert(videoClips).values({
        name: clip.name,
        category: clip.category,
        url: `/uploads/${clip.path}`,
        duration: `${duration}s`,
      });
      console.log(`Registered clip: ${clip.name}`);
    }

    console.log("Clips registered successfully");
  } catch (error) {
    console.error("Error registering clips:", error);
  }
}

registerClips();

