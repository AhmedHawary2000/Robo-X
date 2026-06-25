const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        unique: true,
        sparse: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'moderator'],
        default: 'user'
    },
    balance: {
        type: Number,
        default: 100
    },
    stats: {
        totalMatches: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        rank: { type: String, default: 'Bronze' },
        rating: { type: Number, default: 1000 }
    },
    isBanned: {
        type: Boolean,
        default: false
    },
    banReason: {
        type: String,
        default: ''
    },
    bannedAt: {
        type: Date,
        default: null
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    referralCode: {
        type: String,
        unique: true,
        sparse: true
    },
    referredBy: {
        type: String,
        default: null
    },
    referralEarnings: {
        type: Number,
        default: 0
    },
    achievements: [{
        type: String
    }],
    competitionHistory: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Competition'
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ✅ تشفير كلمة المرور قبل الحفظ
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// ✅ ✅ ✅ توليد userId بتنسيق RX00000X (رقم تسلسلي)
userSchema.pre('save', async function(next) {
    // إذا كان userId موجوداً بالفعل، تخطى
    if (this.userId) return next();
    
    try {
        // ✅ الحصول على أكبر رقم تسلسلي موجود
        const lastUser = await mongoose.model('User').findOne()
            .sort({ userId: -1 })
            .select('userId');
        
        let nextNumber = 1;
        
        if (lastUser && lastUser.userId) {
            // ✅ استخراج الرقم من userId (مثل RX000003 → 3)
            const match = lastUser.userId.match(/RX(\d+)/);
            if (match) {
                nextNumber = parseInt(match[1]) + 1;
            }
        }
        
        // ✅ إنشاء userId جديد بتنسيق RX + 6 أرقام
        this.userId = 'RX' + String(nextNumber).padStart(6, '0');
        
        console.log(`✅ Generated userId: ${this.userId} for user: ${this.username}`);
        next();
        
    } catch (error) {
        console.error('❌ Error generating userId:', error);
        next(error);
    }
});

// ✅ تحديث وقت التعديل قبل الحفظ
userSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// ✅ مقارنة كلمة المرور
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// ✅ تحويل إلى JSON (إزالة كلمة المرور)
userSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

module.exports = mongoose.model('User', userSchema);