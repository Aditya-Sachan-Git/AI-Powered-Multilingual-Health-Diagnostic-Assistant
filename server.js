// Node 23.x on Windows has TLS issues with MongoDB Atlas free tier
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const login = require('./routes/loginandsignup');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const doctorSignup = require('./routes/doctorsignup');
const appointment = require('./routes/appointment');
const ChatMessage = require('./models/ChatMessage');
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const { GoogleGenerativeAI } = require('@google/generative-ai')
// Google Translate API
const { translate } = require('@vitalets/google-translate-api');

require('dotenv').config();

const app = express();
app.use(cookieParser());
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyDRbCKLTiqNOKJicDfc64-QucEy6wii0tY");
const server = http.createServer(app);
const io = new Server(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(login);
app.use(doctorSignup);
app.use(appointment);
const multer = require("multer");
const fs = require("fs");
const FormData = require("form-data");
const OpenAI = require("openai");

const upload = multer({ dest: "uploads/" });

// === OpenAI setup ===
const openai = new OpenAI({
  //open-ai-api
});

// === Groq setup ===
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1"
});

// === 11 Labs STT endpoint ===
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
ffmpeg.setFfmpegPath(ffmpegPath);

// 11 Labs STT endpoint
const elevenlabs = new ElevenLabsClient({
  //eleven-labs
  apiKey: process.env.ELEVENLABS_API_KEY || 'sk_64ae4be783f231868d116e8a14af6dd561429320e607383c'
});

// Groq STT endpoint - Primary STT service
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    const inputPath = req.file.path;
    const outputPath = inputPath + ".wav";

    console.log("Processing audio file for Groq:", inputPath);

    // Convert webm -> wav for better compatibility
    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .toFormat("wav")
        .audioCodec('pcm_s16le')
        .audioFrequency(16000)
        .on("end", () => {
          console.log("Audio conversion completed");
          resolve();
        })
        .on("error", (err) => {
          console.error("FFmpeg conversion error:", err);
          reject(err);
        })
        .save(outputPath);
    });

    if (!fs.existsSync(outputPath)) {
      throw new Error("Audio conversion failed - output file not created");
    }

    console.log("Starting Groq transcription...");

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(outputPath),
      model: "whisper-large-v3",
      response_format: "verbose_json",
      language: "en" // Optional: Auto-detect if omitted, or pass from req.body
    });

    console.log("Groq transcription completed:", transcription.text);

    // Clean up files
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    } catch (cleanupErr) {
      console.warn("Cleanup error:", cleanupErr);
    }

    res.json({
      text: transcription.text || "",
      language: transcription.language || 'en',
      duration: transcription.duration || 0,
      confidence: 1.0 // Groq/Whisper doesn't always return confidence in simple mode, defaulting to 1
    });
  } catch (err) {
    console.error("Groq STT error:", err);

    // Try fallback to OpenAI Whisper
    try {
      console.log("Groq failed, trying OpenAI Whisper fallback...");
      if (req.file && fs.existsSync(req.file.path)) {
        const whisperResult = await transcribeWithWhisper(req.file.path);

        // Clean up files
        try {
          if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          if (req.file && fs.existsSync(req.file.path + ".wav")) fs.unlinkSync(req.file.path + ".wav");
        } catch (cleanupErr) {
          console.warn("Cleanup error:", cleanupErr);
        }

        return res.json(whisperResult);
      }
    } catch (fallbackErr) {
      console.error("Whisper fallback also failed:", fallbackErr);
    }

    // Clean up files on error
    try {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      if (req.file && fs.existsSync(req.file.path + ".wav")) fs.unlinkSync(req.file.path + ".wav");
    } catch (cleanupErr) {
      console.warn("Cleanup error:", cleanupErr);
    }

    res.status(500).json({
      text: "",
      error: "Transcription failed",
      fallback: true
    });
  }
});

// Whisper fallback endpoint
async function transcribeWithWhisper(filePath) {
  try {
    const outputPath = filePath + ".wav";

    // Convert if needed
    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .toFormat("wav")
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(outputPath),
      model: "whisper-1",
      response_format: "verbose_json",
      language: "en"
    });

    // Clean up converted file
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

    return {
      text: transcription.text,
      language: transcription.language,
      duration: transcription.duration
    };
  } catch (err) {
    console.error("Whisper transcription error:", err);
    throw err;
  }
}

// Keep Whisper as explicit fallback endpoint
app.post("/api/stt/whisper", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    const result = await transcribeWithWhisper(req.file.path);

    // Clean up original file
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

    res.json(result);
  } catch (err) {
    console.error("Whisper STT error:", err);

    // Clean up files on error
    try {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      if (req.file && fs.existsSync(req.file.path + ".wav")) fs.unlinkSync(req.file.path + ".wav");
    } catch (cleanupErr) {
      console.warn("Cleanup error:", cleanupErr);
    }

    res.status(500).json({ error: err.message || "Transcription failed" });
  }
});

