const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    // ✅ معرف المستخدم الفريد (RX000000)
    userId: {
        type: String,
        unique: true,
        index: true
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
        default: 100,
        min: 0
    },
    totalEarnings: {
        type: Number,
        default: 0
    },
    totalWithdrawals: {
        type: Number,
        default: 0
    },
    stats: {
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        totalMatches: { type: Number, default: 0 },
        rank: {
            type: String,
            enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Legend'],
            default: 'Bronze'
        },
        rankPoints: { type: Number, default: 0 }
    },
    preferences: {
        language: {
            type: String,
            enum: ['en', 'ar'],
            default: 'en'
        },
        theme: {
            type: String,
            enum: ['dark', 'light'],
            default: 'dark'
        }
    },
    robots: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Robot'
    }],
    activeCompetitions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Competition'
    }],
    completedCompetitions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Competition'
    }],
    isBanned: {
        type: Boolean,
        default: false
    },
    banReason: {
        type: String,
        default: ''
    },
    bannedAt: {
        type: Date
    },
    lastLogin: {
        type: Date,
        default: Date.now
    },
    lastActivity: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// ============================================
// ✅ إنشاء userId تلقائياً قبل حفظ المستخدم
// ============================================

UserSchema.pre('save', async function(next) {
    // إذا كان userId موجوداً بالفعل، تخطى
    if (this.userId) return next();
    
    try {
        // العثور على آخر مستخدم للحصول على آخر رقم
        const lastUser = await mongoose.model('User').findOne()
            .sort({ userId: -1 })
            .select('userId');
        
        let nextNumber = 1;
        
        if (lastUser && lastUser.userId) {
            // استخراج الرقم من userId (مثل RX000005 -> 5)
            const match = lastUser.userId.match(/RX(\d+)/);
            if (match) {
                nextNumber = parseInt(match[1]) + 1;
            }
        }
        
        // تنسيق الرقم إلى 6 أرقام (مثل 000001)
        const paddedNumber = String(nextNumber).padStart(6, '0');
        this.userId = `RX${paddedNumber}`;
        
        console.log(`✅ Generated userId: ${this.userId}`);
        next();
    } catch (error) {
        console.error('❌ Error generating userId:', error);
        next(error);
    }
});

// ============================================
// تشفير كلمة المرور قبل الحفظ
// ============================================

UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// ============================================
// مقارنة كلمة المرور
// ============================================

UserSchema.methods.comparePassword = async function(password) {
    try {
        return await bcrypt.compare(password, this.password);
    } catch (error) {
        return false;
    }
};

// ============================================
// باقي الدوال
// ============================================

UserSchema.methods.calculateRank = function() {
    const points = this.stats.rankPoints || 0;
    if (points >= 10000) return 'Legend';
    if (points >= 5000) return 'Diamond';
    if (points >= 2000) return 'Platinum';
    if (points >= 1000) return 'Gold';
    if (points >= 500) return 'Silver';
    return 'Bronze';
};

UserSchema.methods.updateStats = function(result) {
    this.stats.totalMatches += 1;
    if (result === 'win') {
        this.stats.wins += 1;
        this.stats.rankPoints += 50;
        this.totalEarnings += 10;
    } else if (result === 'loss') {
        this.stats.losses += 1;
        this.stats.rankPoints = Math.max(0, this.stats.rankPoints - 10);
    } else if (result === 'draw') {
        this.stats.draws += 1;
        this.stats.rankPoints += 10;
    }
    this.stats.rank = this.calculateRank();
    this.lastActivity = Date.now();
};

UserSchema.methods.updateBalance = function(amount) {
    const newBalance = this.balance + amount;
    if (newBalance < 0) {
        throw new Error('Insufficient balance');
    }
    this.balance = newBalance;
    this.lastActivity = Date.now();
    return this.balance;
};

UserSchema.methods.ban = function(reason) {
    this.isBanned = true;
    this.banReason = reason || 'No reason provided';
    this.bannedAt = Date.now();
    this.lastActivity = Date.now();
};

UserSchema.methods.unban = function() {
    this.isBanned = false;
    this.banReason = '';
    this.bannedAt = null;
    this.lastActivity = Date.now();
};

UserSchema.virtual('isAdmin').get(function() {
    return this.role === 'admin';
});

UserSchema.virtual('winRate').get(function() {
    if (this.stats.totalMatches === 0) return 0;
    return Math.round((this.stats.wins / this.stats.totalMatches) * 100);
});

UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// ============================================
// INDEXES
// ============================================

UserSchema.index({ userId: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ 'stats.rank': -1 });
UserSchema.index({ isBanned: 1 });
UserSchema.index({ lastActivity: -1 });

module.exports = mongoose.model('User', UserSchema);