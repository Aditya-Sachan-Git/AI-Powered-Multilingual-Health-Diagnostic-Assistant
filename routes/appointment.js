const express = require("express");
const Doctor = require("../models/Doctor");
const router = express.Router();

router.get("/patient/book", (req, res) => {
  res.render("bookappointments");
});

router.post("/patient/book", async (req, res) => {
  try {
    const { patientName, patientEmail, date, time, reason } = req.body;

    const appointment = {
      patientName,
      patientEmail,
      date,
      time,
      reason,
      status: "pending"
    };

    // For now: send to all doctors
    const doctors = await Doctor.find();
    for (let doc of doctors) {
      doc.appointments.push(appointment);
      await doc.save();
    }

    res.send("Appointment request sent to all doctors!");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error booking appointment");
  }
});

module.exports = router;
