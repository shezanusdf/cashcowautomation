import type { Express } from "express";
import { createServer } from "http";
import { db } from "@db";
import path from "path";
import express from 'express';
import { execAsync } from './utils';
import { videoClips, generatedVideos } from "@db/schema";
import type { SelectVideoClip, SelectGeneratedVideo } from "@db/schema";
import { eq, inArray } from "drizzle-orm";
import * as schema from "@db/schema";
import type { DrizzleTypeError } from "drizzle-orm";
import { type PgTableFn } from 'drizzle-orm/pg-core';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize db with schema type
declare module '@db' {
  interface Db {
    query: {
        videoClips: typeof schema.videoClips;
        generatedVideos: typeof schema.generatedVideos;
    }
  }
}

import type { PgColumn } from 'drizzle-orm/pg-core';
import multer from "multer";
import fs from "fs/promises";



function debugLog(message: string, data?: any) {
  console.log(`[DEBUG] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
}


// FFmpeg paths
const ffmpegPath = path.resolve(process.cwd(), 'ffmpeg', 'ffmpeg-7.1-essentials_build', 'bin', 'ffmpeg.exe');
const ffprobePath = path.resolve(process.cwd(), 'ffmpeg', 'ffmpeg-7.1-essentials_build', 'bin', 'ffprobe.exe');

// Create required directories
async function ensureDirectoriesExist() {
  const dirs = [
    path.resolve(process.cwd(), "uploads"),
    path.resolve(process.cwd(), "public", "videos"),
    path.resolve(process.cwd(), "tmp")
  ];
  
  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true });
    console.log(`Ensured directory exists: ${dir}`);
  }
}

// Configure multer for video uploads
const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureDirectoriesExist().catch(console.error);
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files are allowed"));
    }
  },
});

async function checkFFmpeg() {
  try {
    console.log('Checking FFmpeg at path:', ffmpegPath);
    if (!await fileExists(ffmpegPath)) {
      console.error('FFmpeg executable not found at:', ffmpegPath);
      return false;
    }
    const { stdout, stderr } = await execAsync(`"${ffmpegPath}" -version`);
    console.log('FFmpeg version output:', stdout);
    if (stderr) {
      console.warn('FFmpeg stderr:', stderr);
    }
    return true;
  } catch (error) {
    console.error('FFmpeg check error:', {
      error: error instanceof Error ? error.message : String(error),
      command: `"${ffmpegPath}" -version`,
      cwd: process.cwd(),
      ffmpegPath,
      exists: await fileExists(ffmpegPath)
    });
    return false;
  }
}

async function generateVoiceover(text: string, outputPath: string) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");

  // Generate raw voiceover
  const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB/stream', {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.8, similarity_boost: 0.8 }
    })
  });

  if (!response.ok) throw new Error(`ElevenLabs API error: ${await response.text()}`);

  // Save raw audio
  const rawPath = outputPath.replace('.m4a', '.mp3');
  await fs.writeFile(rawPath, Buffer.from(await response.arrayBuffer()));

  // Convert to M4A using AAC codec
  await execAsync(`"${ffmpegPath}" -i "${rawPath}" -vn -acodec aac -b:a 128k "${outputPath}"`);
  
  // Cleanup
  await fs.unlink(rawPath);
}

async function updateGenerationProgress(id: number, progress: number, status: string) {
  console.log(`Updating progress: ${progress}% (${status})`);
  await db
    .update(generatedVideos)
    .set({ status, progress })
    .where(eq(generatedVideos.id, id));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function shuffleArray<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function getClipDuration(filePath: string): Promise<number> {
  const { stdout } = await execAsync(
    `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
  );
  return parseFloat(stdout);
}

