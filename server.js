const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const cors = require("cors");
app.use(cors());


// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// ========== FILE SYSTEM SETUP ==========
const DESKTOP_PATH = path.join(require('os').homedir(), 'Desktop');
const REGISTER_DATA_PATH = path.join(DESKTOP_PATH, 'RegisterData');
const LOGIN_DATA_PATH = path.join(DESKTOP_PATH, 'LoginData');
const DUPLICATE_DATA_PATH = path.join(DESKTOP_PATH, 'DuplicateData');

// Create directories if they don't exist
[REGISTER_DATA_PATH, LOGIN_DATA_PATH, DUPLICATE_DATA_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

// ========== IN-MEMORY STORAGE ==========
const otpStore = new Map();
const userStore = new Map();

// ========== EMAIL TRANSPORTER ==========
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: "psramvnp95@gmail.com",
        pass: "mdqg gdyn zttj aebt"
    }
});

// ========== HELPER FUNCTIONS ==========
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function getFolderNameFromEmail(email) {
    return email.replace(/[@.]/g, '_');
}

function findUserFolderByEmail(email, basePath) {
    try {
        if (!fs.existsSync(basePath)) return null;
        
        const folders = fs.readdirSync(basePath);
        
        for (const folder of folders) {
            const folderPath = path.join(basePath, folder);
            const jsonPath = path.join(folderPath, 'userdata.json');
            
            if (fs.existsSync(jsonPath)) {
                try {
                    const jsonData = fs.readFileSync(jsonPath, 'utf8');
                    const userData = JSON.parse(jsonData);
                    
                    if (userData.userEmail && 
                        userData.userEmail.toLowerCase() === email.toLowerCase()) {
                        return folderPath;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
    } catch (e) {
        console.error(`Error finding user folder: ${e.message}`);
    }
    return null;
}

function getAllUsersFromFolder(folderPath) {
    const users = [];
    
    try {
        if (!fs.existsSync(folderPath)) return users;
        
        const folders = fs.readdirSync(folderPath);
        
        for (const folder of folders) {
            const folderFullPath = path.join(folderPath, folder);
            const jsonPath = path.join(folderFullPath, 'userdata.json');
            
            if (fs.existsSync(jsonPath)) {
                try {
                    const jsonData = fs.readFileSync(jsonPath, 'utf8');
                    const userData = JSON.parse(jsonData);
                    users.push(userData);
                } catch (e) {
                    console.error(`Error reading ${jsonPath}: ${e.message}`);
                }
            }
        }
    } catch (e) {
        console.error(`Error getting users from folder: ${e.message}`);
    }
    
    return users;
}

// ========== API ENDPOINTS ==========

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        folders: {
            registerData: REGISTER_DATA_PATH,
            loginData: LOGIN_DATA_PATH,
            duplicateData: DUPLICATE_DATA_PATH
        }
    });
});

// Check email availability
app.post('/api/check-email', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email is required' 
        });
    }
    
    const emailLower = email.toLowerCase();
    
    // Check in RegisterData
    const registerFolder = findUserFolderByEmail(email, REGISTER_DATA_PATH);
    const inRegisterData = registerFolder !== null;
    
    // Check in LoginData
    const loginFolder = findUserFolderByEmail(email, LOGIN_DATA_PATH);
    const inLoginData = loginFolder !== null;
    
    // Check in DuplicateData
    const duplicateFolder = findUserFolderByEmail(email, DUPLICATE_DATA_PATH);
    const isDuplicate = duplicateFolder !== null;
    
    const isAvailable = !inRegisterData && !inLoginData && !isDuplicate;
    
    return res.json({
        success: true,
        isAvailable,
        inRegisterData,
        inLoginData,
        isDuplicate,
        message: isAvailable ? 'Email is available' : 'Email already registered'
    });
});