// AssemblyAI real-time transcription endpoint (if you want to implement real-time later)
app.post("/api/stt/realtime", async (req, res) => {
  // This would be for real-time streaming transcription
  // You can implement this later if needed
  res.json({ message: "Real-time STT endpoint - implement as needed" });
});

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('⚠️ MongoDB connection failed (chat will work in-memory only):', err.message));

// ... rest of your existing code (translation functions, routes, socket handlers) remains the same ...

// Translation with fallback
async function translateTextWithFallback(text, targetLang, sourceLang = 'auto') {
  try {
    return await translateText(text, targetLang, sourceLang);
  } catch (error) {
    console.log('Primary translation failed, trying alternative method...');
    try {
      const { translate: translateAlt } = require('@vitalets/google-translate-api');
      const result = await translateAlt(text, { to: targetLang });
      return {
        text: result.text || text,
        translated: true,
        originalText: text,
        sourceLang: result.from || sourceLang,
        targetLang
      };
    } catch (altError) {
      console.error('All translation methods failed:', altError.message);
      return { text, translated: false, error: `Translation failed: ${error.message}`, originalText: text, sourceLang, targetLang };
    }
  }
}

async function translateText(text, targetLang, sourceLang = 'auto') {
  try {
    if (sourceLang === targetLang) {
      return { text, translated: false, originalText: text, sourceLang, targetLang };
    }

    console.log(`Translating with Groq: "${text}" from ${sourceLang} to ${targetLang}`);

    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "You are a translator. Only return the translated text, nothing else. No quotes, no explanations." },
        { role: "user", content: `Translate the following text from ${sourceLang} to ${targetLang}:\n\n"${text}"` }
      ],
      temperature: 0.3,
      max_tokens: 512
    });

    const translatedText = chatCompletion.choices[0].message.content.trim();
    console.log(`Groq translation successful: "${translatedText}" (${sourceLang} → ${targetLang})`);

    return { text: translatedText, translated: true, originalText: text, sourceLang, targetLang };
  } catch (error) {
    console.error('Groq translation error:', error.message);
    return { text, translated: false, error: error.message, originalText: text, sourceLang, targetLang };
  }
}

// Room + language data
const roomRoles = {};
const userLanguages = {};
const roomMessages = {};
const ROLE_LANGUAGES = { doctor: 'en', patient: 'ta' };

// Helper to process and send messages (used for both chat & STT)
async function processMessage(socket, { roomId, text, senderRole }) {
  const senderLang = userLanguages[socket.id];
  const timestamp = new Date();
  const baseMessage = {
    sender: senderRole,
    senderRole,
    originalText: text,
    sourceLang: senderLang,
    timestamp,
    socketId: socket.id
  };

  // Save to history
  roomMessages[roomId].push(baseMessage);
  try {
    await ChatMessage.create({
      sessionId: roomId,
      sender: senderRole,
      senderRole,
      originalText: text,
      translatedText: null,
      translated: false,
      sourceLang: senderLang,
      targetLang: null,
      timestamp
    });
  } catch (dbErr) {
    console.error('⚠️ Failed to save message to MongoDB:', dbErr.message);
  }
  // Send to everyone in room
  const roomSockets = io.sockets.adapter.rooms.get(roomId);
  if (!roomSockets) return;

  for (const userId of roomSockets) {
    const targetSocket = io.sockets.sockets.get(userId);
    if (!targetSocket) continue;
    const targetLang = userLanguages[userId];
    let messageToSend = { ...baseMessage };

    if (userId === socket.id) {
      messageToSend.message = text;
      messageToSend.isOriginal = true;
      messageToSend.translated = false;
    } else {
      const translation = await translateTextWithFallback(text, targetLang, senderLang);
      messageToSend.message = translation.text;
      messageToSend.translated = translation.translated;
      messageToSend.isOriginal = false;
      if (translation.translated) {
        messageToSend.translationInfo = {
          originalText: text,
          sourceLang: translation.sourceLang,
          targetLang: translation.targetLang
        };
      }
      if (translation.error) {
        messageToSend.translationError = translation.error;
      }
    }
    targetSocket.emit("chat-message", messageToSend);
  }
}