async function generateVideo(
  id: number,
  category: string | string[],
  script: string,
  useHook: boolean,
  totalLength: number,
  clipDuration: number
) {
  await updateGenerationProgress(id, 0, "pending");
  console.log("Starting video generation, ID:", id);

  const logAndUpdate = async (message: string, progress: number, status: string) => {
    debugLog(`[Video ${id}] ${message}`);
    await updateGenerationProgress(id, progress, status);
  };

  try {
    console.log("Starting video generation with params:", { id, category, script, useHook, totalLength, clipDuration });
    
    const tmpDir = path.resolve(process.cwd(), "tmp", id.toString());
    console.log("Using tmp directory:", tmpDir);

    // Create directories
    await fs.mkdir(tmpDir, { recursive: true });
    console.log("Created tmp directory");

    // Get clips
    const clips = await (db.query as any).videoClips.findMany({
      where: Array.isArray(category) 
        ? inArray(videoClips.category, category) 
        : eq(videoClips.category, category),
    }) as SelectVideoClip[];
    console.log(`Found ${clips.length} clips for category '${category}':`, clips);

    if (clips.length === 0) {
      console.error(`No clips found for category: ${category}`);
      throw new Error(`No clips found for category: ${category}`);
    }

    // Create concat file
    const concatFile = path.resolve(tmpDir, "concat.txt");
    console.log("Creating concat file at:", concatFile);
    
    const concatContent = clips
      .map((clip: SelectVideoClip) => `file '${path.resolve(process.cwd(), clip.url.replace(/^\//, ''))}'`)
      .join("\n");
    console.log("Concat file content:", concatContent);

    await fs.writeFile(concatFile, concatContent);
    console.log("Wrote concat file");

    // Ensure all required directories exist
    const publicVideosDir = path.join(__dirname, "../public/videos");
    const uploadsDir = path.resolve(process.cwd(), "uploads");

    // Verify other directories were created
    const publicExists = await fileExists(publicVideosDir);
    const uploadsExists = await fileExists(uploadsDir);

    debugLog("Directory creation status:", {
      publicVideosDir: { path: publicVideosDir, exists: publicExists },
      uploadsDir: { path: uploadsDir, exists: uploadsExists }
    });

    if (!publicExists || !uploadsExists) {
      throw new Error("Failed to create required directories");
    }

    await logAndUpdate("Starting video generation", 0, "processing");

    // Check FFmpeg installation
    const ffmpegInstalled = await checkFFmpeg();
    if (!ffmpegInstalled) {
      throw new Error(`FFmpeg check failed. FFmpeg path: ${ffmpegPath}`);
    }
    debugLog("FFmpeg check passed successfully");

    // Initialize clips array
    let clipsArray: { type: 'hook' | 'main', path: string }[] = [];

    // Declare hookDelay at the start so it's available later
    let hookDelay = 0;
    // Get and validate hook clip if needed
    if (useHook) {
      await logAndUpdate("Looking for hook clips", 10, "processing");
      console.log("\n=== Hook Clip Search ===");
      console.log("Searching for category: hooks");
      
        const hookClips = await (db.query as any).videoClips.findMany({
          where: eq(videoClips.category, 'hooks'),
          orderBy: (table: { createdAt: PgColumn }, { desc }: { desc: (col: PgColumn) => any }) => 
          [desc(table.createdAt)],
        }) as SelectVideoClip[];
      console.log(`Found ${hookClips.length} hook clips in database:`, hookClips);

      console.log("\n=== Hook Clip Verification ===");
      for (const clip of hookClips) {
        const filePath = path.join(process.cwd(), clip.url.replace(/^\//, ''));
        console.log("Checking hook clip path:", filePath);
        const exists = await fileExists(filePath);
        console.log("File exists?", exists);
        if (exists) {
          console.log(`Selected hook clip: ${clip.name} (${clip.url})`);
          hookDelay = await getClipDuration(filePath);
          console.log("Hook clip duration (seconds):", hookDelay);
          clipsArray.push({ type: 'hook', path: filePath });
          break;
        } else {
          console.log(`Hook clip file not found: ${filePath}`);
        }
      }

      if (!clipsArray.length && hookClips.length > 0) {
        console.log("No valid hook clips found on disk");
      }
    } else {
      console.log("useHook is false, skipping hook clips");
    }

    // Get main clips for the selected category or categories
    await logAndUpdate("Getting main clips", 15, "processing");
    let selectedClips: SelectVideoClip[] = [];
    if (Array.isArray(category)) {
      for (const cat of category) {
        console.log("\n=== Main Clips Search for category:", cat, "===");
        const categoryClips = await (db.query as any).videoClips.findMany({
          where: eq(videoClips.category, cat),
          orderBy: (table: { createdAt: PgColumn }, { desc }: { desc: (col: PgColumn) => any }) => [desc(table.createdAt)],
        }) as SelectVideoClip[];
        console.log(`Found ${categoryClips.length} clips for category ${cat}`);
        if (categoryClips.length === 0) {
          console.log(`No clips available for category: ${cat}`);
          continue;
        }

        const validClips: SelectVideoClip[] = [];
        for (const clip of categoryClips) {
          const filePath = path.resolve(process.cwd(), clip.url.replace(/^\//, ''));
          if (await fileExists(filePath)) {
            validClips.push(clip);
          } else {
            console.log(`Clip not found for ${cat}: ${filePath}`);
          }
        }

        if (validClips.length === 0) {
          console.log(`No valid clips found for category: ${cat}`);
          continue;
        }

        selectedClips.push(...validClips);
      }
    } else {
      console.log("\n=== Main Clips Search for category:", category, "===");
      const categoryClips = await (db.query as any).videoClips.findMany({
      where: eq(videoClips.category, category),
        orderBy: (table: { createdAt: PgColumn }, { desc }: { desc: (col: PgColumn) => any }) => [desc(table.createdAt)],
    }) as SelectVideoClip[];
      if (categoryClips.length === 0) {
        throw new Error(`No clips available for category: ${category}`);
      }
      const validClips: SelectVideoClip[] = [];
      for (const clip of categoryClips) {
      const filePath = path.resolve(process.cwd(), clip.url.replace(/^\//, ''));
        if (await fileExists(filePath)) {
          validClips.push(clip);
        } else {
          console.log(`Clip not found for ${category}: ${filePath}`);
        }
      }
      if (validClips.length === 0) {
        throw new Error(`No valid clips found for category: ${category}`);
      }
      selectedClips = validClips;
    }

    // Calculate number of clips required
    const requiredClipsCount = useHook && hookDelay < totalLength 
       ? Math.ceil((totalLength - hookDelay) / clipDuration) 
       : Math.ceil(totalLength / clipDuration);
    if (selectedClips.length < requiredClipsCount) {
      throw new Error(`Not enough clips available. Required ${requiredClipsCount} clips, but only found ${selectedClips.length}.`);
    }

    // Randomly select exactly the required count
    selectedClips = shuffleArray(selectedClips).slice(0, requiredClipsCount);

    // Trim each selected clip to the clipDuration (using FFmpeg)
    const trimmedClips: { type: 'main', path: string }[] = [];
    for (let i = 0; i < selectedClips.length; i++) {
      const clip = selectedClips[i];
      const inputPath = path.resolve(process.cwd(), clip.url.replace(/^\//, ''));
      const outputPath = path.resolve(tmpDir, `trimmed-${i}.mp4`);
      const trimCommand = `"${ffmpegPath}" -i "${inputPath}" -t ${clipDuration} -vf "setpts=PTS-STARTPTS" -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k "${outputPath}"`;
      console.log(`Trimming clip ${i + 1}: ${trimCommand}`);
      const { stdout, stderr } = await execAsync(trimCommand);
      if (stderr) console.warn(`FFmpeg trim stderr: ${stderr}`);
      trimmedClips.push({ type: 'main', path: outputPath });
    }

    // Use trimmed clips for final concatenation
    clipsArray.push(...trimmedClips);

    if (!clipsArray.some(c => c.type === 'main')) {
      throw new Error("No valid main clips found for selected categories");
    }

    console.log("\n=== Final Clips Summary ===");
    console.log(`Total clips to process: ${clipsArray.length} (${clipsArray.filter(c => c.type === 'hook').length} hook, ${clipsArray.filter(c => c.type === 'main').length} main)`);

    // Generate voiceover
    await logAndUpdate("Generating voiceover", 25, "processing");
    const voiceoverPath = path.resolve(tmpDir, "voiceover.m4a");
    debugLog("Generating voiceover at:", voiceoverPath);

    try {
      await generateVoiceover(script, voiceoverPath);
    } catch (error) {
      console.error("Voiceover generation error:", error);
      throw new Error(`Failed to generate voiceover: ${error instanceof Error ? error.message : String(error)}`);
    }

    // ===============================================================
    // Replace previous multi‑step final processing with one ffmpeg command
    // ===============================================================
    let finalOutput: string;
    if (useHook && clipsArray.some(c => c.type === 'hook')) {
      const hookClip = clipsArray.find(c => c.type === 'hook');
      if (!hookClip) {
        throw new Error("Hook clip not found despite useHook being true.");
      }
      if (trimmedClips.length === 0) {
        throw new Error("No main clips available for generating the video.");
      }
      // Build inputs: hook clip as first input, then all trimmed main clips, then the voiceover file
      const inputs = [];
      // Input 0: hook video
      inputs.push(`-i "${hookClip.path}"`);
      // Next inputs: all trimmed main clips (order is preserved)
      trimmedClips.forEach(clip => {
        inputs.push(`-i "${clip.path}"`);
      });
      // Final input: voiceover file
      inputs.push(`-i "${voiceoverPath}"`);
      const inputStr = inputs.join(" ");

      // Set fixed durations: hookDuration is 4 seconds, and voiceover duration is totalLength - 4 seconds.
      const hookDuration = 4;
      const voDuration = totalLength - hookDuration;
      // Total video segments count: hook clip + all trimmed main clips.
      const nSegments = trimmedClips.length + 1;

      // Build the filter_complex string.
      // Video part: reset pts for hook and each main clip then concat them.
      const filterParts = [];
      filterParts.push(`[0:v]setpts=PTS-STARTPTS[hookv]`);
      trimmedClips.forEach((clip, idx) => {
        // Force main clips to 1080x1920 to match the hook clip
        filterParts.push(`[${idx+1}:v]setpts=PTS-STARTPTS,scale=1080:1920[clip${idx+1}v]`);
      });
      // Concatenate video streams ([hookv] + scaled main clips)
      const videoConcatInputs = `[hookv]` + trimmedClips.map((_, idx) => `[clip${idx+1}v]`).join("");
      filterParts.push(`${videoConcatInputs}concat=n=${nSegments}:v=1:a=0[vout]`);

      // Audio part:
      // Trim hook audio from input 0 to 4 seconds.
      filterParts.push(`[0:a]atrim=duration=${hookDuration},asetpts=PTS-STARTPTS[hooka]`);
      // Trim voiceover from the last input (index = trimmedClips.length + 1) to the remaining duration.
      filterParts.push(`[${trimmedClips.length+1}:a]atrim=duration=${voDuration},asetpts=PTS-STARTPTS[voa]`);
      // Concatenate the two audio segments.
      filterParts.push(`[hooka][voa]concat=n=2:v=0:a=1[aout]`);

      const filterComplex = filterParts.join("; ");

      finalOutput = path.resolve(publicVideosDir, `${id}_final.mp4`);
      const finalCmd = `"${ffmpegPath}" ${inputStr} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -c:a aac -b:a 192k -movflags +faststart "${finalOutput}"`;
      console.log("Executing final ffmpeg command:", finalCmd);
      await execAsync(finalCmd);
    } else {
      // Fallback for non-hook scenarios (if needed) – you may insert your existing logic here.
      throw new Error("Non-hook video generation is not implemented in the new command.");
    }

    // Update the final output to be the video with voiceover
    // (Ensure you update the database with the new file name)
    await db
      .update(generatedVideos)
      .set({ 
        status: "completed", 
        progress: 100,
        outputUrl: `/videos/${path.basename(finalOutput)}`
      })
      .where(eq(generatedVideos.id, id));

    console.log(`Video ${id} generated successfully with voiceover`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLog("Video generation failed:", {
      error: errorMessage,
      category,
      useHook,
      workingDir: process.cwd(),
      ffmpegPath,
      ffprobePath,
      tmpDir: path.resolve(process.cwd(), "tmp", id.toString())
    });
    
    await db
      .update(generatedVideos)
      .set({ 
        status: "failed",
        progress: 0,
        error: errorMessage
      })
      .where(eq(generatedVideos.id, id));

    throw error;
  }
}

export function registerRoutes(app: Express) {
  const httpServer = createServer(app);

  // Ensure directories exist on startup
  ensureDirectoriesExist().catch(console.error);

  // Get all clips
  app.get("/api/clips", async (_req, res) => {
    try {
      if (!db) {
        throw new Error("Database not initialized");
      }

        const clips = await (db.query as any).videoClips.findMany({
        orderBy: (table: { createdAt: PgColumn }, { desc }: { desc: (col: PgColumn) => any }) => 
          [desc(table.createdAt)],
        }) as SelectVideoClip[];

      const baseUrl = `${process.env.SERVER_URL || 'http://localhost:5000'}`;
      res.json(clips.map(clip => ({
        ...clip,
        url: `${baseUrl}${clip.url}`
      })));
    } catch (error) {
      console.error("Error fetching clips:", error);
      res.status(500).json({ error: "Failed to fetch clips" });
    }
  });

  // Get video generation status
  app.get("/api/videos/status/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
        const video = await (db.query as any).generatedVideos.findFirst({
        where: eq(generatedVideos.id, id),
        }) as SelectGeneratedVideo | null;

      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }

      // Ensure all required fields are present
      res.json({
        id: video.id,
        status: video.status || "pending",
        progress: video.progress || 0,
        error: video.error || null,
        outputUrl: video.status === "completed" ? video.outputUrl : null
      });
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({ message: "Failed to check status" });
    }
  });

  // Upload a new clip
  app.post("/api/clips/upload", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      const category = req.body.category;

      console.log("Processing upload:", {
        file: file?.originalname,
        category,
        path: file?.path
      });

      if (!file || !category) {
        return res.status(400).json({
          message: "File and category are required",
          received: { file: !!file, category: !!category },
        });
      }

      // Get video duration using ffprobe
      const { stdout, stderr } = await execAsync(
        `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file.path}"`
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
          url: `/uploads/${file.filename}`,
          duration: `${duration}s`,
        })
        .returning() as SelectVideoClip[];

      console.log("Saved clip to database:", clip[0]);

      res.json(clip[0]);
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({
        message: "Failed to process video",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Add CORS headers for video serving
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Range');
    next();
  });

  // Serve uploaded files and generated videos
  app.use("/uploads", (req, _res, next) => {
    console.log("Upload request:", {
      url: req.url,
      path: path.resolve(process.cwd(), "uploads", req.url)
    });
    next();
  }, express.static(path.resolve(process.cwd(), "uploads"), {
    setHeaders: (res) => {
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }
  }));

  app.use("/videos", (req, _res, next) => {
    debugLog("Video request:", {
      url: req.url,
      method: req.method,
      headers: req.headers,
      path: path.join(__dirname, "../public/videos", req.url.split('?')[0])
    });
    next();
  }, express.static(path.join(__dirname, "../public/videos"), {
    setHeaders: (res, filePath) => {
      debugLog("Setting video headers:", { filePath });
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      
      if (res.req.url.includes('download=true')) {
        const filename = path.basename(filePath).split('?')[0];
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        debugLog("Setting download headers for:", filename);
      } else {
        res.setHeader('Content-Disposition', 'inline');
      }
    }
  }));

  // Delete clip route
  app.delete("/api/clips/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get clip info before deletion
        const clip = await (db.query as any).videoClips.findFirst({
        where: eq(videoClips.id, id),
        }) as SelectVideoClip | null;

      if (!clip) {
        return res.status(404).json({ error: "Clip not found" });
      }

      // Delete from database
      await db.delete(videoClips).where(eq(videoClips.id, id));

      // Delete file from uploads folder
      const filePath = path.resolve(process.cwd(), clip.url.replace(/^\//, ''));
      await fs.unlink(filePath).catch(console.error);

      res.json({ message: "Clip deleted successfully" });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: "Failed to delete clip" });
    }
  });

  // Generate video route
  app.post("/api/videos/generate", async (req, res) => {
    try {
      const { category, script, useHook, totalLength, clipDuration } = req.body;
      console.log("\n=== Starting Video Generation ===");
      console.log("Request params:", { category, script, useHook: !!useHook, totalLength, clipDuration });

      // Validate database connection first
      try {
        await (db.query as any).videoClips.findFirst();
      } catch (dbError) {
        console.error('Database connection error:', dbError);
        return res.status(503).json({ 
          error: "Database service unavailable. Please try again later." 
        });
      }

      // Rest of your generation code...
      const video = await db
        .insert(generatedVideos)
        .values({
          category,
          script,
          useHook: !!useHook,
          status: "pending",
          progress: 0
        })
        .returning();

      res.json(video[0]);

      // Add baseUrl to the call
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      // Start generation in background
        generateVideo(video[0].id, category, script, !!useHook, Number(totalLength), Number(clipDuration))
        .catch(error => {
          console.error("Video generation failed:", error);
          updateGenerationProgress(video[0].id, 0, "failed")
            .catch(console.error);
        });

    } catch (error) {
      console.error('Video generation error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to start video generation" 
      });
    }
  });

  // Add a new route to check and fix video libraries
  app.get("/api/clips/fix", async (_req, res) => {
    try {
      // 1. Get all files in uploads directory
      const uploadsDir = path.resolve(process.cwd(), "uploads");
      const files = await fs.readdir(uploadsDir);
      
      console.log("\n=== Files in uploads directory ===");
      console.log(files);

      // 2. Get all clips in database
        const dbClips = await (db.query as any).videoClips.findMany() as SelectVideoClip[];
      console.log("\n=== Clips in database ===");
      console.log(dbClips);

      // 3. For each file that's not in DB, add it
      for (const file of files) {
        const existingClip = dbClips.find(clip => clip.url.includes(file));
        if (!existingClip) {
          const filePath = path.join(uploadsDir, file);
          // Get duration using ffprobe
          const { stdout } = await execAsync(
            `"${ffprobePath}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
          );
          const duration = parseFloat(stdout).toFixed(2);

          // Add to database (assuming it's a hooks video - adjust category as needed)
          const clip = await db
            .insert(videoClips)
            .values({
              name: file,
              category: 'hooks', // You can change this default category
              url: `/uploads/${file}`,
              duration: `${duration}s`,
            })
            .returning();

          console.log(`Added clip to database:`, clip[0]);
        }
      }

      res.json({ message: "Libraries checked and fixed", files, dbClips });
    } catch (error) {
      console.error("Error fixing libraries:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Add at the top of registerRoutes function
  app.get("/api/*", (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    console.log("API request:", _req.path);
    next();
  });

  // Serve static files
  app.use(express.static(path.resolve(process.cwd(), "client/build")));
  
  // Handle client-side routing
  app.get("*", (req, res) => {
    console.log("Serving index.html for path:", req.path);
    res.sendFile(path.resolve(process.cwd(), "client/build/index.html"));
  });

  return httpServer;
}