import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

console.log("--- SERVER.TS INITIALIZING ---");
console.log("NODE_ENV:", process.env.NODE_ENV);

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Configure multer for memory storage
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logger middleware
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // In-memory store for PDF context
  const pdfContexts = new Map<string, string>();

  // API Endpoints
  app.get("/api/status", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  app.post("/api/upload-pdf", upload.single("pdf"), async (req, res) => {
    console.log("POST /api/upload-pdf hit");
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ error: "Only PDF files are supported" });
      }

      // Robust PDF parsing logic to handle different versions of pdf-parse
      let text = "";
      let pageCount = 0;

      try {
        const pdfModule = await import("pdf-parse") as any;
        
        if (pdfModule.PDFParse) {
          // Modern class-based API (found in some 2.x versions)
          console.log("Using PDFParse class API");
          const parser = new pdfModule.PDFParse({ data: req.file.buffer });
          const result = await parser.getText();
          text = result.text;
          pageCount = result.total;
        } else {
          // Traditional function-based API
          console.log("Using function-based PDF API");
          let pdfParser = pdfModule.default || pdfModule;
          
          // Handle cases where it's nested further
          if (typeof pdfParser !== 'function' && pdfParser?.default) {
            pdfParser = pdfParser.default;
          }
          
          if (typeof pdfParser === 'function') {
            const data = await pdfParser(req.file.buffer);
            text = data.text;
            pageCount = data.numpages;
          } else {
            // Fallback to require if import fails to find the function
            const { createRequire } = await import("module");
            const require = createRequire(import.meta.url);
            const pdf = require("pdf-parse");
            if (typeof pdf === 'function') {
              const data = await pdf(req.file.buffer);
              text = data.text;
              pageCount = data.numpages;
            } else if (pdf.PDFParse) {
              const parser = new pdf.PDFParse({ data: req.file.buffer });
              const result = await parser.getText();
              text = result.text;
              pageCount = result.total;
            } else {
              throw new Error("PDF parser is not a function and no PDFParse class found.");
            }
          }
        }
      } catch (innerError: any) {
        console.error("Detailed PDF Parse Error:", innerError);
        throw new Error(innerError.message || "Unknown PDF parsing error");
      }
      
      if (!text) {
        throw new Error("No text could be extracted from the PDF.");
      }

      const sessionId = "default-session"; 
      pdfContexts.set(sessionId, text);

      res.json({ 
        message: "PDF uploaded and processed successfully", 
        fileName: req.file.originalname,
        pageCount: pageCount
      });
    } catch (error: any) {
      console.error("PDF Processing Error:", error);
      res.status(500).json({ error: "Failed to process PDF: " + error.message });
    }
  });

  app.post("/api/chat", async (req, res) => {
    console.log("POST /api/chat hit");
    const { message, history } = req.body;
    const sessionId = "default-session";
    const context = pdfContexts.get(sessionId);

    if (!context) {
      return res.status(400).json({ error: "No PDF context found. Please upload a PDF first." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenRouter API key not configured" });
    }

    try {
      const systemPrompt = `You are an expert educational assistant and research tutor. Your goal is to help the user understand the provided PDF document deeply.
      
      INSTRUCTIONS:
      1. Answer questions based ONLY on the provided PDF content.
      2. Use a professional, encouraging, and educational tone.
      3. Structure your responses for maximum readability:
         - Use bold text for key terms and concepts.
         - Use bullet points or numbered lists for steps or multiple points.
         - Use headers (###) to separate different sections of a long answer.
         - Use blockquotes (>) for direct quotes from the document.
      4. If the answer is not in the PDF, say: "I'm sorry, but I couldn't find specific information about that in the document. Based on the text provided, I can only discuss [mention a few topics found in the PDF]."
      5. Always provide context and explain *why* something is important if it's mentioned in the text.
      
      PDF CONTENT:
      ${context.substring(0, 20000)}
      `;

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "google/gemini-2.0-flash-001",
          messages: [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message }
          ],
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://ais-studio.google.com",
            "X-Title": "AI PDF Chat Assistant"
          }
        }
      );

      const aiMessage = response.data.choices[0].message.content;
      res.json({ response: aiMessage });
    } catch (error: any) {
      console.error("OpenRouter API Error:", error.response?.data || error.message);
      res.status(500).json({ error: "AI response failed: " + (error.response?.data?.error?.message || error.message) });
    }
  });

  app.post("/api/clear", (req, res) => {
    console.log("POST /api/clear hit");
    pdfContexts.delete("default-session");
    res.json({ message: "Chat and context cleared" });
  });

  // Global error handler to ensure JSON responses
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Error Handler:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    try {
      console.log("Starting Vite in middleware mode...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
        root: process.cwd(),
      });
      app.use(vite.middlewares);
      console.log("Vite middleware attached.");

      // Serve index.html for all other requests (SPA fallback)
      app.use("*", async (req, res, next) => {
        const url = req.originalUrl;
        try {
          // 1. Read index.html
          let template = await fs.readFile(path.resolve(process.cwd(), "index.html"), "utf-8");
          // 2. Apply Vite HTML transforms
          template = await vite.transformIndexHtml(url, template);
          // 3. Send the transformed HTML back
          res.status(200).set({ "Content-Type": "text/html" }).end(template);
        } catch (e) {
          // If an error is caught, let Vite fix the stack trace so it maps back
          // to your actual source code.
          if (e instanceof Error) {
            vite.ssrFixStacktrace(e);
          }
          next(e);
        }
      });
    } catch (viteErr) {
      console.error("Vite failed to start:", viteErr);
    }
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
