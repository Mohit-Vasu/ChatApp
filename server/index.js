const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { connectDB, PendingDeletion } = require('./db');

require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust this if you have a specific domain
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Connect to MongoDB
connectDB();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(express.static(path.join(__dirname, '../public')));

// Use file upload routes
const uploadRoutes = require('./routes/upload');
app.use('/api', uploadRoutes);

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    require('./socket/users')(io, socket);
    require('./socket/groupChat')(io, socket);
    require('./socket/privateChat')(io, socket);
    require('./socket/aiChat')(io, socket);
});

async function runDeletionJob() {
    console.log("Delete Done");
    
    const hasCloudinary =
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET;

    if (!hasCloudinary) return;

    try {
        const now = new Date();
        const due = await PendingDeletion.find({ deleted: false, deleteAt: { $lte: now } }).limit(25);
        if (due.length === 0) return;

        for (const item of due) {
            try {
                await cloudinary.uploader.destroy(item.publicId, {
                    resource_type: item.resourceType,
                    invalidate: true
                });
                await PendingDeletion.updateOne(
                    { _id: item._id },
                    { $set: { deleted: true, deletedAt: new Date(), lastError: '' } }
                );
            } catch (e) {
                await PendingDeletion.updateOne(
                    { _id: item._id },
                    { $set: { lastError: String(e?.message || e) } }
                );
            }
        }
    } catch (e) {
        console.error('Deletion job error:', e);
    }
}

runDeletionJob();
setInterval(runDeletionJob, 15 * 60 * 1000);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
