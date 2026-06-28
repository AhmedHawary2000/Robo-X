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
const Notification = require('../models/Notification');

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
// ✅ MIDDLEWARE - التحقق من المستخدم
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
        
        if (user.isBanned) {
            return res.status(403).json({ success: false, message: 'Account is banned' });
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
        
        const AdminWallet = require('../models/AdminWallet');
        const Wallet = require('../models/Wallet');
        const Block = require('../models/Block');
        
        const adminWallet = await AdminWallet.getAdminWallet();
        
        // ✅ ✅ ✅ حساب عدد المحافظ (بما فيها محفظة المدير)
        const userWallets = await Wallet.countDocuments();
        const totalWallets = userWallets + 1; // ✅ إضافة محفظة المدير
        
        adminWallet.totalWallets = totalWallets;
        await adminWallet.save();
        
        const lastBlock = await Block.findOne().sort({ index: -1 });
        const lastBlockIndex = lastBlock?.index || 0;
        
        // ✅ ✅ ✅ تحديث AdminAccount
        const AdminAccount = require('../models/AdminAccount');
        let adminAccount = await AdminAccount.findOne();
        if (!adminAccount) {
            adminAccount = new AdminAccount();
            await adminAccount.save();
        }
        
        adminAccount.totalSupply = adminWallet.totalSupply;
        adminAccount.circulatingSupply = adminWallet.circulatingSupply;
        adminAccount.reserveBalance = adminWallet.reserveBalance;
        adminAccount.totalTransactions = adminWallet.totalTransactions;
        adminAccount.lastBlockIndex = adminWallet.lastBlockIndex || lastBlockIndex;
        adminAccount.totalUsers = await require('../models/User').countDocuments();
        await adminAccount.save();
        
        console.log('📊 Blockchain Stats:', {
            totalSupply: adminWallet.totalSupply,
            circulatingSupply: adminWallet.circulatingSupply,
            reserveBalance: adminWallet.reserveBalance,
            totalWallets: totalWallets
        });
        
        res.json({
            success: true,
            data: {
                totalSupply: adminWallet.totalSupply || 1000000000,
                reserveBalance: adminWallet.reserveBalance || 0,
                circulatingSupply: adminWallet.circulatingSupply || 0,
                totalBlocks: await Block.countDocuments() || 0,
                totalWallets: totalWallets || 0, // ✅ الآن تشمل محفظة المدير
                totalUsers: await require('../models/User').countDocuments() || 0,
                totalTransactions: adminWallet.totalTransactions || 0,
                totalDeposits: adminWallet.totalMinted || 0,
                totalWithdrawals: adminWallet.totalBurned || 0,
                totalRewards: 0,
                totalFees: 0,
                lastBlockIndex: adminWallet.lastBlockIndex || lastBlockIndex
            }
        });
    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ ✅ ✅ طلب إيداع (المستخدم)
// ============================================

router.post('/request-deposit', authenticate, async (req, res) => {
    try {
        const { amount, description } = req.body;
        
        console.log(`💰 Deposit request from ${req.user.username}: ${amount} RX`);
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        const user = req.user;
        
        // ✅ التحقق من وجود محفظة
        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) {
            wallet = new Wallet({ userId: user.userId, balance: user.balance || 0 });
            await wallet.save();
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
            balanceBefore: wallet.balance,
            balanceAfter: wallet.balance,
            description: description || `Deposit request of ${amount} RX`,
            metadata: { 
                requestedBy: user.username,
                requestedAt: new Date()
            }
        });
        await transaction.save();
        
        console.log(`✅ Deposit transaction created: ${transaction._id}`);
        
        // ✅ إنشاء إشعار للمديرين
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            const notification = new Notification({
                userId: admin._id,
                type: 'info',
                title: '💰 New Deposit Request',
                message: `${user.username} (${user.userId}) requested deposit of ${amount} RX`,
                icon: '💰',
                link: '/admin#pending',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
        }
        
        res.json({
            success: true,
            message: 'Deposit request submitted for approval',
            data: { 
                transaction,
                pendingCount: await Transaction.countDocuments({ userId: user._id, status: 'pending' })
            }
        });
    } catch (error) {
        console.error('❌ Request deposit error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ ✅ ✅ طلب سحب (المستخدم) - مع خصم الرصيد فوراً
// ============================================

router.post('/request-withdrawal', authenticate, async (req, res) => {
    try {
        const { amount, description } = req.body;
        
        console.log(`💸 Withdrawal request from ${req.user.username}: ${amount} RX`);
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        if (amount < 5) {
            return res.status(400).json({ success: false, message: 'Minimum withdrawal is 5 RX' });
        }
        
        const user = req.user;
        
        // ✅ التحقق من وجود محفظة
        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) {
            wallet = new Wallet({ userId: user.userId, balance: user.balance || 0 });
            await wallet.save();
        }
        
        // ✅ التحقق من الرصيد
        if (wallet.balance < amount) {
            return res.status(400).json({ success: false, message: `Insufficient balance. You have ${wallet.balance} RX` });
        }
        
        // ✅ ✅ ✅ خصم الرصيد فوراً
        const balanceBefore = wallet.balance;
        wallet.balance -= amount;
        wallet.totalWithdrawn = (wallet.totalWithdrawn || 0) + amount;
        wallet.transactionCount = (wallet.transactionCount || 0) + 1;
        wallet.lastTransaction = new Date();
        await wallet.save();
        
        // ✅ تحديث رصيد المستخدم
        user.balance = wallet.balance;
        await user.save();
        
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
            balanceBefore: balanceBefore,
            balanceAfter: wallet.balance,
            description: description || `Withdrawal request of ${amount} RX`,
            metadata: { 
                requestedBy: user.username,
                requestedAt: new Date()
            }
        });
        await transaction.save();
        
        console.log(`✅ Withdrawal transaction created: ${transaction._id}, new balance: ${wallet.balance}`);
        
        // ✅ إنشاء إشعار للمديرين
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            const notification = new Notification({
                userId: admin._id,
                type: 'info',
                title: '💸 New Withdrawal Request',
                message: `${user.username} (${user.userId}) requested withdrawal of ${amount} RX (New balance: ${wallet.balance} RX)`,
                icon: '💸',
                link: '/admin#pending',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
        }
        
        res.json({
            success: true,
            message: 'Withdrawal request submitted for approval',
            data: { 
                transaction,
                newBalance: wallet.balance,
                pendingCount: await Transaction.countDocuments({ userId: user._id, status: 'pending' })
            }
        });
    } catch (error) {
        console.error('❌ Request withdrawal error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ ✅ ✅ طلب تحويل (المستخدم) - مع خصم الرصيد فوراً
// ============================================

router.post('/request-transfer', authenticate, async (req, res) => {
    try {
        const { to, amount, description } = req.body;
        
        console.log(`🔄 Transfer request from ${req.user.username}: ${amount} RX to ${to}`);
        
        if (!to) {
            return res.status(400).json({ success: false, message: 'Recipient is required' });
        }
        
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }
        
        const fromUser = req.user;
        
        // ✅ البحث عن المستخدم الهدف
        let toUser;
        if (to.startsWith('RX')) {
            toUser = await User.findOne({ userId: to });
        } else {
            toUser = await User.findOne({ username: to });
        }
        
        if (!toUser) {
            return res.status(404).json({ success: false, message: 'Recipient not found' });
        }
        
        if (toUser._id.toString() === fromUser._id.toString()) {
            return res.status(400).json({ success: false, message: 'Cannot transfer to yourself' });
        }
        
        if (toUser.isBanned) {
            return res.status(400).json({ success: false, message: 'Recipient account is banned' });
        }
        
        // ✅ التحقق من وجود محفظة للمرسل
        let fromWallet = await Wallet.findOne({ userId: fromUser.userId });
        if (!fromWallet) {
            fromWallet = new Wallet({ userId: fromUser.userId, balance: fromUser.balance || 0 });
            await fromWallet.save();
        }
        
        // ✅ التحقق من الرصيد
        if (fromWallet.balance < amount) {
            return res.status(400).json({ success: false, message: `Insufficient balance. You have ${fromWallet.balance} RX` });
        }
        
        // ✅ ✅ ✅ خصم الرصيد من المرسل فوراً
        const balanceBefore = fromWallet.balance;
        fromWallet.balance -= amount;
        fromWallet.totalSent = (fromWallet.totalSent || 0) + amount;
        fromWallet.transactionCount = (fromWallet.transactionCount || 0) + 1;
        fromWallet.lastTransaction = new Date();
        await fromWallet.save();
        
        // ✅ تحديث رصيد المرسل
        fromUser.balance = fromWallet.balance;
        await fromUser.save();
        
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
            balanceBefore: balanceBefore,
            balanceAfter: fromWallet.balance,
            description: description || `Transfer of ${amount} RX to ${toUser.username}`,
            metadata: { 
                requestedBy: fromUser.username,
                toUsername: toUser.username,
                requestedAt: new Date()
            }
        });
        await transaction.save();
        
        console.log(`✅ Transfer transaction created: ${transaction._id}, new balance: ${fromWallet.balance}`);
        
        // ✅ إنشاء إشعار للمديرين
        const adminUsers = await User.find({ role: 'admin' });
        for (const admin of adminUsers) {
            const notification = new Notification({
                userId: admin._id,
                type: 'info',
                title: '🔄 New Transfer Request',
                message: `${fromUser.username} (${fromUser.userId}) requested transfer of ${amount} RX to ${toUser.username} (${toUser.userId})`,
                icon: '🔄',
                link: '/admin#pending',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
            await notification.save();
        }
        
        res.json({
            success: true,
            message: 'Transfer request submitted for approval',
            data: { 
                transaction,
                newBalance: fromWallet.balance,
                pendingCount: await Transaction.countDocuments({ userId: fromUser._id, status: 'pending' })
            }
        });
    } catch (error) {
        console.error('❌ Request transfer error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب المعاملات المعلقة للمستخدم
// ============================================

router.get('/user-pending-transactions', authenticate, async (req, res) => {
    try {
        const user = req.user;
        
        const transactions = await Transaction.find({
            $or: [
                { userId: user._id },
                { fromUserId: user._id },
                { toUserId: user._id }
            ],
            status: 'pending'
        })
        .sort({ createdAt: -1 });
        
        res.json({
            success: true,
            data: { 
                transactions: transactions || [] 
            }
        });
    } catch (error) {
        console.error('❌ User pending transactions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب المعاملات للمستخدم (History)
// ============================================

router.get('/user-transactions', authenticate, async (req, res) => {
    try {
        const { limit = 50, type, status } = req.query;
        const user = req.user;
        
        let query = {
            $or: [
                { userId: user._id },
                { fromUserId: user._id },
                { toUserId: user._id }
            ]
        };
        if (type) query.type = type;
        if (status) query.status = status;
        
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit));
        
        res.json({
            success: true,
            data: {
                transactions: transactions || [],
                total: await Transaction.countDocuments(query)
            }
        });
    } catch (error) {
        console.error('❌ User transactions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب المعاملات المعلقة (للمدير)
// ============================================

router.get('/pending-transactions', isAdmin, async (req, res) => {
    try {
        console.log('📋 Admin fetching pending transactions...');
        
        const transactions = await Transaction.find({ 
            status: 'pending' 
        })
        .sort({ createdAt: -1 })
        .populate('userId', 'username userId')
        .populate('fromUserId', 'username userId')
        .populate('toUserId', 'username userId');
        
        console.log(`📦 Found ${transactions.length} pending transactions`);
        
        res.json({
            success: true,
            data: { 
                transactions: transactions || [] 
            }
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
        
        console.log(`✅ Admin approving transaction: ${id}`);
        
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
        
        // ✅ معالجة حسب النوع
        if (transaction.type === 'deposit') {
            // ✅ إضافة الرصيد للإيداع
            wallet.balance += transaction.amount;
            wallet.totalDeposited = (wallet.totalDeposited || 0) + transaction.amount;
            wallet.totalReceived = (wallet.totalReceived || 0) + transaction.amount;
            
            let adminAccount = await AdminAccount.findOne();
            if (adminAccount) {
                adminAccount.reserveBalance = (adminAccount.reserveBalance || 0) - transaction.amount;
                adminAccount.circulatingSupply = (adminAccount.circulatingSupply || 0) + transaction.amount;
                await adminAccount.save();
            }
            
        } else if (transaction.type === 'withdrawal') {
            // ✅ الرصيد تم خصمه مسبقاً، لا نخصم مرة أخرى
            // فقط نتحقق من أن الرصيد لا يزال كافياً
            
        } else if (transaction.type === 'transfer') {
            // ✅ الرصيد تم خصمه من المرسل مسبقاً
            // ✅ نضيف الرصيد للمستلم
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
        
        // ✅ إنشاء Block في Blockchain
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
        transaction.balanceAfter = wallet.balance;
        transaction.blockIndex = newBlock.index;
        transaction.blockHash = newBlock.hash;
        transaction.approvedBy = req.user._id;
        transaction.approvedAt = new Date();
        transaction.reason = reason || '';
        await transaction.save();
        
        // ✅ تحديث رصيد المستخدم
        user.balance = wallet.balance;
        await user.save();
        
        // ✅ إشعار للمستخدم
        const notification = new Notification({
            userId: user._id,
            type: 'success',
            title: `✅ ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Approved`,
            message: `Your ${transaction.type} of ${transaction.amount} RX has been approved (Block #${newBlock.index})`,
            icon: '✅',
            link: '/dashboard#wallet',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await notification.save();
        
        console.log(`✅ Transaction ${id} approved, Block #${newBlock.index}`);
        
        res.json({
            success: true,
            message: 'Transaction approved',
            data: { transaction, newBalance: wallet.balance }
        });
    } catch (error) {
        console.error('❌ Approve transaction error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ ✅ ✅ رفض معاملة (للمدير) - مع استرجاع الرصيد الكامل
// ============================================

router.put('/reject-transaction/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        console.log(`❌ Admin rejecting transaction: ${id}`);
        
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
        
        const amount = transaction.amount;
        
        // ✅ ✅ ✅ استرجاع الرصيد (للسحب والتحويل فقط)
        if (transaction.type === 'withdrawal') {
            // ✅ إعادة المبلغ إلى رصيد المستخدم
            wallet.balance += amount;
            wallet.totalWithdrawn = Math.max(0, (wallet.totalWithdrawn || 0) - amount);
            wallet.transactionCount = (wallet.transactionCount || 0) + 1;
            wallet.lastTransaction = new Date();
            await wallet.save();
            
            user.balance = wallet.balance;
            await user.save();
            
            console.log(`✅ Withdrawal rejected - Balance restored: ${wallet.balance} (+${amount})`);
            
        } else if (transaction.type === 'transfer') {
            // ✅ إعادة المبلغ إلى رصيد المستخدم (المرسل)
            wallet.balance += amount;
            wallet.totalSent = Math.max(0, (wallet.totalSent || 0) - amount);
            wallet.transactionCount = (wallet.transactionCount || 0) + 1;
            wallet.lastTransaction = new Date();
            await wallet.save();
            
            user.balance = wallet.balance;
            await user.save();
            
            console.log(`✅ Transfer rejected - Balance restored: ${wallet.balance} (+${amount})`);
        }
        
        // ✅ تحديث المعاملة
        transaction.status = 'failed';
        transaction.failedReason = reason || 'Rejected by admin';
        transaction.balanceAfter = wallet.balance;
        transaction.approvedBy = req.user._id;
        transaction.approvedAt = new Date();
        await transaction.save();
        
        // ✅ إشعار للمستخدم
        const notification = new Notification({
            userId: user._id,
            type: 'error',
            title: `❌ ${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)} Rejected`,
            message: `Your ${transaction.type} of ${transaction.amount} RX was rejected. Reason: ${reason || 'No reason provided'}${transaction.type === 'withdrawal' || transaction.type === 'transfer' ? ' ✅ Balance restored' : ''}`,
            icon: '❌',
            link: '/dashboard#wallet',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        await notification.save();
        
        console.log(`❌ Transaction ${id} rejected, balance: ${wallet.balance}`);
        
        res.json({
            success: true,
            message: 'Transaction rejected',
            data: {
                transaction,
                newBalance: wallet.balance,
                balanceRestored: (transaction.type === 'withdrawal' || transaction.type === 'transfer')
            }
        });
        
    } catch (error) {
        console.error('❌ Reject transaction error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب جميع المعاملات (للمدير) - الإصلاح الكامل
// ============================================

router.get('/transactions', isAdmin, async (req, res) => {
    try {
        console.log('📋 Admin fetching all transactions...');
        
        const { limit = 50, page = 1, type, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // ✅ بناء استعلام البحث
        let query = {};
        if (type && type !== '') query.type = type;
        if (status && status !== '') query.status = status;
        
        console.log('📋 Query:', query);
        
        // ✅ جلب المعاملات مع ترتيب تنازلي
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('userId', 'username userId')
            .populate('fromUserId', 'username userId')
            .populate('toUserId', 'username userId');
        
        const total = await Transaction.countDocuments(query);
        
        console.log('📦 Found ' + transactions.length + ' transactions, Total: ' + total);
        
        // ✅ تنسيق البيانات للعرض
        const formattedTransactions = transactions.map(function(tx) {
            return {
                _id: tx._id,
                blockIndex: tx.blockIndex || '—',
                type: tx.type || 'unknown',
                from: tx.from || tx.fromUserId?.userId || '—',
                to: tx.to || tx.toUserId?.userId || '—',
                amount: tx.amount || 0,
                fee: tx.fee || 0,
                status: tx.status || 'pending',
                createdAt: tx.createdAt,
                description: tx.description || '',
                fromUsername: tx.fromUserId?.username || '',
                toUsername: tx.toUserId?.username || ''
            };
        });
        
        res.json({
            success: true,
            data: {
                transactions: formattedTransactions,
                total: total || 0,
                page: parseInt(page),
                pages: Math.ceil((total || 0) / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('❌ Get transactions error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ============================================
// ✅ جلب إحصائيات المحفظة للمستخدم
// ============================================

router.get('/wallet-stats', authenticate, async (req, res) => {
    try {
        const user = req.user;
        
        // ✅ جلب المحفظة
        let wallet = await Wallet.findOne({ userId: user.userId });
        if (!wallet) {
            wallet = new Wallet({ userId: user.userId, balance: user.balance || 0 });
            await wallet.save();
        }
        
        // ✅ حساب Total Earned (الأرباح من المسابقات والإحالات)
        const earnedTransactions = await Transaction.find({
            $or: [
                { userId: user._id, type: 'prize' },
                { userId: user._id, type: 'referral' },
                { userId: user._id, type: 'welcome_award' }
            ],
            status: 'confirmed'
        });
        
        let totalEarned = 0;
        earnedTransactions.forEach(function(tx) {
            totalEarned += tx.amount || 0;
        });
        
        res.json({
            success: true,
            data: {
                balance: wallet.balance || 0,
                totalDeposited: wallet.totalDeposited || 0,
                totalWithdrawn: wallet.totalWithdrawn || 0,
                totalEarned: totalEarned || 0,
                totalReceived: wallet.totalReceived || 0,
                totalSent: wallet.totalSent || 0,
                transactionCount: wallet.transactionCount || 0
            }
        });
        
    } catch (error) {
        console.error('❌ Wallet stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ جلب رسائل المستخدم (Global Messages)
// ============================================

router.get('/global-messages', authenticate, async (req, res) => {
    try {
        const user = req.user;
        console.log(`📢 Fetching global messages for user: ${user.username}`);
        
        // ✅ جلب جميع الإشعارات الخاصة بالمستخدم
        const notifications = await Notification.find({
            userId: user._id
        })
        .sort({ createdAt: -1 })
        .limit(50);
        
        console.log(`📦 Found ${notifications.length} notifications for user`);
        
        res.json({
            success: true,
            data: {
                notifications: notifications || []
            }
        });
    } catch (error) {
        console.error('❌ Get global messages error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ تحديث إشعار كمقروء (User)
// ============================================

router.put('/notification-read/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        const notification = await Notification.findOne({
            _id: id,
            userId: user._id
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        notification.isRead = true;
        await notification.save();
        
        res.json({
            success: true,
            message: 'Notification marked as read'
        });
    } catch (error) {
        console.error('❌ Mark notification read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ تحديث جميع الإشعارات كمقروءة (User)
// ============================================

router.put('/notifications-read-all', authenticate, async (req, res) => {
    try {
        const user = req.user;
        
        await Notification.updateMany(
            { userId: user._id, isRead: false },
            { isRead: true }
        );
        
        res.json({
            success: true,
            message: 'All notifications marked as read'
        });
    } catch (error) {
        console.error('❌ Mark all notifications read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ حذف إشعار واحد (User)
// ============================================

router.delete('/notification-delete/:id', authenticate, async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        
        const notification = await Notification.findOne({
            _id: id,
            userId: user._id
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        await notification.deleteOne();
        
        res.json({
            success: true,
            message: 'Notification deleted'
        });
        
    } catch (error) {
        console.error('❌ Delete notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ✅ حذف جميع رسائل المستخدم (Clear All)
// ============================================

router.delete('/clear-my-notifications', authenticate, async (req, res) => {
    try {
        const user = req.user;
        console.log(`🧹 User ${user.username} (${user.userId}) clearing all their notifications`);
        
        // ✅ حذف جميع الإشعارات الخاصة بالمستخدم
        const result = await Notification.deleteMany({ 
            userId: user._id
        });
        
        console.log(`🧹 Deleted ${result.deletedCount} notifications for user ${user.username}`);
        
        res.json({
            success: true,
            message: `Cleared ${result.deletedCount} notifications`,
            data: { 
                deletedCount: result.deletedCount || 0 
            }
        });
        
    } catch (error) {
        console.error('❌ Clear notifications error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
});

module.exports = router;