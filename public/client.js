const socket = io();
let localStream;
let peerConnection;
let myRole = null;
let otherUserId = null;
let ROOM_ID = null;

// Enhanced WebRTC configuration
const config = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" }
  ],
  iceCandidatePoolSize: 10
};

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM loaded, initializing...");
    
    // Get ROOM_ID from the page (set in room.ejs)
    ROOM_ID = window.ROOM_ID || '101';
    console.log("ROOM_ID:", ROOM_ID);
    
    init();
});

// === 1. Video/Audio Initialization ===
async function init() {
  console.log("=== INITIALIZING APPLICATION ===");
  
  // Get DOM elements
  const localVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");
  const sendMsgBtn = document.getElementById("sendMsgBtn");
  const chatBox = document.getElementById("chatBox");
  const recordBtn = document.getElementById("recordBtn");
  const transcript = document.getElementById("transcript");

  // Debug: Check if elements are found
  console.log("DOM Elements found:");
  console.log("localVideo:", localVideo);
  console.log("remoteVideo:", remoteVideo);
  console.log("sendMsgBtn:", sendMsgBtn);
  console.log("chatBox:", chatBox);
  console.log("recordBtn:", recordBtn);
  console.log("transcript:", transcript);

  if (!localVideo || !remoteVideo) {
    console.error("Video elements not found!");
    return;
  }

  try {
    console.log("Requesting media access...");
    localStream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        facingMode: "user"
      }, 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    console.log("Media stream obtained:", localStream);
    console.log("Video tracks:", localStream.getVideoTracks());
    console.log("Audio tracks:", localStream.getAudioTracks());
    
    // Set local video
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    localVideo.volume = 0;
    
    // Play the video
    await localVideo.play();
    console.log("Local video playing:", localVideo.readyState);
    
    // Update status
    updateStatus('local', 'Local video active');
    
  } catch (error) {
    console.error("Error accessing media:", error);
    updateStatus('local', 'Media access failed: ' + error.message);
    
    // Show user-friendly error
    if (localVideo) {
      localVideo.style.background = '#ff4444';
      localVideo.innerHTML = '<div style="color: white; text-align: center; padding: 20px;">Camera/Microphone access denied<br>Please allow access and refresh</div>';
    }
  }

  // Setup Socket.IO event handlers
  setupSocketHandlers();
  
  // Setup UI event handlers
  setupUIHandlers();
  
  // Join room
  console.log("Joining room:", ROOM_ID);
  socket.emit("join-room", ROOM_ID);
  
  // Initialize status display
  initializeStatusDisplay();
}

function setupSocketHandlers() {
  // Handle role assignment
  socket.on("role-assigned", (role) => {
    myRole = role;
    console.log("My role is:", myRole);
    updateUIBasedOnRole(role);
    updateStatus('role', `Role: ${role}`);
  });

  socket.on("room-full", () => {
    alert("Room is full!");
    updateStatus('connection', 'Room full');
  });

  socket.on("connect", () => {
    console.log("Connected to server");
    updateStatus('connection', 'Connected to server');
  });

  socket.on("disconnect", () => {
    console.log("Disconnected from server");
    updateStatus('connection', 'Disconnected');
  });

  socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
    updateStatus('connection', 'Connection error');
  });

  // User connection handling
  socket.on("user-connected", async (userId) => {
    console.log("User connected:", userId);
    otherUserId = userId;
    updateStatus('remote', `Remote user: ${userId}`);
    
    if (myRole) {
      await createPeer();
      // Only offer if we're the first user (doctor)
      if (myRole === 'doctor') {
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          socket.emit("offer", { 
            sdp: peerConnection.localDescription, 
            to: otherUserId 
          });
          console.log("Offer created and sent");
        } catch (error) {
          console.error("Error creating offer:", error);
        }
      }
    }
  });

  // Offer handling
  socket.on("offer", async ({ sdp, from }) => {
    console.log("Received offer from:", from);
    otherUserId = from;
    updateStatus('remote', `Remote user: ${from}`);
    
    if (!peerConnection) {
      await createPeer();
    }
    
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      socket.emit("answer", { 
        sdp: answer, 
        to: from 
      });
      console.log("Answer created and sent");
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  });

  // Answer handling
  socket.on("answer", async ({ sdp, from }) => {
    console.log("Received answer from:", from);
    try {
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        console.log("Remote description set successfully");
      }
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  });

  // ICE candidate handling
  socket.on("ice-candidate", async ({ candidate, from }) => {
    console.log("Received ICE candidate from:", from);
    try {
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("ICE candidate added successfully");
      }
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  });

  socket.on("user-disconnected", (userId) => {
    console.log("User disconnected:", userId);
    if (userId === otherUserId) {
      otherUserId = null;
      if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
      }
      const remoteVideo = document.getElementById("remoteVideo");
      if (remoteVideo) {
        remoteVideo.srcObject = null;
      }
      updateStatus('remote', 'No remote user');
      updateStatus('connection', 'Peer disconnected');
    }
  });

  // Handle chat messages with translation info
  socket.on("chat-message", ({ sender, message, senderRole, translated, isOriginal, translationInfo }) => {
    addChatBubble(sender, message, senderRole, translated, isOriginal, translationInfo);
  });
}

