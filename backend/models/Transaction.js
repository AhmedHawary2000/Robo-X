const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    // ✅ معلومات المعاملة
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    type: {
        type: String,
        enum: [
            'deposit',
            'withdrawal',
            'transfer',
            'entry_fee',
            'prize',
            'referral',
            'welcome_award',
            'admin_adjustment',
            'mint',
            'burn'
        ],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    fee: {
        type: Number,
        default: 0
    },
    
    // ✅ معلومات المرسل والمستقبل
    from: {
        type: String,
        default: null
    },
    to: {
        type: String,
        default: null
    },
    fromUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    toUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    
    // ✅ حالة المعاملة
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'failed', 'cancelled'],
        default: 'pending'
    },
    
    // ✅ معلومات Blockchain
    blockIndex: {
        type: Number,
        default: null
    },
    blockHash: {
        type: String,
        default: null
    },
    
    // ✅ معلومات إضافية
    description: {
        type: String,
        default: ''
    },
    balanceBefore: {
        type: Number,
        default: 0
    },
    balanceAfter: {
        type: Number,
        default: 0
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // ✅ الموافقات
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approvedAt: {
        type: Date,
        default: null
    },
    failedReason: {
        type: String,
        default: ''
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

// ✅ فهارس للبحث السريع
transactionSchema.index({ userId: 1 });
transactionSchema.index({ from: 1, to: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ blockIndex: 1 });
transactionSchema.index({ createdAt: -1 });

transactionSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Transaction', transactionSchema);