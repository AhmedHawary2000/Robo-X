const mongoose = require('mongoose');

const adminWalletSchema = new mongoose.Schema({
    address: {
        type: String,
        unique: true,
        default: 'RXADMINXX0000001'
    },
    balance: {
        type: Number,
        default: 0
    },
    totalSupply: {
        type: Number,
        default: 1000000000
    },
    circulatingSupply: {
        type: Number,
        default: 0
    },
    reserveBalance: {
        type: Number,
        default: 1000000000
    },
    totalTransactions: {
        type: Number,
        default: 0
    },
    totalMinted: {
        type: Number,
        default: 0
    },
    totalBurned: {
        type: Number,
        default: 0
    },
    lastBlockIndex: {
        type: Number,
        default: 0
    },
    totalWallets: {
        type: Number,
        default: 1
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ ✅ ✅ دالة getAdminWallet - يجب أن تكون static
adminWalletSchema.statics.getAdminWallet = async function() {
    try {
        let wallet = await this.findOne();
        if (!wallet) {
            const adminAddress = 'RXADMINXX0000001';
            wallet = new this({
                address: adminAddress,
                balance: 0,
                totalSupply: 1000000000,
                reserveBalance: 1000000000,
                circulatingSupply: 0,
                totalTransactions: 0,
                totalMinted: 0,
                totalBurned: 0,
                lastBlockIndex: 0,
                totalWallets: 1
            });
            await wallet.save();
            console.log(`✅ Admin Wallet created! Address: ${adminAddress}`);
        }
        return wallet;
    } catch (error) {
        console.error('❌ Error creating admin wallet:', error);
        throw error;
    }
};

// ✅ ✅ ✅ Transfer - فقط User ID أو Wallet Address
adminWalletSchema.methods.transferTokens = async function(to, amount, description = '', adminId = null, adminName = 'admin') {
    if (!amount || amount <= 0) {
        throw new Error('Invalid amount');
    }
    
    if (!to) {
        throw new Error('Recipient User ID or Wallet Address is required');
    }
    
    if (this.balance < amount) {
        throw new Error(`Insufficient balance. Available: ${this.balance} RX`);
    }
    
    const User = mongoose.model('User');
    const Wallet = mongoose.model('Wallet');
    let targetUser = null;
    let recipientWallet = null;
    
    // ✅ ✅ ✅ البحث عن المستخدم بواسطة User ID (مثل RX000001)
    if (to.startsWith('RX')) {
        // ✅ التحقق: هل هو عنوان محفظة أم User ID؟
        // عنوان المحفظة: RX + 7 حروف + 7 أرقام (مثل RXABCDEFG1234567)
        // User ID: RX + 6 أرقام (مثل RX000001)
        
        const isWalletAddress = /^RX[A-Z]{7}[0-9]{7}$/.test(to);
        const isUserId = /^RX[0-9]{6}$/.test(to);
        
        if (isWalletAddress) {
            // ✅ البحث عن محفظة بهذا العنوان
            recipientWallet = await Wallet.findOne({ address: to });
            if (recipientWallet) {
                targetUser = await User.findById(recipientWallet.userId);
            }
        } else if (isUserId) {
            // ✅ البحث عن مستخدم بهذا الـ User ID
            targetUser = await User.findOne({ userId: to });
            if (targetUser) {
                recipientWallet = await Wallet.findOne({ userId: targetUser.userId });
            }
        } else {
            throw new Error('Invalid format. Use RX000001 (User ID) or RXABCDEFG1234567 (Wallet Address)');
        }
    } else {
        throw new Error('Invalid format. Must start with RX (e.g., RX000001)');
    }
    
    if (!targetUser) {
        throw new Error(`User not found with ID: ${to}`);
    }
    
    // ✅ إذا لم توجد محفظة، إنشاء واحدة
    if (!recipientWallet) {
        // ✅ توليد عنوان محفظة عشوائي
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        let letterPart = '';
        for (let i = 0; i < 7; i++) {
            letterPart += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        let numberPart = '';
        for (let i = 0; i < 7; i++) {
            numberPart += numbers.charAt(Math.floor(Math.random() * numbers.length));
        }
        const newAddress = 'RX' + letterPart + numberPart;
        
        recipientWallet = new Wallet({
            userId: targetUser._id,
            address: newAddress,
            balance: 0
        });
        await recipientWallet.save();
    }
    
    // ✅ خصم من محفظة المدير
    this.balance -= amount;
    this.totalTransactions += 1;
    this.lastBlockIndex += 1;
    this.updatedAt = new Date();
    await this.save();
    
    // ✅ إضافة إلى محفظة المستلم
    recipientWallet.balance += amount;
    recipientWallet.totalReceived = (recipientWallet.totalReceived || 0) + amount;
    recipientWallet.updatedAt = new Date();
    await recipientWallet.save();
    
    // ✅ تحديث رصيد المستخدم
    targetUser.balance = recipientWallet.balance;
    await targetUser.save();
    
    // ✅ إنشاء Transaction
    const Transaction = mongoose.model('Transaction');
    const transaction = new Transaction({
        userId: targetUser._id,
        type: 'transfer',
        amount: amount,
        from: this.address,
        to: recipientWallet.address,
        fromUserId: adminId,
        toUserId: targetUser._id,
        status: 'confirmed',
        blockIndex: this.lastBlockIndex,
        description: description || `Transferred ${amount} RX to ${targetUser.userId}`,
        metadata: { 
            adminId: adminId, 
            adminName: adminName,
            type: 'transfer',
            targetUserId: targetUser.userId
        }
    });
    await transaction.save();
    
    // ✅ إشعار للمستخدم
    const Notification = mongoose.model('Notification');
    const notification = new Notification({
        userId: targetUser._id,
        type: 'wallet',
        title: '💰 Transfer Received',
        message: `You received ${amount} RX from admin wallet (${description || 'Admin transfer'})`,
        icon: '💰',
        link: '/dashboard#wallet',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    await notification.save();
    
    console.log(`✅ Transferred ${amount} RX to ${targetUser.username} (${targetUser.userId})`);
    
    return { adminWallet: this, recipientWallet, transaction, targetUser };
};

// ✅ Mint Tokens
adminWalletSchema.methods.mintTokens = async function(amount, description = '', adminId = null, adminName = 'admin') {
    if (!amount || amount <= 0) {
        throw new Error('Invalid amount');
    }
    
    if (this.reserveBalance < amount) {
        throw new Error(`Insufficient reserve balance. Available: ${this.reserveBalance} RX`);
    }
    
    this.balance += amount;
    this.reserveBalance -= amount;
    this.circulatingSupply += amount;
    this.totalTransactions += 1;
    this.totalMinted += amount;
    this.lastBlockIndex += 1;
    this.updatedAt = new Date();
    await this.save();
    
    const Transaction = mongoose.model('Transaction');
    const transaction = new Transaction({
        userId: adminId,
        type: 'mint',
        amount: amount,
        from: 'admin',
        to: this.address,
        fromUserId: adminId,
        toUserId: null,
        status: 'confirmed',
        blockIndex: this.lastBlockIndex,
        description: description || `Minted ${amount} RX`,
        metadata: { adminId: adminId, adminName: adminName, type: 'mint' }
    });
    await transaction.save();
    
    const AdminAccount = mongoose.model('AdminAccount');
    let adminAccount = await AdminAccount.findOne();
    if (adminAccount) {
        adminAccount.reserveBalance = this.reserveBalance;
        adminAccount.circulatingSupply = this.circulatingSupply;
        adminAccount.totalTransactions = (adminAccount.totalTransactions || 0) + 1;
        adminAccount.lastBlockIndex = this.lastBlockIndex;
        await adminAccount.save();
    }
    
    return this;
};

// ✅ Burn Tokens
adminWalletSchema.methods.burnTokens = async function(amount, description = '', adminId = null, adminName = 'admin') {
    if (!amount || amount <= 0) {
        throw new Error('Invalid amount');
    }
    
    if (this.balance < amount) {
        throw new Error(`Insufficient balance. Available: ${this.balance} RX`);
    }
    
    this.balance -= amount;
    this.reserveBalance += amount;
    this.circulatingSupply -= amount;
    this.totalTransactions += 1;
    this.totalBurned += amount;
    this.lastBlockIndex += 1;
    this.updatedAt = new Date();
    await this.save();
    
    const Transaction = mongoose.model('Transaction');
    const transaction = new Transaction({
        userId: adminId,
        type: 'burn',
        amount: amount,
        from: this.address,
        to: 'admin',
        fromUserId: null,
        toUserId: adminId,
        status: 'confirmed',
        blockIndex: this.lastBlockIndex,
        description: description || `Burned ${amount} RX`,
        metadata: { adminId: adminId, adminName: adminName, type: 'burn' }
    });
    await transaction.save();
    
    const AdminAccount = mongoose.model('AdminAccount');
    let adminAccount = await AdminAccount.findOne();
    if (adminAccount) {
        adminAccount.reserveBalance = this.reserveBalance;
        adminAccount.circulatingSupply = this.circulatingSupply;
        adminAccount.totalTransactions = (adminAccount.totalTransactions || 0) + 1;
        adminAccount.lastBlockIndex = this.lastBlockIndex;
        await adminAccount.save();
    }
    
    return this;
};

adminWalletSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('AdminWallet', adminWalletSchema);