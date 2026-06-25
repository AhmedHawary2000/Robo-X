const mongoose = require('mongoose');
const crypto = require('crypto');

const blockSchema = new mongoose.Schema({
    index: {
        type: Number,
        required: true,
        unique: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    previousHash: {
        type: String,
        required: true
    },
    hash: {
        type: String,
        required: true,
        unique: true
    },
    transaction: {
        type: {
            type: String,
            enum: [
                'genesis',
                'welcome_award',
                'deposit',
                'withdrawal',
                'transfer',
                'entry_fee',
                'prize',
                'referral',
                'admin_adjustment'
            ],
            required: true
        },
        from: {
            type: String,
            default: null
        },
        to: {
            type: String,
            default: null
        },
        amount: {
            type: Number,
            default: 0
        },
        fee: {
            type: Number,
            default: 0
        },
        description: {
            type: String,
            default: ''
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        }
    },
    nonce: {
        type: Number,
        default: 0
    },
    isValid: {
        type: Boolean,
        default: true
    },
    verified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

blockSchema.methods.calculateHash = function() {
    const data = {
        index: this.index,
        timestamp: this.timestamp.getTime(),
        previousHash: this.previousHash,
        transaction: this.transaction,
        nonce: this.nonce
    };
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

blockSchema.methods.isValidBlock = function() {
    const calculatedHash = this.calculateHash();
    return calculatedHash === this.hash;
};

blockSchema.index({ index: 1 });
blockSchema.index({ hash: 1 });
blockSchema.index({ 'transaction.from': 1 });
blockSchema.index({ 'transaction.to': 1 });

module.exports = mongoose.model('Block', blockSchema);