const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  patientName: { type: String, required: true },
  patientEmail: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  reason: { type: String },
  status: { 
    type: String, 
    enum: ["pending", "confirmed", "completed", "cancelled"], 
    default: "pending" 
  }
});

const doctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  phoneNumber: { type: String },
  speciality: { 
    type: String, 
    enum: [
      "General Physician",
      "Cardiologist",
      "Dermatologist",
      "Orthopedic",
      "Pediatrician",
      "Psychiatrist",
      "Neurologist",
      "Dentist"
    ],
    required: true
  },
  experience: { type: Number, default: 0 }, // years of experience
  appointments: [appointmentSchema] // sub-document array
}, { timestamps: true });

module.exports = mongoose.model("Doctor", doctorSchema);
