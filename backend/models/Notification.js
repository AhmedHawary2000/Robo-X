const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true  // ✅ إضافة index للبحث السريع
    },
    type: {
        type: String,
        enum: ['info', 'success', 'warning', 'error', 'achievement', 'competition', 'wallet', 'global', 'ban'],
        default: 'info'
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    icon: {
        type: String,
        default: '📢'
    },
    link: {
        type: String,
        default: null
    },
    isRead: {
        type: Boolean,
        default: false
    },
    expiresAt: {
        type: Date,
        default: function() {
            return new Date(Date.now() + 24 * 60 * 60 * 1000);
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notification', notificationSchema);