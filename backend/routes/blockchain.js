const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const Block = require('../models/Block');
const Wallet = require('../models/Wallet');
const AdminAccount = require('../models/AdminAccount');
const Transaction = require('../models/Transaction');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this';

// ============================================
// ✅ MIDDLEWARE - التحقق من Admin
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
        console.error('❌ Auth error:', error);
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ============================================
// ✅ ✅ ✅ MIDDLEWARE - التحقق من المستخدم (المستخدم العادي)
// ============================================

const authenticate = async (req, res, next) => {
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
        
        req.userId = decoded.id;
        req.user = user;
        next();
    } catch (error) {
        console.error('❌ Auth error:', error);
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ============================================
// ✅ جلب إحصائيات Blockchain
// ============================================

router.get('/stats', async (req, res) => {
    try {
        console.log('📊 Fetching blockchain stats...');
        
        const adminAccount = await AdminAccount.findOne();
        const settings = await SystemSettings.findOne();
        const totalBlocks = await Block.countDocuments();
        const totalWallets = await Wallet.countDocuments();
        const totalUsers = await User.countDocuments();
        
        const aggregation = await Wallet.aggregate([
            { $group: { _id: null, total: { $sum: '$balance' } } }
        ]);
        const walletsTotal = aggregation.length > 0 ? aggregation[0].total : 0;
        
        console.log('📊 Stats:', {
            totalSupply: settings?.totalSupply || 1000000000,
            reserveBalance: adminAccount?.reserveBalance || 0,
            circulatingSupply: walletsTotal,
            totalBlocks,
            totalWallets,
            totalTransactions: adminAccount?.totalTransactions || 0,
            lastBlockIndex: adminAccount?.lastBlockIndex || 0
        });
        
        res.json({
            success: true,
            data: {
                totalSupply: settings?.totalSupply || 1000000000,
                reserveBalance: adminAccount?.reserveBalance || 0,
                circulatingSupply: walletsTotal,
                totalBlocks,
                totalWallets,
                totalUsers,
                totalTransactions: adminAccount?.totalTransactions || 0,
                totalDeposits: adminAccount?.totalDeposits || 0,
                totalWithdrawals: adminAccount?.totalWithdrawals || 0,
                totalRewards: adminAccount?.totalRewards || 0,
                totalFees: adminAccount?.totalFees || 0,
                lastBlockIndex: adminAccount?.lastBlockIndex || 0
            }
        });
    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب جميع المعاملات (للمدير)
// ============================================

router.get('/transactions', isAdmin, async (req, res) => {
    try {
        console.log('📋 Admin fetching all transactions...');
        
        const { limit = 50, page = 1, type, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = {};
        if (type) query.type = type;
        if (status) query.status = status;
        
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Transaction.countDocuments(query);
        
        console.log('📦 Transactions found in DB:', transactions.length);
        console.log('📦 Total transactions in DB:', total);
        
        res.json({
            success: true,
            data: {
                transactions: transactions || [],
                total: total || 0,
                page: parseInt(page),
                pages: Math.ceil((total || 0) / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('❌ Get transactions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ ✅ ✅ طلب إيداع (المستخدم)
// ============================================

router.post('/request-deposit', authenticate, async (req, res) => {
    try {
        const { amount, description } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // ✅ إنشاء معاملة معلقة
        const transaction = new Transaction({
            userId: user._id,
            type: 'deposit',
            amount: amount,
            from: 'admin',
            to: user.userId,
            fromUserId: null,
            toUserId: user._id,
            status: 'pending',
            description: description || `Deposit request of ${amount} RX`,
            metadata: { requestedBy: user.username }
        });
        await transaction.save();
        
        // ✅ إنشاء إشعار للمدير
        const Notification = require('../models/Notification');
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            const notification = new Notification({
                userId: admin._id,
                type: 'info',
                title: '💰 New Deposit Request',
                message: `${user.username} requested deposit of ${amount} RX`,
                icon: '💰',
                link: '/admin#pending',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
        }
        
        res.json({
            success: true,
            message: 'Deposit request sent for approval',
            data: { transaction }
        });
    } catch (error) {
        console.error('❌ Request deposit error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ ✅ ✅ طلب سحب (المستخدم)
// ============================================

router.post('/request-withdrawal', authenticate, async (req, res) => {
    try {
        const { amount, description } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // ✅ التحقق من الرصيد
        const wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet || wallet.balance < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        
        // ✅ إنشاء معاملة معلقة
        const transaction = new Transaction({
            userId: user._id,
            type: 'withdrawal',
            amount: amount,
            from: user.userId,
            to: 'admin',
            fromUserId: user._id,
            toUserId: null,
            status: 'pending',
            description: description || `Withdrawal request of ${amount} RX`,
            metadata: { requestedBy: user.username }
        });
        await transaction.save();
        
        // ✅ إنشاء إشعار للمدير
        const Notification = require('../models/Notification');
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            const notification = new Notification({
                userId: admin._id,
                type: 'info',
                title: '💸 New Withdrawal Request',
                message: `${user.username} requested withdrawal of ${amount} RX`,
                icon: '💸',
                link: '/admin#pending',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
        }
        
        res.json({
            success: true,
            message: 'Withdrawal request sent for approval',
            data: { transaction }
        });
    } catch (error) {
        console.error('❌ Request withdrawal error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ ✅ ✅ طلب تحويل (المستخدم)
// ============================================

router.post('/request-transfer', authenticate, async (req, res) => {
    try {
        const { to, amount, description } = req.body;
        
        if (!to || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid data' });
        }
        
        const fromUser = await User.findById(req.userId);
        if (!fromUser) {
            return res.status(404).json({ success: false, message: 'Sender not found' });
        }
        
        // ✅ البحث عن المستخدم الهدف
        let toUser;
        if (to.startsWith('RX')) {
            toUser = await User.findOne({ userId: to });
        } else {
            toUser = await User.findOne({ username: to });
        }
        
        if (!toUser) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (toUser._id.toString() === req.userId) {
            return res.status(400).json({ success: false, message: 'Cannot transfer to yourself' });
        }
        
        // ✅ التحقق من الرصيد
        const fromWallet = await Wallet.findOne({ userId: fromUser.userId });
        if (!fromWallet || fromWallet.balance < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        
        // ✅ إنشاء معاملة معلقة
        const transaction = new Transaction({
            userId: fromUser._id,
            type: 'transfer',
            amount: amount,
            from: fromUser.userId,
            to: toUser.userId,
            fromUserId: fromUser._id,
            toUserId: toUser._id,
            status: 'pending',
            description: description || `Transfer of ${amount} RX to ${toUser.username}`,
            metadata: { 
                requestedBy: fromUser.username,
                toUsername: toUser.username
            }
        });
        await transaction.save();
        
        // ✅ إنشاء إشعار للمدير
        const Notification = require('../models/Notification');
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            const notification = new Notification({
                userId: admin._id,
                type: 'info',
                title: '🔄 New Transfer Request',
                message: `${fromUser.username} requested transfer of ${amount} RX to ${toUser.username}`,
                icon: '🔄',
                link: '/admin#pending',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
        }
        
        res.json({
            success: true,
            message: 'Transfer request sent for approval',
            data: { transaction }
        });
    } catch (error) {
        console.error('❌ Request transfer error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب المعاملات المعلقة (للمدير)
// ============================================

router.get('/pending-transactions', isAdmin, async (req, res) => {
    try {
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

// ============================================
// ✅ الموافقة على معاملة (للمدير)
// ============================================

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
        
        // ✅ تنفيذ المعاملة
        const Wallet = require('../models/Wallet');
        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) {
            wallet = new Wallet({ userId: user.userId });
            await wallet.save();
        }
        
        const balanceBefore = wallet.balance;
        let amount = transaction.amount;
        
        // ✅ معالجة حسب النوع
        if (transaction.type === 'deposit') {
            wallet.balance += amount;
            wallet.totalDeposited = (wallet.totalDeposited || 0) + amount;
            
            const AdminAccount = require('../models/AdminAccount');
            const adminAccount = await AdminAccount.findOne();
            if (adminAccount) {
                adminAccount.reserveBalance = (adminAccount.reserveBalance || 0) - amount;
                adminAccount.circulatingSupply = (adminAccount.circulatingSupply || 0) + amount;
                await adminAccount.save();
            }
            
        } else if (transaction.type === 'withdrawal') {
            if (wallet.balance < amount) {
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }
            wallet.balance -= amount;
            wallet.totalWithdrawn = (wallet.totalWithdrawn || 0) + amount;
            
            const AdminAccount = require('../models/AdminAccount');
            const adminAccount = await AdminAccount.findOne();
            if (adminAccount) {
                adminAccount.reserveBalance = (adminAccount.reserveBalance || 0) + amount;
                adminAccount.circulatingSupply = (adminAccount.circulatingSupply || 0) - amount;
                await adminAccount.save();
            }
            
        } else if (transaction.type === 'transfer') {
            const toUser = await User.findById(transaction.toUserId);
            if (!toUser) {
                return res.status(404).json({ success: false, message: 'Receiver not found' });
            }
            
            let toWallet = await Wallet.findOne({ userId: toUser.userId });
            if (!toWallet) {
                toWallet = new Wallet({ userId: toUser.userId });
                await toWallet.save();
            }
            
            if (wallet.balance < amount) {
                return res.status(400).json({ success: false, message: 'Insufficient balance' });
            }
            wallet.balance -= amount;
            wallet.totalSent = (wallet.totalSent || 0) + amount;
            await wallet.save();
            
            toWallet.balance += amount;
            toWallet.totalReceived = (toWallet.totalReceived || 0) + amount;
            await toWallet.save();
        }
        
        await wallet.save();
        
        // ✅ إنشاء Block في Blockchain
        const Block = require('../models/Block');
        const crypto = require('crypto');
        const latestBlock = await Block.findOne().sort({ index: -1 });
        const lastBlock = latestBlock || await Block.findOne({ index: 0 });
        
        const blockData = {
            type: transaction.type,
            from: transaction.from || 'admin',
            to: transaction.to || user.userId,
            amount: transaction.amount,
            fee: 0,
            description: transaction.description || `Approved ${transaction.type}`
        };
        
        const newBlockIndex = (lastBlock?.index || 0) + 1;
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
        
        // ✅ تحديث المعاملة
        transaction.status = 'confirmed';
        transaction.balanceBefore = balanceBefore;
        transaction.balanceAfter = wallet.balance;
        transaction.blockIndex = newBlock.index;
        transaction.blockHash = newBlock.hash;
        transaction.approvedBy = req.user._id;
        transaction.approvedAt = new Date();
        transaction.reason = reason || '';
        await transaction.save();
        
        // ✅ إشعار للمستخدم
        const Notification = require('../models/Notification');
        const notification = new Notification({
            userId: user._id,
            type: 'success',
            title: `✅ ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Approved`,
            message: `Your ${transaction.type} of ${transaction.amount} RX has been approved and confirmed on blockchain (Block #${newBlock.index})`,
            icon: '✅',
            link: '/dashboard#wallet',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await notification.save();
        
        // ✅ تحديث رصيد المستخدم
        user.balance = wallet.balance;
        await user.save();
        
        res.json({
            success: true,
            message: 'Transaction approved and recorded on blockchain',
            data: {
                transaction,
                block: newBlock,
                newBalance: wallet.balance
            }
        });
    } catch (error) {
        console.error('❌ Approve transaction error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ رفض معاملة (للمدير)
// ============================================

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
        
        transaction.status = 'failed';
        transaction.failedReason = reason || 'Rejected by admin';
        transaction.approvedBy = req.user._id;
        transaction.approvedAt = new Date();
        await transaction.save();
        
        const Notification = require('../models/Notification');
        const user = await User.findById(transaction.userId);
        if (user) {
            const notification = new Notification({
                userId: user._id,
                type: 'error',
                title: `❌ ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Rejected`,
                message: `Your ${transaction.type} of ${transaction.amount} RX was rejected. Reason: ${reason || 'No reason provided'}`,
                icon: '❌',
                link: '/dashboard#wallet',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
        }
        
        res.json({
            success: true,
            message: 'Transaction rejected',
            data: { transaction }
        });
    } catch (error) {
        console.error('❌ Reject transaction error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب المعاملات للمستخدم (مع التصفية)
// ============================================

router.get('/user-transactions', authenticate, async (req, res) => {
    try {
        const { limit = 20, type, status } = req.query;
        
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        let query = {
            $or: [
                { from: user.userId },
                { to: user.userId },
                { userId: user._id }
            ]
        };
        if (type) query.type = type;
        if (status) query.status = status;
        
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('fromUserId', 'username userId')
            .populate('toUserId', 'username userId');
        
        res.json({
            success: true,
            data: {
                transactions: transactions || [],
                total: transactions.length
            }
        });
    } catch (error) {
        console.error('❌ User transactions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;