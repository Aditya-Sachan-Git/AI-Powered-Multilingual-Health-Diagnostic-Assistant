const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true }, // meetingId or roomId
    sender: String,            // e.g. "doctor" or "patient"
    senderRole: String,        // same as sender
    originalText: String,
    translatedText: String,    // optional if storing translations too
    translated: Boolean,
    sourceLang: String,
    targetLang: String,
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
