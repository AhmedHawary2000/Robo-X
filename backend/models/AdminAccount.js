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
    lastBlockIndex: {
        type: Number,
        default: 0
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

adminAccountSchema.methods.verifyTotalSupply = async function() {
    const Wallet = mongoose.model('Wallet');
    const aggregation = await Wallet.aggregate([
        { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    const walletsTotal = aggregation.length > 0 ? aggregation[0].total : 0;
    const total = walletsTotal + this.reserveBalance;
    return total === this.totalSupply;
};

module.exports = mongoose.model('AdminAccount', adminAccountSchema);