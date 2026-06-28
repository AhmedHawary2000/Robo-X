const mongoose = require('mongoose');

const adminAccountSchema = new mongoose.Schema({
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
    totalUsers: {
        type: Number,
        default: 0
    },
    totalTransactions: {
        type: Number,
        default: 0
    },
    totalDeposits: {
        type: Number,
        default: 0
    },
    totalWithdrawals: {
        type: Number,
        default: 0
    },
    totalRewards: {
        type: Number,
        default: 0
    },
    totalFees: {
        type: Number,
        default: 0
    },
    totalReferrals: {
        type: Number,
        default: 0
    },
    totalWelcomeAwards: {
        type: Number,
        default: 0
    },
    totalAdminAdjustments: {
        type: Number,
        default: 0
    },
    lastBlockIndex: {
        type: Number,
        default: 0
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ تحديث وقت التعديل
adminAccountSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ✅ التحقق من صحة الإمداد الكلي
adminAccountSchema.methods.verifyTotalSupply = async function() {
    const Wallet = mongoose.model('Wallet');
    const aggregation = await Wallet.aggregate([
        { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    const walletsTotal = aggregation.length > 0 ? aggregation[0].total : 0;
    const total = walletsTotal + this.reserveBalance;
    return total === this.totalSupply;
};

// ✅ إنشاء حساب Admin جديد
adminAccountSchema.statics.createAdminAccount = async function() {
    let account = await this.findOne();
    if (account) {
        return account;
    }
    
    account = new this({
        totalSupply: 1000000000,
        reserveBalance: 1000000000,
        circulatingSupply: 0,
        totalTransactions: 0,
        totalDeposits: 0,
        totalWithdrawals: 0,
        totalRewards: 0,
        totalFees: 0,
        totalReferrals: 0,
        totalWelcomeAwards: 0,
        totalAdminAdjustments: 0,
        lastBlockIndex: 0
    });
    
    await account.save();
    console.log('✅ Admin Account created successfully!');
    return account;
};

// ✅ تحديث إحصائيات Admin
adminAccountSchema.methods.updateStats = async function(data) {
    if (data.totalSupply) this.totalSupply = data.totalSupply;
    if (data.circulatingSupply !== undefined) this.circulatingSupply = data.circulatingSupply;
    if (data.reserveBalance !== undefined) this.reserveBalance = data.reserveBalance;
    if (data.totalUsers) this.totalUsers = data.totalUsers;
    if (data.totalTransactions) this.totalTransactions = data.totalTransactions;
    if (data.totalDeposits) this.totalDeposits = data.totalDeposits;
    if (data.totalWithdrawals) this.totalWithdrawals = data.totalWithdrawals;
    if (data.totalRewards) this.totalRewards = data.totalRewards;
    if (data.totalFees) this.totalFees = data.totalFees;
    if (data.totalReferrals) this.totalReferrals = data.totalReferrals;
    if (data.totalWelcomeAwards) this.totalWelcomeAwards = data.totalWelcomeAwards;
    if (data.totalAdminAdjustments) this.totalAdminAdjustments = data.totalAdminAdjustments;
    if (data.lastBlockIndex !== undefined) this.lastBlockIndex = data.lastBlockIndex;
    
    this.updatedAt = new Date();
    await this.save();
    return this;
};

// ✅ تحديث الرصيد الاحتياطي
adminAccountSchema.methods.updateReserveBalance = async function(amount, type) {
    // type: 'add' or 'subtract'
    if (type === 'add') {
        this.reserveBalance += amount;
        this.circulatingSupply -= amount;
    } else if (type === 'subtract') {
        this.reserveBalance -= amount;
        this.circulatingSupply += amount;
    }
    
    this.updatedAt = new Date();
    await this.save();
    return this;
};

// ✅ تحديث إحصائيات المعاملات
adminAccountSchema.methods.addTransaction = async function(transactionType, amount) {
    this.totalTransactions += 1;
    
    switch(transactionType) {
        case 'deposit':
            this.totalDeposits += amount;
            break;
        case 'withdrawal':
            this.totalWithdrawals += amount;
            break;
        case 'prize':
            this.totalRewards += amount;
            break;
        case 'referral':
            this.totalReferrals += amount;
            break;
        case 'welcome_award':
            this.totalWelcomeAwards += amount;
            break;
        case 'admin_adjustment':
            this.totalAdminAdjustments += amount;
            break;
        case 'entry_fee':
            // تتبع رسوم الدخول
            break;
        case 'transfer':
            // تتبع التحويلات
            break;
    }
    
    this.updatedAt = new Date();
    await this.save();
    return this;
};

// ✅ جلب إحصائيات Admin
adminAccountSchema.statics.getStats = async function() {
    let account = await this.findOne();
    if (!account) {
        account = await this.createAdminAccount();
    }
    
    const User = mongoose.model('User');
    const totalUsers = await User.countDocuments();
    
    const stats = {
        totalSupply: account.totalSupply,
        circulatingSupply: account.circulatingSupply,
        reserveBalance: account.reserveBalance,
        totalUsers: totalUsers,
        totalTransactions: account.totalTransactions,
        totalDeposits: account.totalDeposits,
        totalWithdrawals: account.totalWithdrawals,
        totalRewards: account.totalRewards,
        totalFees: account.totalFees,
        totalReferrals: account.totalReferrals,
        totalWelcomeAwards: account.totalWelcomeAwards,
        totalAdminAdjustments: account.totalAdminAdjustments,
        lastBlockIndex: account.lastBlockIndex,
        updatedAt: account.updatedAt
    };
    
    return stats;
};

// ✅ التحقق من وجود حساب Admin
adminAccountSchema.statics.accountExists = async function() {
    const account = await this.findOne();
    return !!account;
};

// ✅ إعادة تعيين حساب Admin (للاختبار فقط)
adminAccountSchema.statics.resetAccount = async function() {
    await this.deleteMany({});
    return await this.createAdminAccount();
};

// ✅ فهارس للبحث السريع
adminAccountSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('AdminAccount', adminAccountSchema);