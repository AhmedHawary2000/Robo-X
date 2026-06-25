const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Robot = require('../models/Robot');
const Competition = require('../models/Competition');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this';

// ============================================
// MIDDLEWARE - التحقق من صلاحيات المسؤول
// ============================================

const isAdmin = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        if (user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
        }
        
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
        console.log('📊 Fetching admin stats...');
        
        const totalUsers = await User.countDocuments();
        const bannedUsers = await User.countDocuments({ isBanned: true });
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const activeUsers = await User.countDocuments({
            lastLogin: { $gte: thirtyDaysAgo },
            isBanned: false
        });
        
        const inactiveUsers = await User.countDocuments({
            lastLogin: { $lt: thirtyDaysAgo },
            isBanned: false
        });
        
        // ✅ MOCK DATA للنسب المئوية
        const usersToday = 4;
        const usersYesterday = 3;
        const activeUsersToday = 3;
        const activeUsersYesterday = 4;
        
        let userGrowth = 0;
        if (usersYesterday > 0) {
            userGrowth = Math.round(((usersToday - usersYesterday) / usersYesterday) * 100);
        } else if (usersToday > 0) {
            userGrowth = 100;
        }
        
        let activeGrowth = 0;
        if (activeUsersYesterday > 0) {
            activeGrowth = Math.round(((activeUsersToday - activeUsersYesterday) / activeUsersYesterday) * 100);
        } else if (activeUsersToday > 0) {
            activeGrowth = 100;
        }
        
        console.log('📊 Users Stats:', { totalUsers, activeUsers, userGrowth: userGrowth + '%', activeGrowth: activeGrowth + '%' });
        
        const totalCompetitions = await Competition.countDocuments();
        const activeCompetitions = await Competition.countDocuments({ status: 'active' });
        
        const totalRobots = await Robot.countDocuments();
        
        const allCompetitions = await Competition.find({});
        let totalRevenue = 0;
        allCompetitions.forEach(function(comp) {
            const participantsCount = comp.participants?.length || 0;
            totalRevenue += comp.entryFee * participantsCount;
        });
        const platformProfit = Math.round(totalRevenue * 0.3);
        
        const recentNotifications = await Notification.find({ 
            userId: req.user._id,
            message: { $regex: /^Message sent to all users:/ }
        })
        .sort({ createdAt: -1 })
        .limit(10);
        
        res.json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    inactive: inactiveUsers,
                    banned: bannedUsers,
                    growth: userGrowth,
                    activeGrowth: activeGrowth
                },
                competitions: {
                    total: totalCompetitions,
                    active: activeCompetitions,
                    growth: 0
                },
                finances: {
                    totalRevenue: totalRevenue,
                    platformProfit: platformProfit,
                    growth: 0,
                    profitGrowth: 0
                },
                robots: {
                    total: totalRobots,
                    growth: 0
                },
                recentActivity: recentNotifications
            }
        });
    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ GET USER STATS
// ============================================

