const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0
    },
    lockedBalance: {
        type: Number,
        default: 0
    },
    totalReceived: {
        type: Number,
        default: 0
    },
    totalSent: {
        type: Number,
        default: 0
    },
    totalDeposited: {
        type: Number,
        default: 0
    },
    totalWithdrawn: {
        type: Number,
        default: 0
    },
    totalEarned: {
        type: Number,
        default: 0
    },
    totalSpent: {
        type: Number,
        default: 0
    },
    transactionCount: {
        type: Number,
        default: 0
    },
    lastTransaction: {
        type: Date,
        default: null
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

walletSchema.statics.createForUser = async function(userId) {
    let wallet = await this.findOne({ userId });
    if (wallet) return wallet;
    
    wallet = new this({ userId });
    await wallet.save();
    return wallet;
};

module.exports = mongoose.model('Wallet', walletSchema);