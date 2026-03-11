const express = require("express");
const bcrypt = require("bcrypt");
const Doctor = require("../models/Doctor");
const router = express.Router();

router.get("/doctor/signup", (req, res) => {
  res.render("doctorSignup", { error: null });
});

router.post("/doctor/signup", async (req, res) => {
  const { name, email, password, speciality, phoneNumber, experience } = req.body;
  
  try {
    const existing = await Doctor.findOne({ email });
    if (existing) return res.render("doctorSignup", { error: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newDoctor = new Doctor({
      name,
      email,
      password: hashedPassword,
      speciality,
      phoneNumber,
      experience
    });

    await newDoctor.save();
    res.cookie("doctorToken", email, { httpOnly: true });
    res.redirect("/doctor/dashboard");
  } catch (err) {
    console.error(err);
    res.render("doctorSignup", { error: "Signup failed" });
  }
});

// Doctor Login - GET page
router.get("/doctor/login", (req, res) => {
  res.render("doctorLogin", { error: null });
});

// Doctor Login - POST logic
router.post("/doctor/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const doctor = await Doctor.findOne({ email });
    if (!doctor) {
      return res.render("doctorLogin", { error: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, doctor.password);
    if (!isMatch) {
      return res.render("doctorLogin", { error: "Invalid email or password" });
    }

    // Set cookie so dashboard route works
    res.cookie("doctorToken", email, { httpOnly: true });
    res.redirect("/doctor/dashboard");
  } catch (err) {
    console.error(err);
    res.render("doctorLogin", { error: "Login failed" });
  }
});



router.get('/doctor/dashboard', async (req, res) => {
    try {
    const doctorEmail = req.cookies.doctorToken;
    if (!doctorEmail) return res.redirect("/doctor/login");

    const doctor = await Doctor.findOne({ email: doctorEmail });
    if (!doctor) return res.status(404).send("Doctor not found");

    res.render("doctorDashboard", { appointments: doctor.appointments });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error loading dashboard");
  }
});
module.exports = router;
