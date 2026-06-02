require('dotenv').config();
const app = require('./app');
const {databaseConnect} = require('./config/db');
const {createFirstAdmin} = require('./config/createFirstAdmin');
const { seedShipmentPermissionsAndDefaults } = require('./config/seedAccessControl');
const { seedItemsFromCsv } = require('./config/seedItems');
const roleRegistry = require('./core/utils/roleRegistry');
const User = require('./models/auth.model');
const Notification = require('./models/notification.model');

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});

// Initialize Socket.io
const { Server } = require('socket.io');
const allowedOrigins = (process.env.CLIENT_ORIGINS || '').split(',');
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) === -1) {
                return callback(new Error('CORS not allowed'), false);
            }
            return callback(null, true);
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        credentials: true
    },
    allowEIO3: true
});

// Export io for controllers
global.io = io;

io.on('connection', (socket) => {
    console.log('⚡ User connected:', socket.id);

    // Join room based on user/supplier ID for private notifications
    socket.on('join_room', (roomId) => {
        socket.join(roomId);
        console.log(`🏠 User ${socket.id} joined room: ${roomId}`);
    });

    // Handle supplier-initiated schedule events
    socket.on('NEW_SCHEDULE', async (data) => {
        try {
            const activeAdmins = await User.find({ isActive: true }).select('_id').lean();
            if (activeAdmins.length) {
                const notifications = activeAdmins.map(admin => ({
                    userId: admin._id,
                    type: 'new_schedule_created',
                    title: 'New Schedule Created',
                    message: `A new schedule "${data.title}" was created.`,
                    entity: 'SupplierSchedule',
                    entityId: data.id,
                }));
                await Notification.insertMany(notifications);
            }

            // Real-time broadcast to admin room
            io.to('admin').emit('NOTIFICATION', {
                type: 'new_schedule_created',
                title: 'New Schedule',
                message: `New schedule created: ${data.title}`
            });
        } catch (error) {
            console.error('Socket error NEW_SCHEDULE:', error);
        }
    });

    socket.on('SCHEDULE_SUBMITTED', async (data) => {
        try {
            const activeAdmins = await User.find({ isActive: true }).select('_id').lean();
            if (activeAdmins.length) {
                const notifications = activeAdmins.map(admin => ({
                    userId: admin._id,
                    type: 'schedule_submitted',
                    title: 'Schedule Submitted',
                    message: `Schedule "${data.title}" has been submitted for approval.`,
                    entity: 'SupplierSchedule',
                    entityId: data.id,
                }));
                await Notification.insertMany(notifications);
            }

            // Real-time broadcast to admin room
            io.to('admin').emit('NOTIFICATION', {
                type: 'schedule_submitted',
                title: 'Schedule Submitted',
                message: `Schedule submitted for approval: ${data.title}`
            });
        } catch (error) {
            console.error('Socket error SCHEDULE_SUBMITTED:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 User disconnected:', socket.id);
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. On macOS, port 5000 is taken by AirPlay — set PORT=8080 in .env`);
    } else {
        console.error('❌ Server error:', err.message);
    }
    process.exit(1);
});

// Connect to DB after server is up
(async () => {
    try {
        await databaseConnect(process.env.MONGO_URI);
        await createFirstAdmin();
        await seedShipmentPermissionsAndDefaults();
        await seedItemsFromCsv();
        // Load all active roles into the in-memory registry and start
        // the background refresh so new roles are picked up automatically.
        await roleRegistry.initialize();
        roleRegistry.startAutoRefresh();
        console.log('✅ Database connected, admin seeded, access control seeded, and items seeded');
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        console.error('⚠️  Server is running but DB is unavailable — API calls will fail until DB reconnects');
    }
})();
