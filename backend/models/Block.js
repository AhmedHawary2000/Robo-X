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
        required: true,
        default: '0'
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
                'admin_adjustment',
                'mint',
                'burn'
            ],
            required: true,
            default: 'admin_adjustment'
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
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ حساب Hash الكامل
blockSchema.methods.calculateHash = function() {
    const data = {
        index: this.index,
        timestamp: this.timestamp.getTime(),
        previousHash: this.previousHash,
        transaction: {
            type: this.transaction.type,
            from: this.transaction.from,
            to: this.transaction.to,
            amount: this.transaction.amount,
            fee: this.transaction.fee || 0,
            description: this.transaction.description || '',
            metadata: this.transaction.metadata || {}
        },
        nonce: this.nonce
    };
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
};

// ✅ التحقق من صحة Block
blockSchema.methods.isValidBlock = function() {
    const calculatedHash = this.calculateHash();
    return calculatedHash === this.hash;
};

// ✅ إنشاء Block جديد
blockSchema.statics.createBlock = async function(transactionData, previousBlock = null) {
    let previousHash = '0';
    let lastIndex = 0;
    
    if (previousBlock) {
        previousHash = previousBlock.hash;
        lastIndex = previousBlock.index;
    } else {
        const lastBlock = await this.findOne().sort({ index: -1 });
        if (lastBlock) {
            previousHash = lastBlock.hash;
            lastIndex = lastBlock.index;
        }
    }
    
    const newBlock = new this({
        index: lastIndex + 1,
        timestamp: new Date(),
        previousHash: previousHash,
        transaction: transactionData,
        nonce: 0,
        isValid: true,
        verified: true
    });
    
    newBlock.hash = newBlock.calculateHash();
    
    return newBlock;
};

// ✅ إنشاء Genesis Block
blockSchema.statics.createGenesisBlock = async function() {
    const existingGenesis = await this.findOne({ index: 0 });
    if (existingGenesis) {
        return existingGenesis;
    }
    
    const genesisBlock = new this({
        index: 0,
        timestamp: new Date(),
        previousHash: '0',
        transaction: {
            type: 'genesis',
            from: null,
            to: 'admin',
            amount: 1000000000,
            fee: 0,
            description: 'Genesis Block - Base Supply 1,000,000,000 RX',
            metadata: {
                createdBy: 'system',
                timestamp: new Date().toISOString()
            }
        },
        nonce: 0,
        isValid: true,
        verified: true
    });
    
    genesisBlock.hash = genesisBlock.calculateHash();
    await genesisBlock.save();
    
    console.log('✅ Genesis Block created successfully!');
    return genesisBlock;
};

// ✅ البحث عن Block حسب الفهرس
blockSchema.statics.findByIndex = function(index) {
    return this.findOne({ index: index });
};

// ✅ البحث عن Block حسب Hash
blockSchema.statics.findByHash = function(hash) {
    return this.findOne({ hash: hash });
};

// ✅ جلب آخر Block
blockSchema.statics.getLastBlock = function() {
    return this.findOne().sort({ index: -1 });
};

// ✅ جلب جميع Blocks مع ترتيب تصاعدي
blockSchema.statics.getAllBlocks = function() {
    return this.find().sort({ index: 1 });
};

// ✅ جلب Blocks الخاصة بمستخدم
blockSchema.statics.getUserBlocks = function(userId) {
    return this.find({
        $or: [
            { 'transaction.from': userId },
            { 'transaction.to': userId }
        ]
    }).sort({ index: -1 });
};

// ✅ جلب عدد Blocks
blockSchema.statics.getBlockCount = function() {
    return this.countDocuments();
};

// ✅ جلب إجمالي المعاملات
blockSchema.statics.getTotalTransactions = function() {
    return this.countDocuments({ index: { $gt: 0 } });
};

// ✅ ✅ ✅ جلب إحصائيات العملة (Mint و Burn فقط يؤثران على Circulating)
blockSchema.statics.getCoinStats = async function() {
    const result = await this.aggregate([
        { $match: { 'transaction.type': { $in: ['genesis', 'mint', 'burn'] } } },
        { $group: {
            _id: null,
            totalGenesis: { $sum: { $cond: [{ $eq: ['$transaction.type', 'genesis'] }, '$transaction.amount', 0] } },
            totalMint: { $sum: { $cond: [{ $eq: ['$transaction.type', 'mint'] }, '$transaction.amount', 0] } },
            totalBurn: { $sum: { $cond: [{ $eq: ['$transaction.type', 'burn'] }, '$transaction.amount', 0] } }
        }}
    ]);
    
    if (result.length === 0) {
        return {
            totalGenesis: 0,
            totalMint: 0,
            totalBurn: 0,
            circulatingSupply: 0,
            reserveBalance: 1000000000
        };
    }
    
    const data = result[0];
    const circulatingSupply = (data.totalGenesis || 0) + (data.totalMint || 0) - (data.totalBurn || 0);
    const reserveBalance = 1000000000 - circulatingSupply;
    
    return {
        totalGenesis: data.totalGenesis || 0,
        totalMint: data.totalMint || 0,
        totalBurn: data.totalBurn || 0,
        circulatingSupply: circulatingSupply,
        reserveBalance: reserveBalance
    };
};

// ✅ فهارس للبحث السريع
blockSchema.index({ index: 1 });
blockSchema.index({ hash: 1 });
blockSchema.index({ 'transaction.from': 1 });
blockSchema.index({ 'transaction.to': 1 });
blockSchema.index({ 'transaction.type': 1 });
blockSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Block', blockSchema);