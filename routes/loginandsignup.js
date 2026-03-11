const express = require("express");
const router = express.Router();
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const User = require("../models/Users");

router.use(cookieParser());

function calculateAge(dob) {
  const birthDate = new Date(dob);
  const ageDiff = Date.now() - birthDate.getTime();
  const ageDate = new Date(ageDiff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

// GET: signup page
router.get("/signup", (req, res) => {
  res.render("signup", { error: null });
});

// GET: login page
router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

// POST: signup logic
router.post("/signup", async (req, res) => {
  const { name, dob, email, password, phoneNumber } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("signup", { error: "Email already in use" });
    }

    const age = calculateAge(dob);
    const hashedPassword = await bcrypt.hash(password, 10); // HASH PASSWORD
    const newUser = new User({
      name,
      phoneNumber,
      dob,
      age,
      email,
      password: hashedPassword,
    });

    await newUser.save();

    // If doctor, set doctor cookie
    if (name.toLowerCase() === "doctor") {
      res.cookie("token2", email);
    }

    // Always set normal login cookie
    res.cookie("token", email, { httpOnly: true });
    res.redirect("/home");
  } catch (err) {
    console.error(err);
    res.render("signup", { error: "Signup failed" });
  }
});

// POST: login logic
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.render("login", { error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.render("login", { error: "Invalid credentials" });
    }

    // If doctor, set doctor cookie
    if (user.name.toLowerCase() === "doctor") {
      res.cookie("token2", email);
    }

    res.cookie("token", email, { httpOnly: true });
    res.redirect("/home");
  } catch (err) {
    console.error(err);
    res.render("login", { error: "Login failed" });
  }
});

module.exports = router;
