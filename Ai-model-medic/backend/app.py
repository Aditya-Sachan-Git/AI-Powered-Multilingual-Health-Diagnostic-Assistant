import os
import re
import joblib
from flask import Flask, request, render_template, redirect, url_for, jsonify
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
if os.environ.get("GOOGLE_API_KEY"):
    genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))

# Get Base Directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Path to frontend/templates
TEMPLATE_DIR = os.path.abspath(
    os.path.join(BASE_DIR, "../frontend/templates")
)

# Path to model folder
MODEL_DIR = os.path.join(BASE_DIR, "model")

# Create Flask App
app = Flask(__name__, template_folder=TEMPLATE_DIR)

# Load Models
model = joblib.load(os.path.join(MODEL_DIR, "disease_model.pkl"))
tfidf = joblib.load(os.path.join(MODEL_DIR, "tfidf_vectorizer.pkl"))
le = joblib.load(os.path.join(MODEL_DIR, "label_encoder.pkl"))

print("✅ Models loaded successfully")
print("📂 Template directory:", TEMPLATE_DIR)

# Text Cleaning
def clean_text(text):
    text = text.lower()
    text = text.replace("_", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()

# Home Route
@app.route("/", methods=["GET", "POST"])
def home():
    if request.method == "POST":
        symptoms = request.form["symptoms"]
        cleaned = clean_text(symptoms)

        vector = tfidf.transform([cleaned])
        prediction = model.predict(vector)
        disease = le.inverse_transform(prediction)[0]

        probabilities = model.predict_proba(vector)
        confidence = round(max(probabilities[0]) * 100, 2)

        return render_template(
            "index.html",
            prediction=disease,
            confidence=confidence,
            symptoms=symptoms
        )

    return render_template("index.html")

# Chat Analysis Route
@app.route("/chat", methods=["GET"])
def chat():
    return render_template("chat.html")

@app.route("/chat_predict", methods=["POST"])
def chat_predict():
    chat_text = request.form.get("chat_text", "")
    if not chat_text:
        return redirect(url_for("chat"))

    try:
        genai_model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = (
            "You are a medical symptom extractor. Read the following conversation between a doctor and a patient. "
            "Extract all the symptoms the patient is experiencing. "
            "Output ONLY a space-separated list of the symptoms in lowercase. Do not include any other text or punctuation."
            f"\n\nConversation:\n{chat_text}"
        )
        response = genai_model.generate_content(prompt)
        extracted_symptoms_text = response.text.strip()
        
        cleaned = clean_text(extracted_symptoms_text)

        vector = tfidf.transform([cleaned])
        prediction = model.predict(vector)
        disease = le.inverse_transform(prediction)[0]

        probabilities = model.predict_proba(vector)
        confidence = round(max(probabilities[0]) * 100, 2)

        return render_template(
            "index.html",
            prediction=disease,
            confidence=confidence,
            symptoms=cleaned
        )

    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        return redirect(url_for('chat'))

# JSON API Route for Node.js Integration
@app.route("/api/predict_from_chat", methods=["POST"])
def api_predict_from_chat():
    data = request.get_json(silent=True) or {}
    chat_text = data.get("chat_text", "")
    if not chat_text:
        return jsonify({"error": "No chat_text provided"}), 400

    try:
        genai_model = genai.GenerativeModel('gemini-1.5-flash')
        prompt = (
            "You are a medical symptom extractor. Read the following conversation between a doctor and a patient. "
            "Extract all the symptoms the patient is experiencing. "
            "Output ONLY a space-separated list of the symptoms in lowercase. Do not include any other text or punctuation."
            f"\n\nConversation:\n{chat_text}"
        )
        response = genai_model.generate_content(prompt)
        extracted_symptoms_text = response.text.strip()
        
        cleaned = clean_text(extracted_symptoms_text)

        vector = tfidf.transform([cleaned])
        prediction = model.predict(vector)
        disease = le.inverse_transform(prediction)[0]

        probabilities = model.predict_proba(vector)
        confidence = round(max(probabilities[0]) * 100, 2)

        symptoms_list = [sym.strip() for sym in cleaned.split() if sym.strip()]

        return jsonify({
            "symptoms": symptoms_list,
            "prediction": str(disease),
            "confidence": confidence
        }), 200

    except Exception as e:
        print(f"Error in API prediction: {e}")
        return jsonify({"error": str(e)}), 500

# Run App
if __name__ == "__main__":
    app.run(debug=True)
