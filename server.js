const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

/* ================= SAFE DATA PATH ================= */
/* Instead of Desktop → use project folder */
const DATA_PATH = path.join(__dirname, 'data');
const REGISTER_DATA_PATH = path.join(DATA_PATH, 'RegisterData');
const LOGIN_DATA_PATH = path.join(DATA_PATH, 'LoginData');
const DUPLICATE_DATA_PATH = path.join(DATA_PATH, 'DuplicateData');

[REGISTER_DATA_PATH, LOGIN_DATA_PATH, DUPLICATE_DATA_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

/* ================= IN-MEMORY STORAGE ================= */
const otpStore = new Map();

/* ================= EMAIL TRANSPORTER ================= */
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/* ================= HELPER FUNCTIONS ================= */

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getFolderNameFromEmail(email) {
    return email.replace(/[@.]/g, '_');
}

function findUserFolderByEmail(email, basePath) {
    if (!fs.existsSync(basePath)) return null;
    const folders = fs.readdirSync(basePath);

    for (const folder of folders) {
        const jsonPath = path.join(basePath, folder, 'userdata.json');
        if (fs.existsSync(jsonPath)) {
            try {
                const userData = JSON.parse(fs.readFileSync(jsonPath));
                if (userData.userEmail?.toLowerCase() === email.toLowerCase()) {
                    return path.join(basePath, folder);
                }
            } catch {}
        }
    }
    return null;
}

/* ================= TEST ================= */

app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'Server Running',
        timestamp: new Date().toISOString()
    });
});

/* ================= SEND REGISTER OTP ================= */

app.post('/api/send-register-otp', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const otp = generateOTP();
    otpStore.set(email.toLowerCase(), {
        otp,
        timestamp: Date.now()
    });

    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Registration OTP",
            html: `<h2>Your OTP: ${otp}</h2><p>Valid for 5 minutes</p>`
        });

        res.json({ success: true, message: "OTP sent successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Email send failed" });
    }
});

/* ================= VERIFY OTP ================= */

app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Missing data" });

    const stored = otpStore.get(email.toLowerCase());
    if (!stored) return res.json({ success: false, message: "OTP not found" });

    if (Date.now() - stored.timestamp > 5 * 60 * 1000) {
        otpStore.delete(email.toLowerCase());
        return res.json({ success: false, message: "OTP expired" });
    }

    if (stored.otp === otp) {
        otpStore.delete(email.toLowerCase());
        return res.json({ success: true, message: "OTP verified" });
    }

    res.json({ success: false, message: "Invalid OTP" });
});

/* ================= REGISTER USER ================= */

app.post('/api/user/register', (req, res) => {
    const { userData } = req.body;
    if (!userData?.userEmail) {
        return res.status(400).json({ success: false, message: "Invalid data" });
    }

    try {
        const folderName = getFolderNameFromEmail(userData.userEmail);
        const folderPath = path.join(REGISTER_DATA_PATH, folderName);

        fs.mkdirSync(folderPath, { recursive: true });

        if (userData.pngBase64) {
            const imagePath = path.join(folderPath, "profile.png");
            fs.writeFileSync(imagePath, Buffer.from(userData.pngBase64, 'base64'));
            delete userData.pngBase64;
        }

        fs.writeFileSync(
            path.join(folderPath, "userdata.json"),
            JSON.stringify(userData, null, 2)
        );

        res.json({ success: true, message: "User registered" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Registration failed" });
    }
});

/* ================= CLEAN EXPIRED OTP ================= */

setInterval(() => {
    const now = Date.now();
    for (const [email, data] of otpStore.entries()) {
        if (now - data.timestamp > 5 * 60 * 1000) {
            otpStore.delete(email);
        }
    }
}, 5 * 60 * 1000);

/* ================= STATIC FILES ================= */

app.use('/images/register', express.static(REGISTER_DATA_PATH));
app.use('/images/login', express.static(LOGIN_DATA_PATH));

/* ================= START SERVER ================= */

app.listen(PORT, () => {
    console.log("==================================");
    console.log(`Server running on port ${PORT}`);
    console.log(`Email: ${process.env.EMAIL_USER}`);
    console.log("==================================");
});