// Check if user exists (for login)
app.post('/api/check-user-exists', (req, res) => {
    const { email, checkType } = req.body;
    
    if (!email) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email is required' 
        });
    }
    
    const loginFolder = findUserFolderByEmail(email, LOGIN_DATA_PATH);
    const exists = loginFolder !== null;
    
    return res.json({
        success: true,
        isAvailable: !exists,
        message: exists ? 'User exists' : 'User not found'
    });
});

// Send OTP for registration
app.post('/api/send-register-otp', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email is required' 
        });
    }
    
    const otp = generateOTP();
    otpStore.set(email.toLowerCase(), {
        otp,
        timestamp: Date.now(),
        type: 'register'
    });
    
    try {
        await transporter.sendMail({
            from: "psramvnp95@gmail.com",
            to: email,
            subject: 'Registration OTP - Your App',
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #4CAF50;">Registration OTP</h2>
                    <p>Your One-Time Password (OTP) for registration is:</p>
                    <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold;">
                        ${otp}
                    </div>
                    <p>This OTP is valid for 5 minutes.</p>
                </div>
            `
        });
        
        res.json({ 
            success: true, 
            message: 'OTP sent successfully',
            otp: otp // Remove in production
        });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP' 
        });
    }
});

// Send OTP for login
app.post('/api/send-login-otp', async (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email is required' 
        });
    }
    
    const otp = generateOTP();
    otpStore.set(email.toLowerCase(), {
        otp,
        timestamp: Date.now(),
        type: 'login'
    });
    
    try {
        await transporter.sendMail({
            from: "psramvnp95@gmail.com",
            to: email,
            subject: 'Login OTP - Your App',
            html: `
                <div style="font-family: Arial, sans-serif;">
                    <h2 style="color: #2196F3;">Login OTP</h2>
                    <p>Your One-Time Password (OTP) for login is:</p>
                    <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold;">
                        ${otp}
                    </div>
                    <p>This OTP is valid for 5 minutes.</p>
                </div>
            `
        });
        
        res.json({ 
            success: true, 
            message: 'OTP sent successfully',
            otp: otp // Remove in production
        });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send OTP' 
        });
    }
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and OTP are required' 
        });
    }
    
    const storedData = otpStore.get(email.toLowerCase());
    
    if (!storedData) {
        return res.json({ 
            success: false, 
            message: 'OTP not found or expired' 
        });
    }
    
    const currentTime = Date.now();
    const otpAge = currentTime - storedData.timestamp;
    const fiveMinutes = 5 * 60 * 1000;
    
    if (otpAge > fiveMinutes) {
        otpStore.delete(email.toLowerCase());
        return res.json({ 
            success: false, 
            message: 'OTP expired' 
        });
    }
    
    if (storedData.otp === otp) {
        otpStore.delete(email.toLowerCase());
        return res.json({ 
            success: true, 
            message: 'OTP verified successfully' 
        });
    } else {
        return res.json({ 
            success: false, 
            message: 'Invalid OTP' 
        });
    }
});

// ========== REGISTRATION ENDPOINT ==========
app.post('/api/user/register', (req, res) => {
    const { userData, operation, targetFolder } = req.body;
    
    if (!userData || !userData.userEmail) {
        return res.status(400).json({
            success: false,
            message: 'Invalid user data'
        });
    }
    
    try {
        const userFolderName = getFolderNameFromEmail(userData.userEmail);
        let userFolderPath = path.join(REGISTER_DATA_PATH, userFolderName);
        
        // Handle duplicates
        if (fs.existsSync(userFolderPath)) {
            userFolderPath = path.join(REGISTER_DATA_PATH, `${userFolderName}_${Date.now()}`);
        }
        
        fs.mkdirSync(userFolderPath, { recursive: true });
        
        // Save PNG file
        if (userData.pngBase64) {
            const pngFileName = `${userData.userID}_${Date.now()}.png`;
            const pngPath = path.join(userFolderPath, pngFileName);
            const pngBuffer = Buffer.from(userData.pngBase64, 'base64');
            fs.writeFileSync(pngPath, pngBuffer);
            userData.pngFileName = pngFileName;
        }
        
        // Remove base64 from JSON
        delete userData.pngBase64;
        
        // Save JSON
        const jsonPath = path.join(userFolderPath, 'userdata.json');
        fs.writeFileSync(jsonPath, JSON.stringify(userData, null, 2));
        
        return res.json({
            success: true,
            message: 'Registration successful',
            folderPath: userFolderPath
        });
    } catch (error) {
        console.error(`Error saving user data: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: `Registration failed: ${error.message}`
        });
    }
});

