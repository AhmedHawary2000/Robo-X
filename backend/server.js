require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/robo-x';

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Middleware
app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static Files
app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/admin', express.static(path.join(__dirname, '../frontend/public/admin')));

// MongoDB Connection
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
})
.then(() => {
    console.log('✅ Connected to MongoDB successfully!');
    initializeSystem();
})
.catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
});

// ============================================
// ✅ INITIALIZE SYSTEM
// ============================================

const initializeSystem = async () => {
    try {
        const AdminAccount = require('./models/AdminAccount');
        let adminAccount = await AdminAccount.findOne();
        if (!adminAccount) {
            adminAccount = new AdminAccount();
            await adminAccount.save();
            console.log('✅ Admin Account created successfully!');
        }
        
        const SystemSettings = require('./models/SystemSettings');
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = new SystemSettings();
            await settings.save();
            console.log('✅ System Settings created successfully!');
        }
        
        const Block = require('./models/Block');
        const existingGenesis = await Block.findOne({ index: 0 });
        if (!existingGenesis) {
            const crypto = require('crypto');
            const genesisBlock = new Block({
                index: 0,
                timestamp: new Date(),
                previousHash: '0',
                hash: '',
                transaction: {
                    type: 'genesis',
                    from: null,
                    to: 'admin',
                    amount: 1000000000,
                    description: 'Genesis Block - Base Supply 1,000,000,000 RX'
                },
                nonce: 0,
                isValid: true,
                verified: true
            });
            
            const data = {
                index: genesisBlock.index,
                timestamp: genesisBlock.timestamp.getTime(),
                previousHash: genesisBlock.previousHash,
                transaction: genesisBlock.transaction,
                nonce: genesisBlock.nonce
            };
            genesisBlock.hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
            
            await genesisBlock.save();
            console.log('✅ Genesis Block created successfully!');
        }
        
        console.log('✅ System initialized successfully!');
        console.log(`📊 Total Supply: ${settings?.totalSupply || 1000000000} RX`);
        console.log(`📊 Reserve Balance: ${adminAccount?.reserveBalance || 0} RX`);
        
    } catch (error) {
        console.error('❌ System initialization error:', error);
    }
};

// ============================================
// ✅ ROUTES
// ============================================

// Auth Routes
app.use('/api/auth', require('./routes/auth'));

// Admin Routes
app.use('/api/admin', require('./routes/admin'));

// Blockchain Routes
app.use('/api/blockchain', require('./routes/blockchain'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'Robo X is running!',
        version: '0.3.0',
        timestamp: new Date(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============================================
// PAGE ROUTES
// ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/dashboard.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/register.html'));
});

app.get('/builder', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/builder.html'));
});

app.get('/competition', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/competition.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/admin/index.html'));
});

app.get('/explorer', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/explorer.html'));
});

app.get('/wallet', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/public/wallet.html'));
});

// ============================================
// SOCKET.IO
// ============================================

io.on('connection', (socket) => {
    console.log('🟢 User connected:', socket.id);
    socket.on('disconnect', () => {
        console.log('🔴 User disconnected:', socket.id);
    });
});

// ============================================
// START SERVER
// ============================================

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🤖 Robo X Server is running!');
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🛡️ Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
    console.log(`🔐 Login: http://localhost:${PORT}/login`);
    console.log(`📝 Register: http://localhost:${PORT}/register`);
    console.log(`🔗 Blockchain Explorer: http://localhost:${PORT}/explorer`);
    console.log(`💰 Wallet: http://localhost:${PORT}/wallet`);
    console.log(`📦 Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
    console.log('='.repeat(50));
});