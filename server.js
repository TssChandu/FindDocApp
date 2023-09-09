const express = require("express");
const app = express();
const cors = require("cors");
require('dotenv').config()
const dbConfig = require("./config/dbConfig");
const userRoute = require("./routes/userRoute");
const adminRoute = require("./routes/adminRoute");
const doctorRoute = require('./routes/doctorRoute');
const path = require("path");

app.use(express.json())
app.use(cors());
app.use(express.urlencoded({ limit: "25mb" }));
app.use((req, res, next) => {
   res.setHeader("Access-Control-Allow-Origin", "*");
   next();
});


app.use('/api/user', userRoute);
app.use('/api/doctor', doctorRoute);
app.use('/api/admin', adminRoute);

//static files
app.use(express.static(path.join(__dirname, "./client/build")));

app.get("*", function (req, res) {
   res.sendFile(path.join(__dirname, "./client/build/index.html"));
});

const port = process.env.PORT || 5000;

// console.log(process.env.MONGO_URL)
app.listen(port, () => console.log(`Node server started at port ${port}`))