function setupUIHandlers() {
  const recordBtn = document.getElementById("recordBtn");
  const sendMsgBtn = document.getElementById("sendMsgBtn");
  const testBtn = document.getElementById("testBtn");
  const speechBtn = document.getElementById("speechBtn");
  const elevenLabsBtn = document.getElementById("elevenLabsBtn");
  
  if (recordBtn) {
    recordBtn.onclick = handleRecording;
  }
  
  if (sendMsgBtn) {
    sendMsgBtn.onclick = handleSendMessage;
  }
  
  if (testBtn) {
    testBtn.onclick = testConnection;
  }
  
  if (speechBtn) {
    speechBtn.onclick = () => {
      if (isWebSpeechSupported()) {
        startWebSpeechRecognition();
      } else {
        alert("Speech recognition not supported in this browser. Try Chrome or Edge.");
      }
    };
  }
  
  if (elevenLabsBtn) {
    elevenLabsBtn.onclick = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: "audio/webm" });
          await transcribeWithElevenLabs(blob);
          stream.getTracks().forEach(t => t.stop());
        };
        
        recorder.start();
        setTimeout(() => recorder.stop(), 5000); // Record for 5 seconds
        
        const transcript = document.getElementById("transcript");
        if (transcript) {
          transcript.value = "Recording for 5 seconds... Speak now!";
        }
      } catch (e) {
        console.error("11 Labs recording error:", e);
        alert("Error accessing microphone: " + e.message);
      }
    };
  }
}

function testConnection() {
  console.log("=== CONNECTION TEST ===");
  console.log("Socket connected:", socket.connected);
  console.log("My role:", myRole);
  console.log("Other user ID:", otherUserId);
  console.log("Peer connection:", peerConnection);
  console.log("Local stream:", localStream);
  console.log("Room ID:", ROOM_ID);
  
  if (peerConnection) {
    console.log("Connection state:", peerConnection.connectionState);
    console.log("ICE connection state:", peerConnection.iceConnectionState);
    console.log("ICE gathering state:", peerConnection.iceGatheringState);
  }
  
  // Force rejoin room
  console.log("Rejoining room...");
  socket.emit("join-room", ROOM_ID);
  
  alert("Check console for connection details. Room rejoined.");
}

