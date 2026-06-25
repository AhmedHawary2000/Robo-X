const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    welcomeAward: {
        type: Number,
        default: 100,
        min: 0
    },
    welcomeAwardActive: {
        type: Boolean,
        default: true
    },
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
        default: 0.01
    },
    minDeposit: {
        type: Number,
        default: 1
    },
    maxDeposit: {
        type: Number,
        default: 100000
    },
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
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);