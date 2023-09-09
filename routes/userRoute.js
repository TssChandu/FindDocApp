const express = require("express")
const router = express.Router();
const nodemailer = require("nodemailer");
const User = require("../models/userModel")
const Doctor = require('../models/doctorModel')
const bcrypt = require("bcryptjs")
const moment = require('moment')
const jwt = require("jsonwebtoken")
const Appointment = require('../models/appointmentModel')
const authMiddleware = require('../middlewares/authMiddleware')

router.post("/register", async (req, res) => {
  try {
    const userExists = await User.findOne({ email: req.body.email });
    if (userExists) {
      return res.status(200).send({ message: "User already exists", success: false });
    }
    const password = req.body.password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    req.body.password = hashedPassword;
    const newuser = new User(req.body);
    await newuser.save()
    res.status(200).send({ message: "User created successfully", success: true });
  } catch (error) {
    console.log(error)
    res.status(500).send({ message: "Error creating user", success: false, error });
  }
})
router.post("/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(200).send({ message: "User does not exist" });
    }
    const isMatch = await bcrypt.compare(req.body.password, user.password);
    if (!isMatch) {
      return res.status(200).send({ message: "Password is incorrect" });
    } else {
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "10d"
      });
      res.status(200).send({ message: "Login Successful", success: true, data: token })
    }
  } catch (error) {
    console.log(error)
    res.status(500).send({ message: "Error Logging In", success: false, error });
  }
})

function sendEmail({ recipient_email, OTP }) {
  return new Promise((resolve, reject) => {
    var transporter = nodemailer.createTransport({
      service: "gmail",
      secure: false,
      auth: {
        user: process.env.MY_EMAIL,
        pass: process.env.MY_PASSWORD,
      },
    });

    const mail_configs = {
      from: process.env.MY_EMAIL,
      to: recipient_email,
      subject: "FINDDOC PASSWORD RECOVERY",
      html: `<!DOCTYPE html>
<html lang="en" >
<head>
  <meta charset="UTF-8">
  <title>FINDDOC PASSWORD RECOVERY</title>
</head>
<body>
<!-- partial:index.partial.html -->
<div style="font-family: Helvetica,Arial,sans-serif;min-width:1000px;overflow:auto;line-height:2">
  <div style="margin:50px auto;width:70%;padding:20px 0">
    <div style="border-bottom:1px solid #eee">
      <a href="" style="font-size:1.4em;color: #00466a;text-decoration:none;font-weight:600">FINDDOC</a>
    </div>
    <p style="font-size:1.1em">Hi,</p>
    <p>Thank you for using FINDDOC. Use the following OTP to complete your Password Recovery Procedure. OTP is valid for 5 minutes</p>
    <h2 style="background: #00466a;margin: 0 auto;width: max-content;padding: 0 10px;color: #fff;border-radius: 4px;">${OTP}</h2>
    <p style="font-size:0.9em;">Regards,<br />FINDDOC</p>
    <hr style="border:none;border-top:1px solid #eee" />
    <div style="float:right;padding:8px 0;color:#aaa;font-size:0.8em;line-height:1;font-weight:300">
      <p>FINDDOC Inc</p>
    </div>
  </div>
</div>
<!-- partial -->
</body>
</html>`,
    };
    transporter.sendMail(mail_configs, function (error, info) {
      if (error) {
        console.log(error);
        return reject({ message: `An error has occured` });
      }
      return resolve({ message: "Email sent succesfuly", success: true });
    });
  });
}

router.post("/send_recovery_email", async (req, res) => {
  const { recipient_email } = req.body;
  const user = await User.findOne({ email: recipient_email })
  if (!user) {
    return res.send({ message: "User not existed", success: false })
  }
  sendEmail(req.body)
    .then((response) => res.send(response))
    .catch((error) => res.status(500).send(error.message));
});

router.post("/reset-password", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    const password = req.body.password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    user.password = hashedPassword
    await user.save()
    res.status(200).send({ message: "Password updated successfully", success: true });
  } catch (error) {
    console.log(error)
    res.status(500).send({ message: "Error updating Password", success: false, error });
  }
})

router.post("/get-user-info-by-id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.body.userId });
    user.password = undefined
    if (!user) {
      return res.status(200).send({
        message: "User does not exist",
        success: false
      })
    } else {
      res.status(200).send({
        success: true,
        data: user
      })
    }
  } catch (error) {
    console.log(error)
    res.status(500).send({ message: "Error getting user info", success: false, error });
  }
})