// ========== EMAIL ENDPOINTS ==========

// Send registration email
app.post('/api/send-registration-email', async (req, res) => {
    const { email, userName, userID } = req.body;
    
    if (!email || !userName) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and user name are required' 
        });
    }
    
    try {
        await transporter.sendMail({
            from: "psramvnp95@gmail.com",
            to: email,
            subject: 'Registration Successful - Manual Activation Required',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4CAF50;">Registration Successful!</h2>
                    <p>Hello ${userName},</p>
                    <p>Thank you for registering! Your account has been created and is pending activation.</p>
                    <p><strong>Registration Details:</strong></p>
                    <ul>
                        <li>Name: ${userName}</li>
                        <li>Email: ${email}</li>
                        ${userID ? `<li>User ID: ${userID}</li>` : ''}
                    </ul>
                    <p>You will receive another email when your account is activated.</p>
                </div>
            `
        });
        
        res.json({ 
            success: true, 
            message: 'Registration email sent successfully' 
        });
    } catch (error) {
        console.error('Error sending registration email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send registration email' 
        });
    }
});

// Send activation email
app.post('/api/send-activation-email', async (req, res) => {
    const { email, userName } = req.body;
    
    if (!email || !userName) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and user name are required' 
        });
    }
    
    try {
        await transporter.sendMail({
            from: "psramvnp95@gmail.com",
            to: email,
            subject: '🎉 Account Activated Successfully!',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4CAF50;">Account Activated!</h2>
                    <p>Hello ${userName},</p>
                    <p>Your account has been successfully activated!</p>
                    <p>You can now log in using your email and password.</p>
                </div>
            `
        });
        
        res.json({ 
            success: true, 
            message: 'Activation email sent successfully' 
        });
    } catch (error) {
        console.error('Error sending activation email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send activation email' 
        });
    }
});

// Send deactivation email
app.post('/api/send-deactivation-email', async (req, res) => {
    const { email, userName } = req.body;
    
    if (!email || !userName) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and user name are required' 
        });
    }
    
    try {
        await transporter.sendMail({
            from: "psramvnp95@gmail.com",
            to: email,
            subject: '⚠️ Account Deactivated',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #f44336;">Account Deactivated</h2>
                    <p>Hello ${userName},</p>
                    <p>Your account has been deactivated.</p>
                    <p>If you believe this was done in error, please contact support.</p>
                </div>
            `
        });
        
        res.json({ 
            success: true, 
            message: 'Deactivation email sent successfully' 
        });
    } catch (error) {
        console.error('Error sending deactivation email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send deactivation email' 
        });
    }
});

// Send duplicate data email
app.post('/api/send-duplicate-email', async (req, res) => {
    const { email, userName, userID, userEmail, mobileNumber, registrationDate, duplicatePath } = req.body;
    
    if (!email || !userName) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and user name are required' 
        });
    }
    
    try {
        await transporter.sendMail({
            from: "psramvnp95@gmail.com",
            to: email,
            subject: '⚠️ Duplicate Registration Detected',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ff9800;">Duplicate Registration Detected</h2>
                    <p>Hello ${userName},</p>
                    <p>Our system detected a duplicate registration attempt.</p>
                    <p>If this was you, please contact support for assistance.</p>
                </div>
            `
        });
        
        res.json({ 
            success: true, 
            message: 'Duplicate data email sent successfully' 
        });
    } catch (error) {
        console.error('Error sending duplicate email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send duplicate email' 
        });
    }
});

