import express from "express";
import multer from "multer";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Configure multer for memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory store for PDF context
// NOTE: This will not persist between serverless function calls on Vercel.
// For production, consider using a database or persistent store.
const pdfContexts = new Map<string, string>();

// API Endpoints
app.get("/api/status", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

app.post("/api/upload-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (req.file.mimetype !== "application/pdf") {
      return res.status(400).json({ error: "Only PDF files are supported" });
    }

    // Robust PDF parsing logic
    let text = "";
    let pageCount = 0;

    try {
      const pdfModule = await import("pdf-parse") as any;
      
      if (pdfModule.PDFParse) {
        // Modern class-based API
        const parser = new pdfModule.PDFParse({ data: req.file.buffer });
        const result = await parser.getText();
        text = result.text;
        pageCount = result.total;
      } else {
        // Traditional function-based API
        let pdfParser = pdfModule.default || pdfModule;
        if (typeof pdfParser !== 'function' && pdfParser?.default) {
          pdfParser = pdfParser.default;
        }
        
        if (typeof pdfParser === 'function') {
          const data = await pdfParser(req.file.buffer);
          text = data.text;
          pageCount = data.numpages;
        } else {
          // Fallback to require
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
      console.error("PDF Parse Error:", innerError);
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
    4. If the answer is not in the PDF, say: "I'm sorry, but I couldn't find specific information about that in the document."
    
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
          "HTTP-Referer": "https://vercel.com",
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
  pdfContexts.delete("default-session");
  res.json({ message: "Chat and context cleared" });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Error Handler:", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error"
  });
});

export default app;