// Routes
app.get(["/summarise/:meetingid", "/chat/summary/:id"], async (req, res) => {
  try {
    const meetingId = req.params.meetingid || req.params.id;

    // 1️⃣ Try to get messages from MongoDB first, fall back to in-memory
    let messages = [];
    try {
      messages = await ChatMessage.find({ sessionId: meetingId })
        .sort({ timestamp: 1 })
        .lean();
    } catch (dbErr) {
      console.error('⚠️ MongoDB query failed, falling back to in-memory messages:', dbErr.message);
    }

    // Fall back to in-memory messages if DB returned nothing
    if (!messages.length && roomMessages[meetingId] && roomMessages[meetingId].length > 0) {
      messages = roomMessages[meetingId];
    }

    if (!messages.length) {
      return res.render("summary", {
        meetingId,
        summary: "No messages found for this meeting room.",
        symptoms: [],
        diseasesHtml: ""
      });
    }

    // 2️⃣ Prepare conversation text
    const conversationText = messages
      .map(
        (msg) => {
          const ts = msg.timestamp ? new Date(msg.timestamp).toISOString() : 'unknown';
          return `[${ts}] ${msg.senderRole || msg.sender}: ${msg.originalText}`;
        }
      )
      .join("\n");

    // 3️⃣ Build prompt for Groq
    const systemPrompt = `You are an AI meeting assistant and medical expert. Analyze conversations between doctors and patients. Always respond with valid JSON only.`;
    const userPrompt = `Analyze the following conversation and return a JSON object with this exact structure:
{"summary": ["bullet point 1", "bullet point 2"], "symptoms": ["symptom 1", "symptom 2"], "predictions": [{"disease": "Disease Name", "confidence": 85}]}
The "summary" must be an array of plain text strings. Do NOT include HTML tags. Return ONLY valid JSON.

Conversation:
${conversationText}`;

    // 4️⃣ Call Groq API to extract summary and disease prediction
    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 1024,
      response_format: { type: "json_object" }
    });

    // Parse the JSON result
    const responseText = chatCompletion.choices[0].message.content;
    const parsedData = JSON.parse(responseText);

    // Convert summary array into HTML bullet points
    let summary = "No summary available.";
    if (Array.isArray(parsedData.summary) && parsedData.summary.length > 0) {
      summary = "<ul>" + parsedData.summary.map(s => `<li>${s}</li>`).join("") + "</ul>";
    } else if (typeof parsedData.summary === 'string') {
      summary = parsedData.summary;
    }
    const symptoms = parsedData.symptoms || [];

    // 5️⃣ Generate Disease HTML
    let diseasesHtml = "";
    if (parsedData.predictions && parsedData.predictions.length > 0) {
      diseasesHtml = parsedData.predictions.map(p => `
        <div style="background:#e9f7ef; padding:15px; border-radius:5px; margin-top:10px;">
          <p><strong>Predicted Disease:</strong> ${p.disease}</p>
          <p><strong>Confidence:</strong> ${p.confidence}%</p>
        </div>
      `).join("");
      diseasesHtml += '<p style="color:red; font-size:0.9em; margin-top:10px;">⚠ This system provides an AI advisory prediction analyzing the LLM context of the conversation.</p>';
    }

    // 6️⃣ Return summary and prediction view
    res.render("summary", { meetingId, summary, symptoms, diseasesHtml });
  } catch (error) {
    console.error("Error generating summary:", error);
    res.render("summary", {
      meetingId: req.params.meetingid || req.params.id,
      summary: "Error generating summary: " + error.message,
      symptoms: [],
      diseasesHtml: ""
    });
  }
});
app.get('/home', (req, res) => {
  if (req.cookies.token2) return res.render('home2');
  res.render('home');
});
app.get('/', (req, res) => res.render('main'));
app.get('/clear-cookies', (req, res) => {
  for (let cookieName in req.cookies) res.clearCookie(cookieName);
  res.send('All cookies cleared!');
});
app.get("/meet", (req, res) => res.render("index", { roomId: 101 }));
app.get("/room/:roomId", (req, res) => res.render("room", { roomId: req.params.roomId }));

app.post("/api/stt/result", (req, res) => {
  const { text, roomId, role } = req.body;
  console.log(`[STT] [${roomId}] ${role} -> ${text}`);
  if (text && roomId) io.to(roomId).emit("stt-message", { text, role, roomId });
  res.sendStatus(200);
});