// Send password reset email
app.post('/api/send-password-reset-email', async (req, res) => {
    const { email, userName } = req.body;
    
    if (!email || !userName) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and user name are required' 
        });
    }
    
    try {
        await transporter.sendMail({
            from: "psramvnp95@gmail.com",
            to: email,
            subject: '🔑 Password Reset Confirmation',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2196F3;">Password Reset</h2>
                    <p>Hello ${userName},</p>
                    <p>Your password has been successfully reset.</p>
                    <p>You can now log in with your new password.</p>
                </div>
            `
        });
        
        res.json({ 
            success: true, 
            message: 'Password reset email sent successfully' 
        });
    } catch (error) {
        console.error('Error sending password reset email:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send password reset email' 
        });
    }
});

// ========== FOLDER MANAGEMENT ENDPOINTS ==========

// Get all users from folder
app.get('/api/folder/users/:folderName', (req, res) => {
    const { folderName } = req.params;
    
    let folderPath;
    switch (folderName) {
        case 'RegisterData':
            folderPath = REGISTER_DATA_PATH;
            break;
        case 'LoginData':
            folderPath = LOGIN_DATA_PATH;
            break;
        case 'DuplicateData':
            folderPath = DUPLICATE_DATA_PATH;
            break;
        default:
            return res.status(400).json({
                success: false,
                message: 'Invalid folder name'
            });
    }
    
    const users = getAllUsersFromFolder(folderPath);
    
    return res.json({
        success: true,
        users,
        folder: folderName,
        count: users.length
    });
});

// Check for duplicates
app.get('/api/folder/duplicates/check', (req, res) => {
    const duplicateUsers = getAllUsersFromFolder(DUPLICATE_DATA_PATH);
    
    return res.json({
        success: true,
        users: duplicateUsers,
        folderPath: DUPLICATE_DATA_PATH,
        count: duplicateUsers.length
    });
});

// Get user data
app.post('/api/user/get', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email is required'
        });
    }
    
    // Try LoginData first
    let folderPath = findUserFolderByEmail(email, LOGIN_DATA_PATH);
    let source = 'LoginData';
    
    if (!folderPath) {
        folderPath = findUserFolderByEmail(email, REGISTER_DATA_PATH);
        source = 'RegisterData';
    }
    
    if (!folderPath) {
        return res.json({
            success: false,
            message: 'User not found'
        });
    }
    
    try {
        const jsonPath = path.join(folderPath, 'userdata.json');
        const jsonData = fs.readFileSync(jsonPath, 'utf8');
        const userData = JSON.parse(jsonData);
        
        return res.json({
            success: true,
            message: 'User data retrieved',
            userData,
            source
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error retrieving user: ${error.message}`
        });
    }
});

// Update user password
app.post('/api/user/update-password', (req, res) => {
    const { email, newPassword, operation } = req.body;
    
    if (!email || !newPassword) {
        return res.status(400).json({
            success: false,
            message: 'Email and new password are required'
        });
    }
    
    const loginFolder = findUserFolderByEmail(email, LOGIN_DATA_PATH);
    
    if (!loginFolder) {
        return res.json({
            success: false,
            message: 'User not found in LoginData'
        });
    }
    
    try {
        const jsonPath = path.join(loginFolder, 'userdata.json');
        const jsonData = fs.readFileSync(jsonPath, 'utf8');
        const userData = JSON.parse(jsonData);
        
        userData.passwordHash = newPassword;
        
        fs.writeFileSync(jsonPath, JSON.stringify(userData, null, 2));
        
        return res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error updating password: ${error.message}`
        });
    }
});

// Verify password
app.post('/api/verify-password', (req, res) => {
    const { email, passwordHash } = req.body;
    
    if (!email || !passwordHash) {
        return res.status(400).json({ 
            success: false, 
            message: 'Email and password are required' 
        });
    }
    
    const loginFolder = findUserFolderByEmail(email, LOGIN_DATA_PATH);
    
    if (!loginFolder) {
        return res.json({
            success: false,
            message: 'User not found in LoginData'
        });
    }
    
    try {
        const jsonPath = path.join(loginFolder, 'userdata.json');
        const jsonData = fs.readFileSync(jsonPath, 'utf8');
        const userData = JSON.parse(jsonData);
        
        if (userData.passwordHash === passwordHash) {
            return res.json({
                success: true,
                message: 'Password verified',
                userData
            });
        } else {
            return res.json({
                success: false,
                message: 'Invalid password'
            });
        }
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error verifying password: ${error.message}`
        });
    }
});