// Improved peer connection creation
async function createPeer() {
  console.log("Creating peer connection...");
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  try {
    peerConnection = new RTCPeerConnection(config);
    console.log("Peer connection created");
    updateStatus('connection', 'Creating peer connection...');

    // Add all tracks from local stream
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log("Adding track:", track.kind, track.readyState);
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      console.log("Received remote tracks:", event.streams.length);
      if (event.streams && event.streams[0]) {
        const remoteVideo = document.getElementById("remoteVideo");
        if (remoteVideo) {
          remoteVideo.srcObject = event.streams[0];
          console.log("Remote video source set");
          updateStatus('remote', 'Remote video active');
          
          // Play the remote video
          remoteVideo.play().catch(e => console.error("Remote video play error:", e));
        }
      }
    };

    // ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && otherUserId) {
        console.log("Sending ICE candidate to:", otherUserId);
        socket.emit("ice-candidate", { 
          candidate: event.candidate,
          to: otherUserId 
        });
      } else if (!event.candidate) {
        console.log("All ICE candidates sent");
      }
    };

    // Connection state tracking
    peerConnection.onconnectionstatechange = () => {
      const state = peerConnection.connectionState;
      console.log("Connection state:", state);
      updateStatus('connection', `Connection: ${state}`);
      
      if (state === 'connected') {
        console.log("✅ Peers connected!");
        updateStatus('connection', '✅ Connected!');
      } else if (state === 'failed' || state === 'disconnected') {
        console.log("❌ Connection failed");
        updateStatus('connection', '❌ Connection failed');
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE connection state:", peerConnection.iceConnectionState);
    };

    peerConnection.onicegatheringstatechange = () => {
      console.log("ICE gathering state:", peerConnection.iceGatheringState);
    };

    // Handle negotiation needed
    peerConnection.onnegotiationneeded = async () => {
      console.log("Negotiation needed");
      if (myRole === 'doctor' && otherUserId) {
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          socket.emit("offer", { 
            sdp: peerConnection.localDescription, 
            to: otherUserId 
          });
        } catch (err) {
          console.error("Negotiation error:", err);
        }
      }
    };

    updateStatus('connection', 'Peer connection ready');
    return peerConnection;

  } catch (error) {
    console.error("Error creating peer connection:", error);
    updateStatus('connection', 'Peer connection failed');
    return null;
  }
}

// Update UI based on assigned role
function updateUIBasedOnRole(role) {
  const roleIndicator = document.getElementById("roleIndicator") || createRoleIndicator();
  roleIndicator.textContent = `Your Role: ${role}`;
  roleIndicator.className = `role-indicator role-${role.toLowerCase()}`;
}