router.post("/apply-doctor-account", authMiddleware, async (req, res) => {
  try {
    const newdoctor = new Doctor({ ...req.body, status: "pending" });
    await newdoctor.save();
    const adminUser = await User.findOne({ isAdmin: true });

    const unseenNotifications = adminUser.unseenNotifications
    unseenNotifications.push({
      type: "new-doctor-request",
      message: `${newdoctor.firstName} ${newdoctor.lastName} has applied for a doctor account`,
      data: {
        doctorId: newdoctor._id,
        name: newdoctor.firstName + " " + newdoctor.lastName
      },
      onClickPath: "/admin/doctorslist"
    })
    await User.findByIdAndUpdate(adminUser._id, { unseenNotifications });
    res.status(200).send({
      success: true,
      message: "Doctor account applied successfully"
    });
  } catch (error) {
    console.log(error)
    res.status(500).send({ message: "Error applying doctor account", success: false, error });
  }
})

router.post("/mark-all-notifications-as-seen", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.body.userId });
    const unseenNotifications = user.unseenNotifications;
    const seenNotifications = user.seenNotifications;
    seenNotifications.push(...unseenNotifications);
    user.unseenNotifications = [];
    user.seenNotifications = seenNotifications;
    const updatedUser = await user.save();
    updatedUser.password = undefined
    res.status(200).send({
      success: true,
      message: "All notifications are marked as seen",
      data: updatedUser,
    });
  } catch (error) {
    console.log(error)
    res.status(500).send({ message: "Error marking notifications as seen", success: false, error });
  }
})

router.post("/delete-all-notifications", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.body.userId });
    user.seenNotifications = [];
    user.unseenNotifications = [];
    const updatedUser = await user.save();
    updatedUser.password = undefined
    res.status(200).send({
      success: true,
      message: "All notifications are deleted",
      data: updatedUser,
    });
  } catch (error) {
    console.log(error)
    res.status(500).send({ message: "Error deleting notifications", success: false, error });
  }
})

router.get("/get-all-approved-doctors", authMiddleware, async (req, res) => {
  try {
    const doctors = await Doctor.find({ status: "approved" });
    res
      .status(200)
      .send({
        message: "Doctors fetched successfully",
        success: true,
        data: doctors,
      })
  } catch (error) {
    console.log(error)
    res.status(500).send({
      message: "Error fetching Doctors",
      success: false,
      error
    });
  }
})

router.post("/book-appointment", authMiddleware, async (req, res) => {
  try {
    req.body.status = 'pending';
    req.body.date = moment(req.body.date, 'DD-MM-YYYY').toISOString();
    req.body.time = moment(req.body.time, "HH:mm").toISOString();
    const newAppointment = new Appointment(req.body);
    await newAppointment.save();
    const user = await User.findOne({ _id: req.body.doctorInfo.userId });
    user.unseenNotifications.push({
      type: "new-appointment-request",
      message: `A new Appointment request has been made by ${req.body.userInfo.name}`,
      onClickPath: '/doctor/appointments',
    });
    await user.save();
    res.status(200).send({
      message: "Appointment booked successfully",
      success: true,
    })
  } catch (error) {
    console.log(error)
    res.status(500).send({
      message: "Error booking a appointment",
      success: false,
      error
    });
  }
})

router.post("/check-booking-availability", authMiddleware, async (req, res) => {
  try {


    const date = moment(req.body.date, "DD-MM-YYYY").toISOString();
    const fromTime = moment(req.body.time, "HH:mm")
      .subtract(1, "hours")
      .toISOString();
    const toTime = moment(req.body.time, "HH:mm").add(1, "hours").toISOString();
    const doctorId = req.body.doctorId;
    const appointments = await Appointment.find({
      doctorId,
      date,
      time: { $gte: fromTime, $lte: toTime },
    });
    if (appointments.length > 0) {
      return res.status(200).send({
        message: "Appointments not available",
        success: false,
      });
    } else {
      return res.status(200).send({
        message: "Appointments available",
        success: true,
      });
    }
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Error booking appointment",
      success: false,
      error,
    });
  }
})

router.get("/get-appointments-by-user-id", authMiddleware, async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.body.userId });
    res.status(200).send({
      message: "Appointments fetched successfully",
      success: true,
      data: appointments,
    })
  } catch (error) {
    console.log(error);
    res.status(500).send({
      message: "Error fetching appointments",
      success: false,
      error,
    });
  }
})

module.exports = router