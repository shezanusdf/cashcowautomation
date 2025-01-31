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
import express from 'express';

const execAsync = promisify(exec);

// Create required directories
async function ensureDirectoriesExist() {
  await fs.mkdir("uploads", { recursive: true });
  await fs.mkdir("public/videos", { recursive: true });
  await fs.mkdir("tmp", { recursive: true });
}

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await ensureDirectoriesExist().catch(console.error);
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
});

async function generateVoiceover(text: string, outputPath: string) {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY is not set');
  }

  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/adam/stream', {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to generate voiceover: ${errorText}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
}

async function updateGenerationProgress(id: number, progress: number, status: string) {
  await db
    .update(generatedVideos)
    .set({ status, progress })
    .where(eq(generatedVideos.id, id));
}

async function generateVideo(
  id: number,
  category: string,
  script: string,
  useHook: boolean
) {
  const logAndUpdate = async (message: string, progress: number, status: string) => {
    console.log(`[Video ${id}] ${message}`);
    await updateGenerationProgress(id, progress, status);
  };

  try {
    await logAndUpdate("Starting video generation", 0, "processing");

    // Get main clips for category
    const mainClips = await db.query.videoClips.findMany({
      where: eq(videoClips.category, category),
    });

    if (mainClips.length === 0) {
      throw new Error("No clips available for category");
    }

    let allClips = [...mainClips];
    console.log(`Found ${mainClips.length} main clips for category ${category}`);

    // Get hook clip if needed
    if (useHook) {
      await logAndUpdate("Looking for hook clips", 10, "processing");
      const hookClips = await db.query.videoClips.findMany({
        where: eq(videoClips.category, 'hooks'),
      });

      console.log(`Found ${hookClips.length} hook clips`);

      if (hookClips.length > 0) {
        // Add a random hook clip to the beginning
        const randomHook = hookClips[Math.floor(Math.random() * hookClips.length)];
        allClips = [randomHook, ...mainClips];
        console.log(`Added hook clip: ${randomHook.name} to the beginning`);
      } else {
        console.log("No hook clips found");
      }
    }

    await logAndUpdate("Creating temporary directory", 20, "processing");

    // Create temporary directory for processing
    const tmpDir = path.join("tmp", id.toString());
    await fs.mkdir(tmpDir, { recursive: true });

    // First generate voiceover
    await logAndUpdate("Generating voiceover", 30, "processing");
    const voiceoverPath = path.join(tmpDir, "voiceover.mp3");

    try {
      await generateVoiceover(script, voiceoverPath);
    } catch (error) {
      console.error("Voiceover generation error:", error);
      throw new Error(`Failed to generate voiceover: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Verify voiceover file exists
    try {
      await fs.access(voiceoverPath);
      console.log(`Voiceover file created at: ${voiceoverPath}`);
    } catch (error) {
      throw new Error(`Voiceover file not found at ${voiceoverPath}`);
    }

    await logAndUpdate("Processing clips with voiceover", 40, "processing");

    // Create intermediate files for each clip with voiceover
    const processedClips = await Promise.all(allClips.map(async (clip, index) => {
      const outputPath = path.join(tmpDir, `processed_${index}.mp4`);
      const inputPath = path.join(process.cwd(), clip.url.replace(/^\//, ''));

      // Verify input clip exists
      try {
        await fs.access(inputPath);
        console.log(`Processing clip: ${inputPath}`);
      } catch (error) {
        throw new Error(`Input clip not found: ${inputPath}`);
      }

      // Add voiceover to each clip
      try {
        await execAsync(
          `ffmpeg -i "${inputPath}" -i "${voiceoverPath}" -c:v copy -c:a aac -shortest "${outputPath}"`
        );
        console.log(`Successfully processed clip ${index + 1}/${allClips.length}`);
        return outputPath;
      } catch (error) {
        console.error(`Error processing clip ${index + 1}:`, error);
        throw new Error(`Failed to process clip ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }));

    await logAndUpdate("Creating concat file", 60, "processing");

    // Create concat file with processed clips
    const concatFile = path.join(tmpDir, "concat.txt");
    const concatContent = processedClips
      .map(clipPath => `file '${clipPath}'`)
      .join("\n");

    try {
      await fs.writeFile(concatFile, concatContent);
      console.log("Concat file content:", concatContent);
    } catch (error) {
      throw new Error(`Failed to create concat file: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Verify concat file exists and has content
    try {
      const content = await fs.readFile(concatFile, 'utf-8');
      if (!content.trim()) {
        throw new Error('Concat file is empty');
      }
      console.log('Concat file verified with content');
    } catch (error) {
      throw new Error(`Concat file verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    await logAndUpdate("Concatenating clips", 80, "processing");

    // Concatenate all processed clips
    const finalOutputPath = path.join("public/videos", `${id}.mp4`);
    const concatCommand = `ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${finalOutputPath}"`;
    console.log("Running concat command:", concatCommand);

    try {
      await execAsync(concatCommand);
      console.log("Successfully concatenated all clips");
    } catch (error) {
      throw new Error(`Failed to concatenate clips: ${error instanceof Error ? error.message : String(error)}`);
    }

    await logAndUpdate("Cleaning up", 90, "processing");

    // Clean up temporary files
    try {
      await fs.rm(tmpDir, { recursive: true });
      console.log("Cleaned up temporary files");
    } catch (error) {
      console.error("Cleanup error:", error);
      // Don't throw here as the video generation was successful
    }

    // Update status to completed with 100% progress
    await db
      .update(generatedVideos)
      .set({ 
        status: "completed", 
        progress: 100,
        outputUrl: `/videos/${path.basename(finalOutputPath)}` 
      })
      .where(eq(generatedVideos.id, id));

    console.log("Video generation completed successfully");

  } catch (error) {
    console.error("Video generation error:", error);
    await db
      .update(generatedVideos)
      .set({
        status: "failed",
        progress: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      .where(eq(generatedVideos.id, id));
    throw error; // Re-throw to be handled by the API route
  }
}

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Ensure directories exist on startup
  ensureDirectoriesExist().catch(console.error);

  // Get all clips
  app.get("/api/clips", async (_req, res) => {
    const clips = await db.query.videoClips.findMany({
      orderBy: (clips, { desc }) => [desc(clips.createdAt)],
    });
    res.json(clips);
  });

  // Get video generation status
  app.get("/api/videos/status/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const video = await db.query.generatedVideos.findFirst({
      where: eq(generatedVideos.id, id),
    });

    if (!video) {
      return res.status(404).json({ message: "Video not found" });
    }

    res.json(video);
  });

  // Upload a new clip
  app.post("/api/clips/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      const category = req.body.category;

      if (!file || !category) {
        return res.status(400).json({
          message: "File and category are required",
          received: {
            file: !!file,
            category: !!category,
          },
        });
      }

      // Get video duration using ffprobe
      const { stdout, stderr } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file.path}"`
      );

      if (stderr) {
        console.error("FFprobe stderr:", stderr);
      }

      const duration = parseFloat(stdout).toFixed(2);

      // Store clip metadata in database
      const clip = await db
        .insert(videoClips)
        .values({
          name: file.originalname,
          category,
          url: `/uploads/${path.basename(file.path)}`,
          duration: `${duration}s`,
        })
        .returning();

      res.json(clip[0]);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({
        message: "Failed to process video",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Serve uploaded files and generated videos
  app.use("/uploads", express.static("uploads"));
  app.use("/videos", express.static("public/videos"));

  // Delete clip route
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
      const filePath = path.join(process.cwd(), clip.url.replace(/^\//, ''));
      await fs.unlink(filePath);

      // Delete from database
      await db.delete(videoClips).where(eq(videoClips.id, id));

      res.json({ message: "Clip deleted successfully" });
    } catch (error) {
      console.error("Delete error:", error);
      res.status(500).json({ message: "Failed to delete clip" });
    }
  });

  // Generate video route
  app.post("/api/videos/generate", async (req, res) => {
    const { category, script, useHook } = req.body;

    try {
      // Create generation record
      const video = await db
        .insert(generatedVideos)
        .values({
          category,
          script,
          useHook,
          status: "pending",
          progress: 0
        })
        .returning();

      // Start async video generation
      generateVideo(video[0].id, category, script, useHook).catch(console.error);

      res.json(video[0]);
    } catch (error) {
      console.error("Generation error:", error);
      res.status(500).json({ message: "Failed to start video generation" });
    }
  });

  return httpServer;
}