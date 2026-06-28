const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    // ✅ إعدادات الترحيب
    welcomeAward: {
        type: Number,
        default: 100
    },
    welcomeAwardActive: {
        type: Boolean,
        default: true
    },
    
    // ✅ إعدادات السحب
    minWithdraw: {
        type: Number,
        default: 10
    },
    maxWithdraw: {
        type: Number,
        default: 10000
    },
    withdrawFee: {
        type: Number,
        default: 0.01,
        min: 0,
        max: 100,
        description: 'Percentage fee for withdrawals (e.g., 0.01 = 1%)'
    },
    withdrawFeeType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    withdrawFeeFixed: {
        type: Number,
        default: 0,
        description: 'Fixed fee amount in RX (if withdrawFeeType is "fixed")'
    },
    withdrawMinFee: {
        type: Number,
        default: 0.1,
        description: 'Minimum fee amount in RX'
    },
    withdrawMaxFee: {
        type: Number,
        default: 100,
        description: 'Maximum fee amount in RX'
    },
    
    // ✅ إعدادات الإيداع
    minDeposit: {
        type: Number,
        default: 1
    },
    maxDeposit: {
        type: Number,
        default: 100000
    },
    depositFee: {
        type: Number,
        default: 0,
        description: 'Percentage fee for deposits'
    },
    depositFeeType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    depositFeeFixed: {
        type: Number,
        default: 0
    },
    
    // ✅ إعدادات التحويل
    minTransfer: {
        type: Number,
        default: 1
    },
    maxTransfer: {
        type: Number,
        default: 10000
    },
    transferFee: {
        type: Number,
        default: 0
    },
    transferFeeType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'percentage'
    },
    transferFeeFixed: {
        type: Number,
        default: 0
    },
    transferMinFee: {
        type: Number,
        default: 0
    },
    transferMaxFee: {
        type: Number,
        default: 10
    },
    
    // ✅ إعدادات العملة
    currencySymbol: {
        type: String,
        default: 'RX'
    },
    currencyName: {
        type: String,
        default: 'Robo X Coin'
    },
    totalSupply: {
        type: Number,
        default: 1000000000
    },
    decimalPlaces: {
        type: Number,
        default: 2
    },
    
    // ✅ إعدادات المسابقات
    defaultEntryFee: {
        type: Number,
        default: 10
    },
    maxPlayersPerCompetition: {
        type: Number,
        default: 2
    },
    competitionPrizeMultiplier: {
        type: Number,
        default: 0.7
    },
    competitionFee: {
        type: Number,
        default: 0.05,
        description: 'Platform fee for competitions (percentage)'
    },
    
    // ✅ إعدادات الأمان
    minPasswordLength: {
        type: Number,
        default: 8
    },
    sessionTimeout: {
        type: Number,
        default: 60 // minutes
    },
    maxLoginAttempts: {
        type: Number,
        default: 5
    },
    lockoutDuration: {
        type: Number,
        default: 30 // minutes
    },
    
    // ✅ إعدادات الإحالات
    referralBonus: {
        type: Number,
        default: 10
    },
    referralBonusActive: {
        type: Boolean,
        default: true
    },
    referralBonusType: {
        type: String,
        enum: ['percentage', 'fixed'],
        default: 'fixed'
    },
    referralBonusPercentage: {
        type: Number,
        default: 10,
        description: 'Percentage of deposit for referral bonus'
    },
    
    // ✅ إعدادات عامة
    maintenanceMode: {
        type: Boolean,
        default: false
    },
    maintenanceMessage: {
        type: String,
        default: 'Site is under maintenance. Please check back later.'
    },
    
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ تحديث وقت التعديل
systemSettingsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ✅ حساب رسوم السحب
systemSettingsSchema.methods.calculateWithdrawFee = function(amount) {
    if (!amount || amount <= 0) return 0;
    
    let fee = 0;
    
    if (this.withdrawFeeType === 'percentage') {
        fee = amount * (this.withdrawFee / 100);
    } else if (this.withdrawFeeType === 'fixed') {
        fee = this.withdrawFeeFixed;
    }
    
    // ✅ تطبيق الحد الأدنى والحد الأقصى
    if (this.withdrawMinFee && fee < this.withdrawMinFee) {
        fee = this.withdrawMinFee;
    }
    if (this.withdrawMaxFee && fee > this.withdrawMaxFee) {
        fee = this.withdrawMaxFee;
    }
    
    return Math.round(fee * 100) / 100;
};

// ✅ حساب رسوم التحويل
systemSettingsSchema.methods.calculateTransferFee = function(amount) {
    if (!amount || amount <= 0) return 0;
    
    let fee = 0;
    
    if (this.transferFeeType === 'percentage') {
        fee = amount * (this.transferFee / 100);
    } else if (this.transferFeeType === 'fixed') {
        fee = this.transferFeeFixed;
    }
    
    // ✅ تطبيق الحد الأدنى والحد الأقصى
    if (this.transferMinFee && fee < this.transferMinFee) {
        fee = this.transferMinFee;
    }
    if (this.transferMaxFee && fee > this.transferMaxFee) {
        fee = this.transferMaxFee;
    }
    
    return Math.round(fee * 100) / 100;
};

