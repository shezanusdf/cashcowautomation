import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";

export const videoClips = pgTable("video_clips", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // One of: motivation, gym, money, houses, women, cars, hooks
  url: text("url").notNull(),
  duration: text("duration").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const generatedVideos = pgTable("generated_videos", {
  id: serial("id").primaryKey(),
  script: text("script").notNull(),
  category: text("category").notNull(),
  useHook: boolean("use_hook").default(false).notNull(),
  status: text("status").notNull(), // pending, processing, completed, failed
  progress: integer("progress").default(0).notNull(),
  outputUrl: text("output_url"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVideoClipSchema = createInsertSchema(videoClips);
export const selectVideoClipSchema = createSelectSchema(videoClips);
export type InsertVideoClip = typeof videoClips.$inferInsert;
export type SelectVideoClip = typeof videoClips.$inferSelect;

export const insertGeneratedVideoSchema = createInsertSchema(generatedVideos);
export const selectGeneratedVideoSchema = createSelectSchema(generatedVideos);
export type InsertGeneratedVideo = typeof generatedVideos.$inferInsert;
export type SelectGeneratedVideo = typeof generatedVideos.$inferSelect;