import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  console.log('Setting up Vite...');
  try {
    const vite = await createViteServer({
      ...viteConfig,
      configFile: false,
      customLogger: {
        info: (msg: string) => {
          console.log('[Vite Info]', msg);
        },
        warn: (msg: string) => {
          console.warn('[Vite Warning]', msg);
        },
        error: (msg: string, options?: any) => {
          console.error('[Vite Error]', msg);
          process.exit(1);
        },
        warnOnce: (msg: string) => {
          console.warn('[Vite Warn Once]', msg);
        },
        clearScreen: () => {},
        hasErrorLogged:() => false,
        hasWarned: false,
      },
      server: {
        middlewareMode: true,
        hmr: { server },
      },
      appType: "custom",
    });
    console.log('Vite server created successfully');
    app.use(vite.middlewares);
    console.log('Vite middleware applied');
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;

      try {
        const clientTemplate = path.resolve(
          __dirname,
          "..",
          "client",
          "index.html",
        );
        console.log(`Processing request for URL: ${url}`);
        // always reload the index.html file from disk incase it changes
        let template = await fs.promises.readFile(clientTemplate, "utf-8");
        template = template.replace(`src="/src/main.tsx"`, `src="/src/main.tsx?v=${nanoid()}"`)
        const page = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(page);
        console.log(`Successfully served page for URL: ${url}`);
      } catch (e) {
        console.error(`Error processing request for URL ${url}:`, e);
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } catch (error) {
    console.error('Error setting up Vite:', error);
    throw error;
  }
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