app.get('/api/room/:roomId/messages', (req, res) => {
  res.json(roomMessages[req.params.roomId] || []);
});
app.get('/api/languages', (req, res) => {
  res.json({ en: 'English', hi: 'Hindi' });
});
app.post('/api/user/language', (req, res) => {
  const { socketId, language } = req.body;
  if (userLanguages[socketId]) {
    userLanguages[socketId] = language;
    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) targetSocket.emit('language-changed', language);
    res.json({ success: true });
  } else res.status(404).json({ error: 'User not found' });
});
app.post('/api/translate', async (req, res) => {
  try {
    const { text, targetLang, sourceLang } = req.body;
    res.json(await translateTextWithFallback(text, targetLang, sourceLang));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO
io.on("connection", (socket) => {
  console.log('User connected:', socket.id);
  socket.on("language-change", ({ roomId, language }) => {
    userLanguages[socket.id] = language;
    socket.to(roomId).emit("user-language-changed", { socketId: socket.id, language });
  });
  // WebRTC pass-through
  socket.on("offer", (data) => {
    console.log(`=== OFFER RECEIVED ===`);
    console.log(`Offer from ${socket.id} to ${data.to}`);
    console.log(`Data:`, data);
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      console.log(`Sending offer to target socket ${data.to}`);
      targetSocket.emit("offer", { ...data, from: socket.id });
    } else {
      console.log(`Target socket ${data.to} not found`);
    }
  });

  socket.on("answer", (data) => {
    console.log(`Answer from ${socket.id} to ${data.to}`);
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      targetSocket.emit("answer", { ...data, from: socket.id });
    } else {
      console.log(`Target socket ${data.to} not found`);
    }
  });

  socket.on("ice-candidate", (data) => {
    console.log(`ICE candidate from ${socket.id} to ${data.to}`);
    const targetSocket = io.sockets.sockets.get(data.to);
    if (targetSocket) {
      targetSocket.emit("ice-candidate", { ...data, from: socket.id });
    } else {
      console.log(`Target socket ${data.to} not found`);
    }
  });

  // Chat message
  socket.on("chat-message", async ({ roomId, message }) => {
    let senderRole = roomRoles[roomId]?.doctor === socket.id ? "doctor" :
      roomRoles[roomId]?.patient === socket.id ? "patient" : null;
    if (senderRole) await processMessage(socket, { roomId, text: message, senderRole });
  });

  // STT message
  socket.on("stt-message", async ({ text, roomId }) => {
    let senderRole = roomRoles[roomId]?.doctor === socket.id ? "doctor" :
      roomRoles[roomId]?.patient === socket.id ? "patient" : null;
    if (senderRole) await processMessage(socket, { roomId, text, senderRole });
  });

  socket.on("join-room", (roomId) => {
    console.log(`=== USER JOINING ROOM ===`);
    console.log(`User ${socket.id} joining room ${roomId}`);
    console.log(`Current room roles:`, roomRoles);
    socket.join(roomId);

    if (!roomRoles[roomId]) {
      roomRoles[roomId] = { doctor: null, patient: null };
      roomMessages[roomId] = [];
    }

    let assignedRole;
    if (!roomRoles[roomId].doctor) {
      roomRoles[roomId].doctor = socket.id;
      assignedRole = "doctor";
    } else if (!roomRoles[roomId].patient) {
      roomRoles[roomId].patient = socket.id;
      assignedRole = "patient";
    } else {
      socket.emit("room-full");
      return;
    }

    userLanguages[socket.id] = ROLE_LANGUAGES[assignedRole];
    socket.emit("role-assigned", assignedRole);
    socket.emit("language-assigned", ROLE_LANGUAGES[assignedRole]);

    console.log(`User ${socket.id} -> Role: ${assignedRole}, Lang: ${ROLE_LANGUAGES[assignedRole]}`);

    // Notify other users in the room about the new connection
    socket.to(roomId).emit("user-connected", socket.id);

    // If there's already another user in the room, notify the new user about them
    const otherUser = roomRoles[roomId].doctor === socket.id ? roomRoles[roomId].patient : roomRoles[roomId].doctor;
    if (otherUser) {
      console.log(`Notifying new user ${socket.id} about existing user ${otherUser}`);
      socket.emit("user-connected", otherUser);
    }

    // Send message history translated to new user's language
    (async () => {
      for (const msg of roomMessages[roomId]) {
        const targetLang = userLanguages[socket.id];
        const translation = await translateTextWithFallback(msg.originalText, targetLang, msg.sourceLang);
        socket.emit("chat-message", {
          ...msg,
          message: translation.text,
          translated: translation.translated,
          translationInfo: translation.translated ? translation : null,
          translationError: translation.error || null
        });
      }
    })();
  });

  socket.on("disconnect", () => {
    console.log('User disconnected:', socket.id);
    for (const roomId in roomRoles) {
      if (roomRoles[roomId].doctor === socket.id) roomRoles[roomId].doctor = null;
      if (roomRoles[roomId].patient === socket.id) roomRoles[roomId].patient = null;
      if (!roomRoles[roomId].doctor && !roomRoles[roomId].patient) {
        delete roomRoles[roomId];
        delete roomMessages[roomId];
      }
    }
    delete userLanguages[socket.id];
    socket.broadcast.emit("user-disconnected", socket.id);
  });
});
// Sign language route
app.get("/signroom/:roomId", (req, res) => {
  res.render("signroom", { roomId: req.params.roomId });
});
server.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
  console.log("Doctor language: English (en)");
  console.log("Patient language: Any");
  console.log("Using Groq for speech-to-text");
});