function createRoleIndicator() {
  const indicator = document.createElement("div");
  indicator.id = "roleIndicator";
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 8px 12px;
    border-radius: 4px;
    font-weight: bold;
    z-index: 1000;
    background: rgba(0,0,0,0.8);
    color: white;
  `;
  document.body.appendChild(indicator);
  return indicator;
}

// Status display functions
function initializeStatusDisplay() {
  const statusDiv = document.createElement("div");
  statusDiv.id = "statusDisplay";
  statusDiv.style.cssText = `
    position: fixed;
    bottom: 10px;
    left: 10px;
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 10px;
    z-index: 1000;
    font-family: monospace;
    font-size: 12px;
    border-radius: 5px;
    max-width: 300px;
  `;
  statusDiv.innerHTML = `
    <div>Local: <span id="localStatus">Loading...</span></div>
    <div>Remote: <span id="remoteStatus">Waiting...</span></div>
    <div>Connection: <span id="connectionStatus">Disconnected</span></div>
    <div>Role: <span id="roleStatus">Unknown</span></div>
  `;
  document.body.appendChild(statusDiv);
}

function updateStatus(type, message) {
  const element = document.getElementById(`${type}Status`);
  if (element) {
    element.textContent = message;
  }
}

// === 2. Audio Recording ===
let recorder, chunks = [], recording = false;

async function handleRecording() {
  if (!recording) {
    try {
      if (!myRole) {
        alert("Please wait for role assignment before recording.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      let mimeType = "audio/webm;codecs=opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "audio/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/mp4";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "audio/wav";
          }
        }
      }
      
      console.log("Using MIME type:", mimeType);
      
      recorder = new MediaRecorder(stream, { mimeType });
      chunks = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: mimeType });
        console.log("Audio blob created, size:", blob.size);
        if (blob.size > 0) {
          await transcribe(blob);
        } else {
          const transcript = document.getElementById("transcript");
          if (transcript) {
            transcript.value = "[No audio recorded]";
          }
        }
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        alert("Recording error: " + event.error);
      };

      recorder.start(1000);
      recording = true;
      const recordBtn = document.getElementById("recordBtn");
      if (recordBtn) {
        recordBtn.textContent = "Stop Recording";
        recordBtn.classList.add("recording");
      }
      console.log("Recording started");
    } catch (e) {
      console.error("Microphone access error:", e);
      alert("Microphone access error: " + e.message);
    }
  } else {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
    recording = false;
    const recordBtn = document.getElementById("recordBtn");
    if (recordBtn) {
      recordBtn.textContent = "Start Recording";
      recordBtn.classList.remove("recording");
    }
    console.log("Recording stopped");
  }
}

// Check if Web Speech API is available
function isWebSpeechSupported() {
  return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

// Use Web Speech API for free transcription with better error handling
function startWebSpeechRecognition() {
  const transcript = document.getElementById("transcript");
  if (!transcript) return;

  if (!isWebSpeechSupported()) {
    transcript.value = "Speech recognition not supported in this browser";
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US'; // You can change this to 'hi-IN' for Hindi
  recognition.maxAlternatives = 1;

  transcript.value = "Listening... Speak now!";

  recognition.onresult = function(event) {
    const transcriptText = event.results[0][0].transcript;
    transcript.value = transcriptText;
    
    // Auto-send the transcribed message
    if (transcriptText.trim() && myRole) {
      socket.emit("stt-message", { roomId: ROOM_ID, text: transcriptText });
    }
  };

  recognition.onerror = function(event) {
    console.error("Speech recognition error:", event.error);
    
    // Handle different error types
    switch(event.error) {
      case 'network':
        transcript.value = "Network error. Please check your internet connection and try again.";
        break;
      case 'not-allowed':
        transcript.value = "Microphone access denied. Please allow microphone access.";
        break;
      case 'no-speech':
        transcript.value = "No speech detected. Please try speaking again.";
        break;
      case 'audio-capture':
        transcript.value = "No microphone found. Please check your microphone.";
        break;
      default:
        transcript.value = `Speech recognition error: ${event.error}. Try using Chrome browser.`;
    }
  };

  recognition.onend = function() {
    console.log("Speech recognition ended");
  };

  recognition.onstart = function() {
    console.log("Speech recognition started");
  };

  try {
    recognition.start();
  } catch (error) {
    console.error("Failed to start speech recognition:", error);
    transcript.value = "Failed to start speech recognition. Please try again.";
  }
}
// Main transcription function - uses AssemblyAI STT
async function transcribe(blob) {
  const transcript = document.getElementById("transcript");
  if (!transcript) return;

  // Use AssemblyAI STT
  console.log("Using AssemblyAI STT for transcription");
  await transcribeWithAssemblyAI(blob);
}

// AssemblyAI transcription function
async function transcribeWithAssemblyAI(blob) {
  const transcript = document.getElementById("transcript");
  if (transcript) {
    transcript.value = "Transcribing with AssemblyAI...";
  }
  
  const form = new FormData();
  form.append("audio", blob, "speech.webm");

  try {
    const resp = await fetch("/api/stt", { method: "POST", body: form });
    
    if (!resp.ok) {
      throw new Error(`HTTP error! status: ${resp.status}`);
    }
    
    const data = await resp.json();
    
    if (data.error && !data.fallback) {
      throw new Error(data.error);
    }
    
    if (transcript) {
      transcript.value = data.text || "[No transcription]";
    }
    
    if (data.text && data.text.trim() && myRole) {
      socket.emit("stt-message", { roomId: ROOM_ID, text: data.text });
    }
    
    // Show success message
    if (transcript && data.text) {
      const status = data.fallback ? " (using fallback)" : " (AssemblyAI)";
      transcript.value += status;
    }
  } catch (e) {
    console.error("AssemblyAI transcription error:", e);
    if (transcript) {
      transcript.value = `[AssemblyAI failed: ${e.message}] Please type your message manually.`;
    }
  }
}
// Use 11 Labs STT API with fallback to Whisper
async function transcribeWithElevenLabs(blob) {
  const transcript = document.getElementById("transcript");
  if (transcript) {
    transcript.value = "Transcribing with 11 Labs...";
  }
  
  const form = new FormData();
  form.append("audio", blob, "speech.webm");

  try {
    const resp = await fetch("/api/stt", { method: "POST", body: form });
    
    if (!resp.ok) {
      throw new Error(`HTTP error! status: ${resp.status}`);
    }
    
    const data = await resp.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    if (transcript) {
      transcript.value = data.text || "[No transcription]";
    }
    
    if (data.text && data.text.trim() && myRole) {
      socket.emit("stt-message", { roomId: ROOM_ID, text: data.text });
    }
  } catch (e) {
    console.error("11 Labs transcription error:", e);
    if (transcript) {
      transcript.value = `[11 Labs failed: ${e.message}] Please type your message manually.`;
    }
  }
}

// Fallback to OpenAI Whisper if 11 Labs fails
async function transcribeWithWhisper(blob) {
  const transcript = document.getElementById("transcript");
  if (transcript) {
    transcript.value = "Transcribing with Whisper...";
  }
  
  const form = new FormData();
  form.append("audio", blob, "speech.webm");

  try {
    const resp = await fetch("/api/stt/whisper", { method: "POST", body: form });
    
    if (!resp.ok) {
      throw new Error(`HTTP error! status: ${resp.status}`);
    }
    
    const data = await resp.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    if (transcript) {
      transcript.value = data.text || "[No transcription]";
    }
    
    if (data.text && data.text.trim() && myRole) {
      socket.emit("stt-message", { roomId: ROOM_ID, text: data.text });
    }
  } catch (e) {
    console.error("Whisper transcription error:", e);
    if (transcript) {
      transcript.value = `[Whisper failed: ${e.message}]`;
    }
  }
}

// Main transcription function - uses only 11 Labs STT
async function transcribe(blob) {
  const transcript = document.getElementById("transcript");
  if (!transcript) return;

  // Use 11 Labs STT only
  console.log("Using 11 Labs STT for transcription");
  await transcribeWithElevenLabs(blob);
}

// === 3. Chat Message ===
function handleSendMessage() {
  const transcript = document.getElementById("transcript");
  const text = transcript ? transcript.value.trim() : '';
  if (text && myRole) {
    socket.emit("chat-message", {
      roomId: ROOM_ID,
      message: text,
      role: myRole
    });
    if (transcript) {
      transcript.value = "";
    }
  } else if (!myRole) {
    alert("Please wait for role assignment before sending messages.");
  }
}

function addChatBubble(sender, msg, senderRole, translated = false, isOriginal = true, translationInfo = null) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;
  
  const p = document.createElement("p");
  const roleClass = senderRole ? senderRole.toLowerCase() : 'unknown';
  p.className = `chat-message role-${roleClass}`;

  const roleDisplay = senderRole ? ` (${senderRole})` : '';
  
  // Add translation indicator
  let translationIndicator = '';
  if (translated && !isOriginal) {
    translationIndicator = ' <span class="translation-indicator translated">[Translated]</span>';
  } else if (isOriginal) {
    translationIndicator = ' <span class="translation-indicator original">[Original]</span>';
  }
  
  // Add original text tooltip if translated
  let tooltipText = '';
  if (translated && !isOriginal && translationInfo) {
    tooltipText = ` title="Original: ${translationInfo.originalText}"`;
  }
  
  p.innerHTML = `<strong>${sender}${roleDisplay}:</strong> ${msg}${translationIndicator}`;
  if (tooltipText) {
    p.setAttribute('title', `Original: ${translationInfo.originalText}`);
  }

  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Handle page unload
window.addEventListener('beforeunload', () => {
  if (peerConnection) {
    peerConnection.close();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
});

// If DOM is already loaded, initialize immediately
if (document.readyState === 'loading') {
  // DOM is still loading, wait for DOMContentLoaded
} else {
  // DOM is already loaded
  console.log("DOM already loaded, initializing...");
  
  // Get ROOM_ID from the page (set in room.ejs)
  ROOM_ID = window.ROOM_ID || '101';
  console.log("ROOM_ID:", ROOM_ID);
  
  init();
}