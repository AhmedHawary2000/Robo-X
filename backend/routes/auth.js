const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this';

// ============================================
// REGISTER - إنشاء حساب جديد
// ============================================

router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: existingUser.email === email ? 'Email already registered' : 'Username already taken'
            });
        }

        // إنشاء المستخدم (سيتم إنشاء userId تلقائياً)
        const user = new User({
            username,
            email,
            password,
            balance: 100,
            role: 'user' // ✅ الدور الافتراضي هو user
        });

        await user.save();
        console.log(`✅ User created with ID: ${user.userId}, Role: ${user.role}`);

        // إنشاء Token
        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const userData = user.toJSON();
        delete userData.password;

        res.status(201).json({
            success: true,
            message: 'User created successfully!',
            data: {
                user: {
                    id: user._id,
                    userId: user.userId,
                    username: user.username,
                    email: user.email,
                    balance: user.balance,
                    role: user.role,
                    stats: user.stats
                },
                token
            }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// ============================================
// LOGIN - تسجيل الدخول
// ============================================

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // البحث عن المستخدم
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // التحقق من الحظر
        if (user.isBanned) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been banned'
            });
        }

        // التحقق من كلمة المرور
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // تحديث آخر تسجيل دخول
        user.lastLogin = Date.now();
        await user.save();

        // إنشاء Token
        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // ✅ إرجاع بيانات المستخدم مع userId و role
        const userData = user.toJSON();
        delete userData.password;

        console.log(`✅ User logged in: ${user.username}, Role: ${user.role}`);

        res.json({
            success: true,
            message: 'Login successful!',
            data: {
                user: {
                    id: user._id,
                    userId: user.userId,
                    username: user.username,
                    email: user.email,
                    balance: user.balance,
                    role: user.role,
                    stats: user.stats,
                    isBanned: user.isBanned
                },
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// ============================================
// GET CURRENT USER - جلب بيانات المستخدم الحالي
// ============================================

router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.isBanned) {
            return res.status(403).json({
                success: false,
                message: 'Your account has been banned'
            });
        }

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    userId: user.userId,
                    username: user.username,
                    email: user.email,
                    balance: user.balance,
                    role: user.role,
                    stats: user.stats,
                    isBanned: user.isBanned
                }
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

// ============================================
// GET USER BY USER ID (للمسؤول)
// ============================================

router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const user = await User.findOne({ userId }).select('-password');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: `User with ID ${userId} not found`
            });
        }
        
        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    userId: user.userId,
                    username: user.username,
                    email: user.email,
                    balance: user.balance,
                    role: user.role,
                    stats: user.stats
                }
            }
        });
        
    } catch (error) {
        console.error('Get user by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

module.exports = router;