// Update user data
app.post('/api/user/update', (req, res) => {
    const { userData, operation, targetFolder } = req.body;
    
    if (!userData || !userData.userEmail) {
        return res.status(400).json({
            success: false,
            message: 'Invalid user data'
        });
    }
    
    let folderPath = null;
    
    if (targetFolder === 'LoginData') {
        folderPath = findUserFolderByEmail(userData.userEmail, LOGIN_DATA_PATH);
    } else {
        folderPath = findUserFolderByEmail(userData.userEmail, REGISTER_DATA_PATH);
    }
    
    if (!folderPath) {
        return res.json({
            success: false,
            message: 'User not found'
        });
    }
    
    try {
        const jsonPath = path.join(folderPath, 'userdata.json');
        fs.writeFileSync(jsonPath, JSON.stringify(userData, null, 2));
        
        return res.json({
            success: true,
            message: 'User data updated successfully'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: `Error updating user: ${error.message}`
        });
    }
});

// Clean up expired OTPs
setInterval(() => {
    const currentTime = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    for (const [email, data] of otpStore.entries()) {
        if (currentTime - data.timestamp > fiveMinutes) {
            otpStore.delete(email);
            console.log(`Cleaned up expired OTP for ${email}`);
        }
    }
}, 5 * 60 * 1000);

// ========== ADMIN API ENDPOINTS ==========

