const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    address: {
        type: String,
        unique: true,
        required: true
    },
    balance: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
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

// ✅ توليد عنوان فريد
walletSchema.statics.generateAddress = function() {
    const prefix = 'RX';
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
    
    return prefix + letterPart + numberPart;
};

// ✅ التحقق من صحة العنوان
walletSchema.statics.isValidAddress = function(address) {
    return /^RX[A-Z]{7}[0-9]{7}$/.test(address);
};

// ✅ إنشاء محفظة جديدة
walletSchema.statics.createWallet = async function(userId) {
    const existing = await this.findOne({ userId });
    if (existing) {
        return existing;
    }
    
    let isUnique = false;
    let address = '';
    while (!isUnique) {
        address = this.generateAddress();
        const existingAddress = await this.findOne({ address });
        if (!existingAddress) {
            isUnique = true;
        }
    }
    
    const wallet = new this({
        userId,
        address,
        balance: 0
    });
    
    await wallet.save();
    return wallet;
};

walletSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Wallet', walletSchema);