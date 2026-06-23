const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this';

// ============================================
// MIDDLEWARE - التحقق من صلاحيات المسؤول
// ============================================

const isAdmin = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        console.log('🔑 Token received:', token ? 'Yes' : 'No');
        
        if (!token) {
            console.log('❌ No token provided');
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('👤 Decoded token:', decoded);
        
        const user = await User.findById(decoded.id);
        console.log('👤 User found:', user ? user.username : 'No user');
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        if (user.role !== 'admin') {
            console.log('❌ User is not admin. Role:', user.role);
            return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
        }
        
        console.log('✅ Admin authorized:', user.username);
        req.user = user;
        next();
    } catch (error) {
        console.error('❌ Auth error:', error.message);
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ============================================
// 📊 GET STATS
// ============================================

router.get('/stats', isAdmin, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const activeUsers = await User.countDocuments({
            lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });
        const bannedUsers = await User.countDocuments({ isBanned: true });
        
        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    banned: bannedUsers
                },
                competitions: {
                    total: 0,
                    active: 0,
                    waiting: 0,
                    completed: 0
                },
                finances: {
                    totalRevenue: 1250,
                    platformProfit: 450
                },
                robots: {
                    total: 0
                }
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 👥 GET ALL USERS
// ============================================

router.get('/users', isAdmin, async (req, res) => {
    try {
        console.log('📋 Getting users...');
        
        const { search, role, isBanned, page = 1, limit = 20 } = req.query;
        
        let query = {};
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { userId: { $regex: search, $options: 'i' } }
            ];
        }
        if (role) query.role = role;
        if (isBanned !== undefined && isBanned !== '') {
            query.isBanned = isBanned === 'true';
        }
        
        console.log('🔍 Query:', query);
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await User.countDocuments(query);
        
        console.log('📦 Found users:', users.length);
        
        res.json({
            success: true,
            data: {
                users: users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('❌ Get users error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 👤 GET SINGLE USER
// ============================================

router.get('/users/:id', isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            data: { user }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 💰 UPDATE USER BALANCE
// ============================================

router.put('/users/:id/balance', isAdmin, async (req, res) => {
    try {
        const { amount, reason } = req.body;
        
        if (!amount || amount === 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount is required and must be non-zero'
            });
        }
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const balanceBefore = user.balance;
        user.balance += amount;
        await user.save();
        
        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    balance: user.balance
                },
                transaction: {
                    amount: amount,
                    balanceBefore: balanceBefore,
                    balanceAfter: user.balance,
                    reason: reason || 'Admin adjustment'
                }
            }
        });
    } catch (error) {
        console.error('Update balance error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 🔒 BAN / UNBAN USER
// ============================================

router.put('/users/:id/ban', isAdmin, async (req, res) => {
    try {
        const { ban, reason } = req.body;
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (ban) {
            user.isBanned = true;
            user.banReason = reason || 'No reason provided';
            user.bannedAt = new Date();
        } else {
            user.isBanned = false;
            user.banReason = '';
            user.bannedAt = null;
        }
        
        await user.save();
        
        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    isBanned: user.isBanned,
                    banReason: user.banReason
                }
            }
        });
    } catch (error) {
        console.error('Ban user error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 🔄 UPDATE USER ROLE
// ============================================

router.put('/users/:id/role', isAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        
        if (!['user', 'admin', 'moderator'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }
        
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        user.role = role;
        await user.save();
        
        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    role: user.role
                }
            }
        });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 🏆 GET COMPETITIONS (Admin View)
// ============================================

router.get('/competitions', isAdmin, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                competitions: []
            }
        });
    } catch (error) {
        console.error('Get competitions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 💳 GET TRANSACTIONS (Admin View)
// ============================================

router.get('/transactions', isAdmin, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                transactions: []
            }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;