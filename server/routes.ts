import type { Express } from "express";
import { createServer } from "http";
import { db } from "@db";
import { videoClips, generatedVideos } from "@db/schema";
import { eq } from "drizzle-orm";
import multer from "multer";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const upload = multer({ dest: "uploads/" });

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Get all clips
  app.get("/api/clips", async (_req, res) => {
    const clips = await db.query.videoClips.findMany({
      orderBy: (clips, { desc }) => [desc(clips.createdAt)],
    });
    res.json(clips);
  });

  // Upload a new clip
  app.post("/api/clips/upload", upload.single("file"), async (req, res) => {
    const file = req.file;
    const category = req.body.category;

    if (!file || !category) {
      return res.status(400).json({ message: "File and category are required" });
    }

    try {
      // Get video duration using ffmpeg
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${file.path}`
      );
      const duration = parseFloat(stdout).toFixed(2);

      // Store clip metadata in database
      const clip = await db.insert(videoClips).values({
        name: file.originalname,
        category,
        url: file.path, // In production, this would be a cloud storage URL
        duration: `${duration}s`,
      }).returning();

      res.json(clip[0]);
    } catch (error) {
      res.status(500).json({ message: "Failed to process video" });
    }
  });

  // Delete a clip
  app.delete("/api/clips/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    
    try {
      const clip = await db.query.videoClips.findFirst({
        where: eq(videoClips.id, id),
      });

      if (!clip) {
        return res.status(404).json({ message: "Clip not found" });
      }

      // Delete file
      await fs.unlink(clip.url);

      // Delete from database
      await db.delete(videoClips).where(eq(videoClips.id, id));
      
      res.json({ message: "Clip deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete clip" });
    }
  });

  // Generate video
  app.post("/api/videos/generate", async (req, res) => {
    const { category, script, useHook } = req.body;

    try {
      // Create generation record
      const video = await db.insert(generatedVideos).values({
        category,
        script,
        useHook,
        status: "pending",
      }).returning();

      // Start async video generation
      generateVideo(video[0].id, category, script, useHook).catch(console.error);

      res.json(video[0]);
    } catch (error) {
      res.status(500).json({ message: "Failed to start video generation" });
    }
  });

  return httpServer;
}

async function generateVideo(
  id: number,
  category: string,
  script: string,
  useHook: boolean
) {
  try {
    // Update status to processing
    await db.update(generatedVideos)
      .set({ status: "processing" })
      .where(eq(generatedVideos.id, id));

    // Get clips for category
    const clips = await db.query.videoClips.findMany({
      where: eq(videoClips.category, category),
    });

    if (clips.length === 0) {
      throw new Error("No clips available for category");
    }

    // Create temporary directory for processing
    const tmpDir = path.join("tmp", id.toString());
    await fs.mkdir(tmpDir, { recursive: true });

    // Create concat file
    const concatFile = path.join(tmpDir, "concat.txt");
    await fs.writeFile(
      concatFile,
      clips.map(clip => `file '${path.resolve(clip.url)}'`).join("\n")
    );

    // Concatenate videos
    const outputVideo = path.join(tmpDir, "output.mp4");
    await execAsync(`ffmpeg -f concat -safe 0 -i ${concatFile} -c copy ${outputVideo}`);

    // Generate voiceover using ElevenLabs
    // This is a placeholder - implement ElevenLabs API call
    const voiceoverPath = path.join(tmpDir, "voiceover.mp3");
    // await generateVoiceover(script, voiceoverPath);

    // Combine video and audio
    const finalOutput = path.join("public/videos", `${id}.mp4`);
    await execAsync(
      `ffmpeg -i ${outputVideo} -i ${voiceoverPath} -c:v copy -c:a aac ${finalOutput}`
    );

    // Update status to completed
    await db.update(generatedVideos)
      .set({ status: "completed", outputUrl: finalOutput })
      .where(eq(generatedVideos.id, id));

    // Cleanup
    await fs.rm(tmpDir, { recursive: true });
  } catch (error) {
    // Update status to failed
    await db.update(generatedVideos)
      .set({ 
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      })
      .where(eq(generatedVideos.id, id));
  }
}