// Activate user (move from RegisterData to LoginData)
app.post('/api/admin/activate-user', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email required' });
    }
    
    try {
        // Find user in RegisterData
        const registerFolder = findUserFolderByEmail(email, REGISTER_DATA_PATH);
        
        if (!registerFolder) {
            return res.json({ success: false, message: 'User not found in RegisterData' });
        }
        
        // Read user data
        const jsonPath = path.join(registerFolder, 'userdata.json');
        const jsonData = fs.readFileSync(jsonPath, 'utf8');
        const userData = JSON.parse(jsonData);
        
        // Update status
        userData.isActive = true;
        userData.activationTime = new Date().toISOString();
        
        // Create folder in LoginData
        const userFolderName = getFolderNameFromEmail(email);
        const loginFolder = path.join(LOGIN_DATA_PATH, userFolderName);
        
        if (!fs.existsSync(loginFolder)) {
            fs.mkdirSync(loginFolder, { recursive: true });
        }
        
        // Copy image if exists
        if (userData.pngFileName) {
            const oldImagePath = path.join(registerFolder, userData.pngFileName);
            const newImagePath = path.join(loginFolder, userData.pngFileName);
            if (fs.existsSync(oldImagePath)) {
                fs.copyFileSync(oldImagePath, newImagePath);
            }
        }
        
        // Save to LoginData
        const newJsonPath = path.join(loginFolder, 'userdata.json');
        fs.writeFileSync(newJsonPath, JSON.stringify(userData, null, 2));
        
        // Delete from RegisterData
        fs.rmSync(registerFolder, { recursive: true, force: true });
        
        // Send activation email
        sendEmailNotification('activation', email, userData.userName);
        
        res.json({ success: true, message: 'User activated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Deactivate user (move from LoginData to RegisterData)
app.post('/api/admin/deactivate-user', (req, res) => {
    const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email required' });
    }
    
    try {
        // Find user in LoginData
        const loginFolder = findUserFolderByEmail(email, LOGIN_DATA_PATH);
        
        if (!loginFolder) {
            return res.json({ success: false, message: 'User not found in LoginData' });
        }
        
        // Read user data
        const jsonPath = path.join(loginFolder, 'userdata.json');
        const jsonData = fs.readFileSync(jsonPath, 'utf8');
        const userData = JSON.parse(jsonData);
        
        // Update status
        userData.isActive = false;
        userData.lastDeactivationTime = new Date().toISOString();
        
        // Create folder in RegisterData with timestamp
        const userFolderName = getFolderNameFromEmail(email);
        const registerFolder = path.join(REGISTER_DATA_PATH, `${userFolderName}_deactivated_${Date.now()}`);
        
        fs.mkdirSync(registerFolder, { recursive: true });
        
        // Copy image if exists
        if (userData.pngFileName) {
            const oldImagePath = path.join(loginFolder, userData.pngFileName);
            const newImagePath = path.join(registerFolder, userData.pngFileName);
            if (fs.existsSync(oldImagePath)) {
                fs.copyFileSync(oldImagePath, newImagePath);
            }
        }
        
        // Save to RegisterData
        const newJsonPath = path.join(registerFolder, 'userdata.json');
        fs.writeFileSync(newJsonPath, JSON.stringify(userData, null, 2));
        
        // Delete from LoginData
        fs.rmSync(loginFolder, { recursive: true, force: true });
        
        // Send deactivation email
        sendEmailNotification('deactivation', email, userData.userName);
        
        res.json({ success: true, message: 'User deactivated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete user
app.post('/api/admin/delete-user', (req, res) => {
    const { email, folder } = req.body;
    
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email required' });
    }
    
    try {
        let targetPath;
        
        if (folder === 'LoginData') {
            targetPath = findUserFolderByEmail(email, LOGIN_DATA_PATH);
        } else if (folder === 'RegisterData') {
            targetPath = findUserFolderByEmail(email, REGISTER_DATA_PATH);
        } else if (folder === 'DuplicateData') {
            targetPath = findUserFolderByEmail(email, DUPLICATE_DATA_PATH);
        }
        
        if (!targetPath) {
            return res.json({ success: false, message: 'User not found' });
        }
        
        // Delete folder
        fs.rmSync(targetPath, { recursive: true, force: true });
        
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Clear duplicate data
app.post('/api/admin/clear-duplicates', (req, res) => {
    try {
        if (fs.existsSync(DUPLICATE_DATA_PATH)) {
            fs.rmSync(DUPLICATE_DATA_PATH, { recursive: true, force: true });
            fs.mkdirSync(DUPLICATE_DATA_PATH, { recursive: true });
        }
        
        res.json({ success: true, message: 'Duplicate folder cleared' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper function to send email notifications
function sendEmailNotification(type, email, userName) {
    let subject, html;
    
    switch(type) {
        case 'activation':
            subject = '✅ Account Activated';
            html = `<h2>Account Activated</h2><p>Hello ${userName}, your account has been activated by an administrator.</p>`;
            break;
        case 'deactivation':
            subject = '⚠️ Account Deactivated';
            html = `<h2>Account Deactivated</h2><p>Hello ${userName}, your account has been deactivated by an administrator.</p>`;
            break;
        default:
            return;
    }
    
    transporter.sendMail({
        from: "psramvnp95@gmail.com",
        to: email,
        subject: subject,
        html: html
    }).catch(console.error);
}


// Serve static images
app.use('/images', express.static(REGISTER_DATA_PATH));
app.use('/images/LoginData', express.static(LOGIN_DATA_PATH));

// Start server
app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📧 Email: psramvnp95@gmail.com`);
    console.log(`📁 RegisterData: ${REGISTER_DATA_PATH}`);
    console.log(`📁 LoginData: ${LOGIN_DATA_PATH}`);
    console.log(`📁 DuplicateData: ${DUPLICATE_DATA_PATH}`);
    console.log(`=================================`);
    console.log(`Test endpoint: http://localhost:${PORT}/api/test`);
    console.log(`=================================`);
});