// ✅ حساب رسوم الإيداع
systemSettingsSchema.methods.calculateDepositFee = function(amount) {
    if (!amount || amount <= 0) return 0;
    
    let fee = 0;
    
    if (this.depositFeeType === 'percentage') {
        fee = amount * (this.depositFee / 100);
    } else if (this.depositFeeType === 'fixed') {
        fee = this.depositFeeFixed;
    }
    
    return Math.round(fee * 100) / 100;
};

// ✅ حساب رسوم المسابقات
systemSettingsSchema.methods.calculateCompetitionFee = function(entryFee) {
    if (!entryFee || entryFee <= 0) return 0;
    return Math.round(entryFee * (this.competitionFee || 0.05) * 100) / 100;
};

// ✅ إنشاء إعدادات النظام الافتراضية
systemSettingsSchema.statics.createDefaultSettings = async function() {
    let settings = await this.findOne();
    if (settings) {
        return settings;
    }
    
    settings = new this({
        welcomeAward: 100,
        welcomeAwardActive: true,
        minWithdraw: 10,
        maxWithdraw: 10000,
        withdrawFee: 0.01,
        withdrawFeeType: 'percentage',
        withdrawFeeFixed: 0,
        withdrawMinFee: 0.1,
        withdrawMaxFee: 100,
        minDeposit: 1,
        maxDeposit: 100000,
        depositFee: 0,
        depositFeeType: 'percentage',
        depositFeeFixed: 0,
        minTransfer: 1,
        maxTransfer: 10000,
        transferFee: 0,
        transferFeeType: 'percentage',
        transferFeeFixed: 0,
        transferMinFee: 0,
        transferMaxFee: 10,
        currencySymbol: 'RX',
        currencyName: 'Robo X Coin',
        totalSupply: 1000000000,
        decimalPlaces: 2,
        defaultEntryFee: 10,
        maxPlayersPerCompetition: 2,
        competitionPrizeMultiplier: 0.7,
        competitionFee: 0.05,
        minPasswordLength: 8,
        sessionTimeout: 60,
        maxLoginAttempts: 5,
        lockoutDuration: 30,
        referralBonus: 10,
        referralBonusActive: true,
        referralBonusType: 'fixed',
        referralBonusPercentage: 10,
        maintenanceMode: false,
        maintenanceMessage: 'Site is under maintenance. Please check back later.'
    });
    
    await settings.save();
    console.log('✅ System Settings created successfully!');
    return settings;
};

// ✅ جلب الإعدادات
systemSettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.createDefaultSettings();
    }
    return settings;
};

// ✅ تحديث الإعدادات
systemSettingsSchema.statics.updateSettings = async function(updateData) {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.createDefaultSettings();
    }
    
    // ✅ تحديث الحقول المقدمة فقط
    const allowedFields = [
        'welcomeAward', 'welcomeAwardActive',
        'minWithdraw', 'maxWithdraw', 'withdrawFee', 'withdrawFeeType', 'withdrawFeeFixed', 'withdrawMinFee', 'withdrawMaxFee',
        'minDeposit', 'maxDeposit', 'depositFee', 'depositFeeType', 'depositFeeFixed',
        'minTransfer', 'maxTransfer', 'transferFee', 'transferFeeType', 'transferFeeFixed', 'transferMinFee', 'transferMaxFee',
        'currencySymbol', 'currencyName', 'totalSupply', 'decimalPlaces',
        'defaultEntryFee', 'maxPlayersPerCompetition', 'competitionPrizeMultiplier', 'competitionFee',
        'minPasswordLength', 'sessionTimeout', 'maxLoginAttempts', 'lockoutDuration',
        'referralBonus', 'referralBonusActive', 'referralBonusType', 'referralBonusPercentage',
        'maintenanceMode', 'maintenanceMessage'
    ];
    
    for (const field of allowedFields) {
        if (updateData[field] !== undefined && updateData[field] !== null) {
            settings[field] = updateData[field];
        }
    }
    
    settings.updatedAt = new Date();
    await settings.save();
    
    return settings;
};

// ✅ جلب إعدادات السحب فقط
systemSettingsSchema.statics.getWithdrawSettings = async function() {
    const settings = await this.getSettings();
    return {
        minWithdraw: settings.minWithdraw,
        maxWithdraw: settings.maxWithdraw,
        withdrawFee: settings.withdrawFee,
        withdrawFeeType: settings.withdrawFeeType,
        withdrawFeeFixed: settings.withdrawFeeFixed,
        withdrawMinFee: settings.withdrawMinFee,
        withdrawMaxFee: settings.withdrawMaxFee
    };
};

// ✅ جلب إعدادات التحويل فقط
systemSettingsSchema.statics.getTransferSettings = async function() {
    const settings = await this.getSettings();
    return {
        minTransfer: settings.minTransfer,
        maxTransfer: settings.maxTransfer,
        transferFee: settings.transferFee,
        transferFeeType: settings.transferFeeType,
        transferFeeFixed: settings.transferFeeFixed,
        transferMinFee: settings.transferMinFee,
        transferMaxFee: settings.transferMaxFee
    };
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);