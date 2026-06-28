const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Robot = require('../models/Robot');
const Competition = require('../models/Competition');
const Notification = require('../models/Notification');
const Transaction = require('../models/Transaction');
const Wallet = require('../models/Wallet');
const AdminWallet = require('../models/AdminWallet');
const Block = require('../models/Block');
const AdminAccount = require('../models/AdminAccount');
const SystemSettings = require('../models/SystemSettings');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this';

// ================================================================
//  1. MIDDLEWARE
// ================================================================

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
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ================================================================
//  2. GET STATS
// ================================================================

router.get('/stats', isAdmin, async (req, res) => {
    try {
        console.log('📊 Fetching admin stats...');
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const totalUsers = await User.countDocuments();
        const bannedUsers = await User.countDocuments({ isBanned: true });
        const activeUsers = await User.countDocuments({ lastLogin: { $gte: thirtyDaysAgo }, isBanned: false });
        const inactiveUsers = await User.countDocuments({ lastLogin: { $lt: thirtyDaysAgo }, isBanned: false });
        
        const totalUsersToday = await User.countDocuments({ createdAt: { $lte: new Date() } });
        const totalUsersYesterday = await User.countDocuments({ createdAt: { $lte: yesterday } });
        let userGrowth = 0;
        if (totalUsersYesterday > 0) {
            userGrowth = Math.round(((totalUsersToday - totalUsersYesterday) / totalUsersYesterday) * 100);
        } else if (totalUsersToday > 0) {
            userGrowth = 100;
        }
        
        const activeToday = await User.countDocuments({ lastLogin: { $gte: today }, isBanned: false });
        const activeYesterday = await User.countDocuments({ lastLogin: { $gte: yesterday, $lt: today }, isBanned: false });
        let activeGrowth = 0;
        if (activeYesterday > 0) {
            activeGrowth = Math.round(((activeToday - activeYesterday) / activeYesterday) * 100);
        } else if (activeToday > 0) {
            activeGrowth = 100;
        }
        
        const totalCompetitions = await Competition.countDocuments();
        const activeCompetitions = await Competition.countDocuments({ status: 'active' });
        const totalRobots = await Robot.countDocuments();
        
        const allComps = await Competition.find({});
        let totalRevenue = 0;
        for (let i = 0; i < allComps.length; i++) {
            const comp = allComps[i];
            const participantsCount = comp.participants?.length || 0;
            totalRevenue += comp.entryFee * participantsCount;
        }
        const platformProfit = Math.round(totalRevenue * 0.3);
        
        const recentNotifications = await Notification.find({
            userId: req.user._id,
            message: { $regex: /^Message sent to all users:/ }
        }).sort({ createdAt: -1 }).limit(10);
        
        return res.json({
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
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  3. USER STATS
// ================================================================

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
        
        return res.json({
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
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  4. GET USERS
// ================================================================

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
        const users = await User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit));
        const total = await User.countDocuments(query);
        
        return res.json({
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
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  5. GET SINGLE USER
// ================================================================

router.get('/users/:id', isAdmin, async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        return res.json({ success: true, data: { user: user } });
    } catch (error) {
        console.error('❌ Get user error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  6. BAN / UNBAN USER
// ================================================================

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
                message: 'Your account has been banned. Reason: ' + user.banReason,
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
        return res.json({
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
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  7. UPDATE USER ROLE
// ================================================================

router.put('/users/:id/role', isAdmin, async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'admin', 'moderator'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role' });
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
            message: 'Your role has been changed from ' + oldRole + ' to ' + role + '.',
            icon: '🔄',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await notification.save();
        
        return res.json({
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
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  8. COMPETITIONS
// ================================================================

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
        
        return res.json({
            success: true,
            data: {
                competitions: competitions || []
            }
        });
    } catch (error) {
        console.error('❌ Get competitions error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  9. ADMIN NOTIFICATIONS
// ================================================================

router.get('/admin-notifications', isAdmin, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        
        return res.json({
            success: true,
            data: {
                notifications: notifications || []
            }
        });
    } catch (error) {
        console.error('❌ Get admin notifications error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/admin-notification-read/:id', isAdmin, async (req, res) => {
    try {
        const notification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        notification.isRead = true;
        await notification.save();
        return res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        console.error('❌ Mark admin notification read error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/admin-notifications-read-all', isAdmin, async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user._id, isRead: false }, { isRead: true });
        return res.json({ success: true, message: 'All admin notifications marked as read' });
    } catch (error) {
        console.error('❌ Mark all admin notifications read error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/admin-notification-delete/:id', isAdmin, async (req, res) => {
    try {
        const adminNotification = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
        if (!adminNotification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        await adminNotification.deleteOne();
        const result = await Notification.deleteMany({
            title: adminNotification.title,
            message: adminNotification.message,
            type: adminNotification.type || 'global'
        });
        return res.json({
            success: true,
            message: 'Notification deleted from all users (' + result.deletedCount + ' total)',
            data: { deletedCount: result.deletedCount }
        });
    } catch (error) {
        console.error('❌ Delete admin notification error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.delete('/cleanup-duplicates', isAdmin, async (req, res) => {
    try {
        const result = await Notification.deleteMany({ type: 'global' });
        return res.json({
            success: true,
            message: 'Cleaned up ' + result.deletedCount + ' global messages from all users! 🧹',
            data: { deletedCount: result.deletedCount || 0 }
        });
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  10. SEND GLOBAL MESSAGE
// ================================================================

router.post('/send-global-message', isAdmin, async (req, res) => {
    try {
        const { title, message, icon, type } = req.body;
        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message are required' });
        }
        
        const allUsers = await User.find({}, '_id');
        const notifications = [];
        for (let i = 0; i < allUsers.length; i++) {
            const user = allUsers[i];
            notifications.push({
                userId: user._id,
                type: type || 'global',
                title: title,
                message: message,
                icon: icon || '📢',
                isRead: false,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
        }
        await Notification.insertMany(notifications);
        return res.json({
            success: true,
            message: 'Global message sent to ' + allUsers.length + ' users!',
            data: { totalUsers: allUsers.length }
        });
    } catch (error) {
        console.error('❌ Send global message error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  11. PENDING TRANSACTIONS
// ================================================================

router.get('/pending-transactions', isAdmin, async (req, res) => {
    try {
        const transactions = await Transaction.find({ status: 'pending' })
            .sort({ createdAt: -1 })
            .populate('userId', 'username userId')
            .populate('fromUserId', 'username userId')
            .populate('toUserId', 'username userId');
        
        return res.json({
            success: true,
            data: {
                transactions: transactions || []
            }
        });
    } catch (error) {
        console.error('❌ Get pending transactions error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  12. APPROVE / REJECT TRANSACTIONS
// ================================================================

router.put('/approve-transaction/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const transaction = await Transaction.findById(id);
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }
        if (transaction.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Transaction already processed' });
        }
        
        const user = await User.findById(transaction.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) {
            wallet = new Wallet({ userId: user.userId, balance: user.balance || 0 });
            await wallet.save();
        }
        
        if (transaction.type === 'deposit') {
            wallet.balance += transaction.amount;
            wallet.totalDeposited = (wallet.totalDeposited || 0) + transaction.amount;
            wallet.totalReceived = (wallet.totalReceived || 0) + transaction.amount;
            
            let adminAccount = await AdminAccount.findOne();
            if (adminAccount) {
                adminAccount.reserveBalance = (adminAccount.reserveBalance || 0) - transaction.amount;
                adminAccount.circulatingSupply = (adminAccount.circulatingSupply || 0) + transaction.amount;
                await adminAccount.save();
            }
        } else if (transaction.type === 'transfer') {
            const toUser = await User.findById(transaction.toUserId);
            if (!toUser) {
                return res.status(404).json({ success: false, message: 'Receiver not found' });
            }
            let toWallet = await Wallet.findOne({ userId: toUser.userId });
            if (!toWallet) {
                toWallet = new Wallet({ userId: toUser.userId, balance: toUser.balance || 0 });
                await toWallet.save();
            }
            toWallet.balance += transaction.amount;
            toWallet.totalReceived = (toWallet.totalReceived || 0) + transaction.amount;
            toWallet.transactionCount = (toWallet.transactionCount || 0) + 1;
            toWallet.lastTransaction = new Date();
            await toWallet.save();
            toUser.balance = toWallet.balance;
            await toUser.save();
        }
        await wallet.save();
        
        const latestBlock = await Block.findOne().sort({ index: -1 });
        const lastBlock = latestBlock || await Block.findOne({ index: 0 });
        const newBlockIndex = (lastBlock?.index || 0) + 1;
        
        const blockData = {
            type: transaction.type,
            from: transaction.from || 'admin',
            to: transaction.to || user.userId,
            amount: transaction.amount,
            fee: 0,
            description: transaction.description || 'Approved ' + transaction.type
        };
        
        const newBlock = new Block({
            index: newBlockIndex,
            timestamp: new Date(),
            previousHash: lastBlock?.hash || '0',
            hash: '',
            transaction: blockData,
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
        
        transaction.status = 'confirmed';
        transaction.balanceAfter = wallet.balance;
        transaction.blockIndex = newBlock.index;
        transaction.blockHash = newBlock.hash;
        transaction.approvedBy = req.user._id;
        transaction.approvedAt = new Date();
        transaction.reason = reason || '';
        await transaction.save();
        
        user.balance = wallet.balance;
        await user.save();
        
        const notification = new Notification({
            userId: user._id,
            type: 'success',
            title: '✅ ' + transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1) + ' Approved',
            message: 'Your ' + transaction.type + ' of ' + transaction.amount + ' RX has been approved (Block #' + newBlock.index + ')',
            icon: '✅',
            link: '/dashboard#wallet',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await notification.save();
        
        return res.json({
            success: true,
            message: 'Transaction approved and recorded on blockchain',
            data: {
                transaction: transaction,
                block: newBlock,
                newBalance: wallet.balance
            }
        });
    } catch (error) {
        console.error('❌ Approve transaction error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/reject-transaction/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const transaction = await Transaction.findById(id);
        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }
        if (transaction.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Transaction already processed' });
        }
        
        const user = await User.findById(transaction.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) {
            wallet = new Wallet({ userId: user.userId, balance: user.balance || 0 });
            await wallet.save();
        }
        
        if (transaction.type === 'withdrawal' || transaction.type === 'transfer') {
            wallet.balance += transaction.amount;
            if (transaction.type === 'withdrawal') {
                wallet.totalWithdrawn = Math.max(0, (wallet.totalWithdrawn || 0) - transaction.amount);
            } else {
                wallet.totalSent = Math.max(0, (wallet.totalSent || 0) - transaction.amount);
            }
            wallet.transactionCount = (wallet.transactionCount || 0) + 1;
            wallet.lastTransaction = new Date();
            await wallet.save();
            user.balance = wallet.balance;
            await user.save();
        }
        
        transaction.status = 'failed';
        transaction.failedReason = reason || 'Rejected by admin';
        transaction.balanceAfter = wallet.balance;
        transaction.approvedBy = req.user._id;
        transaction.approvedAt = new Date();
        await transaction.save();
        
        const notification = new Notification({
            userId: user._id,
            type: 'error',
            title: '❌ ' + transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1) + ' Rejected',
            message: 'Your ' + transaction.type + ' of ' + transaction.amount + ' RX was rejected. Reason: ' + (reason || 'No reason provided') + (transaction.type === 'withdrawal' || transaction.type === 'transfer' ? ' ✅ Balance restored' : ''),
            icon: '❌',
            link: '/dashboard#wallet',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await notification.save();
        
        return res.json({
            success: true,
            message: 'Transaction rejected',
            data: {
                transaction: transaction,
                newBalance: wallet.balance,
                balanceRestored: (transaction.type === 'withdrawal' || transaction.type === 'transfer')
            }
        });
    } catch (error) {
        console.error('❌ Reject transaction error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  13. SYSTEM SETTINGS
// ================================================================

router.get('/settings', isAdmin, async (req, res) => {
    try {
        const settings = await SystemSettings.getSettings();
        return res.json({ success: true, data: settings });
    } catch (error) {
        console.error('❌ Get settings error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.put('/settings', isAdmin, async (req, res) => {
    try {
        const settings = await SystemSettings.updateSettings(req.body);
        return res.json({ success: true, message: 'Settings updated successfully!', data: settings });
    } catch (error) {
        console.error('❌ Update settings error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

router.post('/settings/reset', isAdmin, async (req, res) => {
    try {
        await SystemSettings.deleteMany({});
        const settings = await SystemSettings.createDefaultSettings();
        return res.json({ success: true, message: 'Settings reset to default!', data: settings });
    } catch (error) {
        console.error('❌ Reset settings error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  14. ADMIN WALLET - GET
// ================================================================

router.get('/admin-wallet', isAdmin, async (req, res) => {
    try {
        const adminWallet = await AdminWallet.getAdminWallet();
        const totalWallets = await Wallet.countDocuments();
        adminWallet.totalWallets = totalWallets + 1;
        await adminWallet.save();
        
        return res.json({
            success: true,
            data: {
                address: adminWallet.address,
                balance: adminWallet.balance,
                totalSupply: adminWallet.totalSupply,
                circulatingSupply: adminWallet.circulatingSupply,
                reserveBalance: adminWallet.reserveBalance,
                totalTransactions: adminWallet.totalTransactions,
                totalMinted: adminWallet.totalMinted,
                totalBurned: adminWallet.totalBurned,
                lastBlockIndex: adminWallet.lastBlockIndex,
                totalWallets: adminWallet.totalWallets
            }
        });
    } catch (error) {
        console.error('❌ Get admin wallet error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  15. ADMIN WALLET - MINT
// ================================================================

router.post('/admin-wallet/mint', isAdmin, async (req, res) => {
    try {
        const { amount, description } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        const adminWallet = await AdminWallet.getAdminWallet();
        
        if (adminWallet.reserveBalance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient reserve balance. Available: ' + adminWallet.reserveBalance + ' RX'
            });
        }
        
        await adminWallet.mintTokens(amount, description, req.user._id, req.user.username);
        
        const latestBlock = await Block.findOne().sort({ index: -1 });
        const lastBlock = latestBlock || await Block.findOne({ index: 0 });
        const newBlockIndex = (lastBlock?.index || 0) + 1;
        
        const blockData = {
            type: 'mint',
            from: 'admin',
            to: adminWallet.address,
            amount: amount,
            fee: 0,
            description: description || 'Minted ' + amount + ' RX',
            metadata: {
                adminId: req.user._id,
                adminName: req.user.username
            }
        };
        
        const newBlock = new Block({
            index: newBlockIndex,
            timestamp: new Date(),
            previousHash: lastBlock?.hash || '0',
            hash: '',
            transaction: blockData,
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
        
        return res.json({
            success: true,
            message: '✅ ' + amount + ' RX minted successfully!',
            data: {
                newBalance: adminWallet.balance,
                reserveBalance: adminWallet.reserveBalance,
                circulatingSupply: adminWallet.circulatingSupply,
                totalMinted: adminWallet.totalMinted,
                block: newBlock
            }
        });
    } catch (error) {
        console.error('❌ Mint error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  16. ADMIN WALLET - BURN
// ================================================================

router.post('/admin-wallet/burn', isAdmin, async (req, res) => {
    try {
        const { amount, description } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        const adminWallet = await AdminWallet.getAdminWallet();
        
        if (adminWallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance. Available: ' + adminWallet.balance + ' RX'
            });
        }
        
        await adminWallet.burnTokens(amount, description, req.user._id, req.user.username);
        
        const latestBlock = await Block.findOne().sort({ index: -1 });
        const lastBlock = latestBlock || await Block.findOne({ index: 0 });
        const newBlockIndex = (lastBlock?.index || 0) + 1;
        
        const blockData = {
            type: 'burn',
            from: adminWallet.address,
            to: 'admin',
            amount: amount,
            fee: 0,
            description: description || 'Burned ' + amount + ' RX',
            metadata: {
                adminId: req.user._id,
                adminName: req.user.username
            }
        };
        
        const newBlock = new Block({
            index: newBlockIndex,
            timestamp: new Date(),
            previousHash: lastBlock?.hash || '0',
            hash: '',
            transaction: blockData,
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
        
        return res.json({
            success: true,
            message: '🔥 ' + amount + ' RX burned successfully!',
            data: {
                newBalance: adminWallet.balance,
                reserveBalance: adminWallet.reserveBalance,
                circulatingSupply: adminWallet.circulatingSupply,
                totalBurned: adminWallet.totalBurned,
                block: newBlock
            }
        });
    } catch (error) {
        console.error('❌ Burn error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// ================================================================
//  17. ADMIN WALLET - TRANSFER
// ================================================================

router.post('/admin-wallet/transfer', isAdmin, async (req, res) => {
    try {
        const { to, amount, description } = req.body;
        
        if (!to || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }
        
        const adminWallet = await AdminWallet.getAdminWallet();
        
        if (adminWallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient balance. Available: ' + adminWallet.balance + ' RX'
            });
        }
        
        const result = await adminWallet.transferTokens(to, amount, description, req.user._id, req.user.username);
        
        const latestBlock = await Block.findOne().sort({ index: -1 });
        const lastBlock = latestBlock || await Block.findOne({ index: 0 });
        const newBlockIndex = (lastBlock?.index || 0) + 1;
        
        const blockData = {
            type: 'transfer',
            from: adminWallet.address,
            to: result.recipientWallet.address,
            amount: amount,
            fee: 0,
            description: description || 'Transferred ' + amount + ' RX to ' + result.targetUser.userId,
            metadata: {
                adminId: req.user._id,
                adminName: req.user.username,
                targetUserId: result.targetUser.userId
            }
        };
        
        const newBlock = new Block({
            index: newBlockIndex,
            timestamp: new Date(),
            previousHash: lastBlock?.hash || '0',
            hash: '',
            transaction: blockData,
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
        
        return res.json({
            success: true,
            message: '✅ ' + amount + ' RX transferred successfully!',
            data: {
                newBalance: adminWallet.balance,
                recipientBalance: result.recipientWallet.balance,
                recipientUser: {
                    username: result.targetUser.username,
                    userId: result.targetUser.userId
                },
                block: newBlock,
                transaction: result.transaction
            }
        });
    } catch (error) {
        console.error('❌ Transfer error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;