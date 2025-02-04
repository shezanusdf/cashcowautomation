import express, { type Express } from "express";
import path from "path";
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { generatedVideos } from '../db/schema';
import type { SelectVideoClip, SelectGeneratedVideo } from '../db/schema';
import type { PgColumn } from 'drizzle-orm/pg-core';

export function serveStatic(app: Express) {
  app.get("/api/videos/status/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
        const video = await (db.query as any).generatedVideos.findFirst({
        where: eq(generatedVideos.id, id),
      }) as SelectGeneratedVideo | null;
      
      if (!video) {
        return res.status(404).json({ error: "Video not found" });
      }
      
      res.json({
        id: video.id,
        status: video.status,
        progress: video.progress,
        error: video.error
      });
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({ error: "Failed to check status" });
    }
  });

  app.get("/api/clips", async (_req, res) => {
    try {
        const clips = await (db.query as any).videoClips.findMany({
        orderBy: (table: { createdAt: PgColumn }, { desc }: { desc: (col: PgColumn) => any }) => 
          [desc(table.createdAt)],
      }) as SelectVideoClip[];
      res.json(clips);
    } catch (error) {
      console.error("Error fetching clips:", error);
      res.status(500).json({ error: "Failed to fetch clips" });
    }
  });

  app.use(express.static(path.resolve(process.cwd(), "dist")));
  app.use('/videos', express.static(path.resolve(process.cwd(), "public", "videos")));
  app.use('/uploads', express.static(path.resolve(process.cwd(), "uploads")));
  
  app.get("*", (_req, res) => {
    res.sendFile(path.resolve(process.cwd(), "dist", "index.html"));
  });
}