router.get('/users/stats', isAdmin, async (req, res) => {
    try {
        console.log('📊 Fetching user stats...');
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const total = await User.countDocuments();
        const active = await User.countDocuments({
            lastLogin: { $gte: thirtyDaysAgo },
            isBanned: false
        });
        const inactive = await User.countDocuments({
            lastLogin: { $lt: thirtyDaysAgo },
            isBanned: false
        });
        const banned = await User.countDocuments({ isBanned: true });
        
        console.log('📊 User stats:', { total, active, inactive, banned });
        
        res.json({
            success: true,
            data: {
                total: total || 0,
                active: active || 0,
                inactive: inactive || 0,
                banned: banned || 0
            }
        });
    } catch (error) {
        console.error('❌ User stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 👥 GET ALL USERS
// ============================================

router.get('/users', isAdmin, async (req, res) => {
    try {
        console.log('📋 Getting users...');
        
        const { search, role, status, page = 1, limit = 20 } = req.query;
        
        let query = {};
        
        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { userId: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (role) query.role = role;
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        if (status === 'active') {
            query.isBanned = false;
            query.lastLogin = { $gte: thirtyDaysAgo };
        } else if (status === 'inactive') {
            query.isBanned = false;
            query.lastLogin = { $lt: thirtyDaysAgo };
        } else if (status === 'banned') {
            query.isBanned = true;
        }
        
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
                users: users || [],
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total || 0,
                    pages: Math.ceil((total || 0) / parseInt(limit))
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
        console.error('❌ Get user error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 💰 UPDATE USER BALANCE - مع Blockchain
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
        
        // ✅ جلب محفظة المستخدم
        const Wallet = require('../models/Wallet');
        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) {
            wallet = new Wallet({ userId: user.userId });
            await wallet.save();
        }
        
        // ✅ تحديث الرصيد في محفظة المستخدم
        const balanceBefore = wallet.balance;
        wallet.balance += amount;
        wallet.totalReceived = (wallet.totalReceived || 0) + (amount > 0 ? amount : 0);
        wallet.totalSpent = (wallet.totalSpent || 0) + (amount < 0 ? Math.abs(amount) : 0);
        wallet.transactionCount = (wallet.transactionCount || 0) + 1;
        wallet.lastTransaction = new Date();
        await wallet.save();
        
        // ✅ تحديث رصيد المستخدم في User model
        user.balance = wallet.balance;
        await user.save();
        
        // ✅ إنشاء Block جديد في Blockchain
        const Block = require('../models/Block');
        const AdminAccount = require('../models/AdminAccount');
        const crypto = require('crypto');
        
        const latestBlock = await Block.findOne().sort({ index: -1 });
        const lastBlock = latestBlock || await Block.findOne({ index: 0 });
        
        const transaction = {
            type: 'admin_adjustment',
            from: 'admin',
            to: user.userId,
            amount: amount,
            fee: 0,
            description: reason || `Admin adjustment: ${amount > 0 ? '+' : ''}${amount} RX`,
            metadata: { 
                adminId: req.user._id,
                adminName: req.user.username,
                reason: reason || 'Admin adjustment'
            }
        };
        
        const newBlockIndex = (lastBlock?.index || 0) + 1;
        const newBlock = new Block({
            index: newBlockIndex,
            timestamp: new Date(),
            previousHash: lastBlock?.hash || '0',
            hash: '',
            transaction: transaction,
            nonce: 0,
            isValid: true,
            verified: true
        });
        
        const data = {
            index: newBlock.index,
            timestamp: newBlock.timestamp.getTime(),
            previousHash: newBlock.previousHash,
            transaction: newBlock.transaction,
            nonce: newBlock.nonce
        };
        newBlock.hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
        await newBlock.save();
        
        // ✅ تحديث حساب Admin
        let adminAccount = await AdminAccount.findOne();
        if (adminAccount) {
            adminAccount.totalTransactions = (adminAccount.totalTransactions || 0) + 1;
            adminAccount.lastBlockIndex = newBlock.index;
            
            if (amount > 0) {
                adminAccount.reserveBalance = (adminAccount.reserveBalance || 0) - amount;
                adminAccount.circulatingSupply = (adminAccount.circulatingSupply || 0) + amount;
                adminAccount.totalDeposits = (adminAccount.totalDeposits || 0) + amount;
            } else {
                const absAmount = Math.abs(amount);
                adminAccount.reserveBalance = (adminAccount.reserveBalance || 0) + absAmount;
                adminAccount.circulatingSupply = (adminAccount.circulatingSupply || 0) - absAmount;
                adminAccount.totalWithdrawals = (adminAccount.totalWithdrawals || 0) + absAmount;
            }
            await adminAccount.save();
        }
        
        // ✅ تسجيل المعاملة في Transaction
        const Transaction = require('../models/Transaction');
        const tx = new Transaction({
            blockIndex: newBlock.index,
            blockHash: newBlock.hash,
            type: 'admin_adjustment',
            from: 'admin',
            to: user.userId,
            amount: amount,
            fee: 0,
            fromBalanceBefore: balanceBefore,
            fromBalanceAfter: wallet.balance,
            toBalanceBefore: 0,
            toBalanceAfter: 0,
            description: reason || `Admin adjustment: ${amount > 0 ? '+' : ''}${amount} RX`,
            metadata: { 
                adminId: req.user._id,
                adminName: req.user.username,
                reason: reason || 'Admin adjustment'
            },
            status: 'confirmed'
        });
        await tx.save();
        
        // ✅ إنشاء إشعار للمستخدم
        const notification = new Notification({
            userId: user._id,
            type: 'wallet',
            title: amount > 0 ? '💰 Balance Updated' : '💸 Balance Updated',
            message: `Your balance has been ${amount > 0 ? 'increased' : 'decreased'} by ${Math.abs(amount)} RX. ${reason || ''}`,
            icon: amount > 0 ? '💰' : '💸',
            link: '/dashboard#wallet',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await notification.save();
        
        console.log(`✅ Block #${newBlock.index} created: ${amount > 0 ? '+' : ''}${amount} RX for ${user.username}`);
        
        res.json({
            success: true,
            message: `User balance updated! Block #${newBlock.index} created.`,
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    balance: wallet.balance
                },
                block: newBlock,
                transaction: tx,
                adminBalance: adminAccount?.reserveBalance || 0
            }
        });
    } catch (error) {
        console.error('❌ Update balance error:', error);
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
            
            const notification = new Notification({
                userId: user._id,
                type: 'warning',
                title: '🚫 Account Banned',
                message: `Your account has been banned. Reason: ${user.banReason}`,
                icon: '🚫',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
        } else {
            user.isBanned = false;
            user.banReason = '';
            user.bannedAt = null;
            
            const notification = new Notification({
                userId: user._id,
                type: 'success',
                title: '✅ Account Unbanned',
                message: 'Your account has been unbanned. Welcome back!',
                icon: '✅',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
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
        console.error('❌ Ban user error:', error);
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
        
        const oldRole = user.role;
        user.role = role;
        await user.save();
        
        const notification = new Notification({
            userId: user._id,
            type: 'info',
            title: '🔄 Role Updated',
            message: `Your role has been changed from ${oldRole} to ${role}.`,
            icon: '🔄',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await notification.save();
        
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
        console.error('❌ Update role error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 🏆 GET COMPETITIONS
// ============================================

router.get('/competitions', isAdmin, async (req, res) => {
    try {
        const { status, type, limit = 50 } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (type) query.type = type;
        
        const competitions = await Competition.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('participants.user', 'username email');
        
        res.json({
            success: true,
            data: {
                competitions: competitions || []
            }
        });
    } catch (error) {
        console.error('❌ Get competitions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 📢 GET NOTIFICATIONS
// ============================================

router.get('/notifications', isAdmin, async (req, res) => {
    try {
        const { limit = 20, type, userId } = req.query;
        
        let query = {};
        if (type) query.type = type;
        if (userId) query.userId = userId;
        
        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('userId', 'username email');
        
        const unreadCount = await Notification.countDocuments({ 
            ...query,
            isRead: false 
        });
        
        res.json({
            success: true,
            data: {
                notifications: notifications || [],
                unreadCount: unreadCount || 0,
                total: await Notification.countDocuments(query) || 0
            }
        });
    } catch (error) {
        console.error('❌ Notifications error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ MARK NOTIFICATION AS READ
// ============================================

router.put('/notifications/:id/read', isAdmin, async (req, res) => {
    try {
        const notification = await Notification.findById(req.params.id);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        notification.isRead = true;
        await notification.save();
        
        res.json({
            success: true,
            data: { notification }
        });
    } catch (error) {
        console.error('❌ Mark notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ MARK ALL NOTIFICATIONS AS READ
// ============================================

router.put('/notifications/read-all', isAdmin, async (req, res) => {
    try {
        const { userId } = req.body;
        
        let query = { isRead: false };
        if (userId) query.userId = userId;
        
        await Notification.updateMany(query, { isRead: true });
        
        res.json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('❌ Mark all notifications error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 🗑️ DELETE NOTIFICATION
// ============================================

router.delete('/notifications/:id', isAdmin, async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('❌ Delete notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 📢 SEND GLOBAL MESSAGE
// ============================================

router.post('/send-global-message', isAdmin, async (req, res) => {
    try {
        const { title, message, icon, type } = req.body;
        
        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }
        
        const users = await User.find({ role: { $ne: 'admin' } }, '_id');
        console.log(`📢 Sending to ${users.length} users (excluding admin)`);
        
        const notifications = [];
        
        for (const user of users) {
            notifications.push({
                userId: user._id,
                type: type || 'global',
                title: title,
                message: message,
                icon: icon || '📢',
                isRead: false,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
        }
        
        // ✅ إشعار واحد فقط للـ Admin
        notifications.push({
            userId: req.user._id,
            type: 'global',
            title: '📢 ' + title,
            message: 'Message sent to all users: ' + message,
            icon: '📢',
            isRead: false,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        
        // ✅ التحقق من وجود إشعار مكرر للـ Admin
        const existingAdminNotif = await Notification.findOne({
            userId: req.user._id,
            title: '📢 ' + title,
            message: 'Message sent to all users: ' + message
        });
        
        if (existingAdminNotif) {
            console.log('⚠️ Admin notification already exists, skipping...');
            return res.json({
                success: true,
                message: 'Message already sent to users!'
            });
        }
        
        await Notification.insertMany(notifications);
        
        res.json({
            success: true,
            message: `Global message sent to ${users.length} users!`
        });
    } catch (error) {
        console.error('❌ Send global message error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// 🧹 CLEANUP
// ============================================

router.delete('/cleanup-duplicates', isAdmin, async (req, res) => {
    try {
        const adminId = req.user._id;
        console.log('🧹 Cleaning up all admin notifications for:', adminId);
        
        const result = await Notification.deleteMany({ 
            userId: adminId
        });
        
        res.json({
            success: true,
            message: `Cleaned up ${result.deletedCount} admin messages! 🧹`,
            data: { deletedCount: result.deletedCount }
        });
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب المعاملات المعلقة (للمدير)
// ============================================

router.get('/pending-transactions', isAdmin, async (req, res) => {
    try {
        const Transaction = require('../models/Transaction');
        const transactions = await Transaction.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .populate('userId', 'username userId')
            .populate('fromUserId', 'username userId')
            .populate('toUserId', 'username userId');
        
        res.json({
            success: true,
            data: { transactions }
        });
    } catch (error) {
        console.error('❌ Get pending transactions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;