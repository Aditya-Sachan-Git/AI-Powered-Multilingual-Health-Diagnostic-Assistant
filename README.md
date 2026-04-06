# 🏥 AI-Driven Disease Risk Assessment and Warning System
### AI-Powered Multilingual Healthcare Assistant  

MediLingo Pro is an integrated healthcare platform that combines **real-time medical translation**, **AI-based symptom analysis**, and **machine learning disease prediction** to improve doctor–patient communication and assist in early diagnosis.

---

## 🚀 Features

- 🌐 **Multilingual Medical Translation**
  - Real-time voice & text translation
  - Supports doctor–patient communication across languages

- 🎙️ **Speech Processing**
  - Speech-to-Text (STT)
  - Text-to-Speech (TTS)

- 🤖 **AI Symptom Checker**
  - Extracts symptoms from conversations using NLP
  - Works on unstructured chat data

- 🧠 **Disease Prediction (ML Model)**
  - Predicts diseases based on extracted symptoms
  - Provides confidence score

- 📝 **Consultation Summary**
  - Auto-generates structured medical summaries
  - Includes symptoms, diagnosis, and insights

- 🗄️ **Cloud Database**
  - MongoDB Atlas for storing conversations & results

- 🔐 **Authentication System**
  - Login/Signup functionality
  - Role-based access (Doctor/Patient)

---

## 🖥️ Tech Stack

### Frontend
- ReactJS
- HTML, CSS, JavaScript

### Backend
- Python (Flask)

### AI/ML
- Scikit-learn (Disease Prediction)
- NLP (spaCy / Transformers)

### APIs & Tools
- Speech-to-Text API
- Translation API
- ElevenLabs (Text-to-Speech)

### Database
- MongoDB Atlas

---

## 🧩 System Workflow

1. User logs in (Doctor/Patient)
2. Joins consultation via Meeting ID
3. Starts voice/text conversation
4. Speech → Text conversion (if voice)
5. Real-time translation (if different languages)
6. Conversation stored in database
7. NLP extracts symptoms
8. ML model predicts disease
9. Summary generated with diagnosis

---

## 📸 Screenshots

### 🔹 Home Page
![Home](./screenshots/home.png)

### 🔹 Consultation Room
![Consultation](./screenshots/consultation.png)

### 🔹 Translation Module
![Translation](./screenshots/translation.png)

### 🔹 Final Summary
![Summary](./screenshots/summary.png)

---

## 📊 Sample Output

- Extracted Symptoms: fever, headache, nausea  
- Predicted Disease: Influenza  
- Confidence: 85%  

---

## ⚙️ Installation & Setup

```bash
# Clone the repository
git clone https://github.com/Aditya-Sachan-Git/AI-Driven_Disease_Risk_Assessment_and_Warning_System.git

# Start the server
node server.js

# Go to http://localhost:3000/
```

---

## 🔑 Environment Variables

Create a `.env` file in the root directory and add the following variables:
MONGO_URI=your_mongodb_connection_string
API_KEY=your_api_key
STT_API_KEY=your_speech_to_text_api_key
TTS_API_KEY=your_text_to_speech_api_key
TRANSLATION_API_KEY=your_translation_api_key

---

## 📌 Future Enhancements

- 📍 Epidemic outbreak prediction (GIS-based)
- 🧠 Deep learning models (BERT for NLP)
- 📱 Mobile application version
- 🧑‍🦯 Sign language support
- 📊 Advanced analytics dashboard

---

## 🎯 Use Cases

- Telemedicine platforms  
- Rural healthcare systems  
- Multilingual hospitals  
- AI-assisted diagnosis tools  

---

## 👨‍💻 Author

**Aditya Sachan**

---

## 📜 License

This project is for academic and research purposes.
