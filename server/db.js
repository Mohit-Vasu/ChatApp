const mongoose = require('mongoose');
require('dotenv').config();

// Attempt to resolve DNS issues by setting a different nameserver
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // 5 seconds timeout
            family: 4 // Use IPv4 only
        });
        console.log('MongoDB connected successfully');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        // Do not exit process here, let the caller handle it if needed
    }
};

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, default: '' },
    socketId: { type: String, default: null },
    online: { type: Boolean, default: false }
});

const groupSchema = new mongoose.Schema({
    groupId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    creator: { type: String, required: true },
    members: [{ type: String }],
    messages: [{
        text: String,
        username: String,
        from: String,
        groupId: String,
        groupName: String,
        time: String,
        fileUrl: String,
        fileName: String,
        fileType: String,
        filePublicId: String,
        fileResourceType: String
    }]
});

const privateChatSchema = new mongoose.Schema({
    roomKey: { type: String, required: true, unique: true },
    messages: [{
        text: String,
        username: String,
        from: String,
        to: String,
        time: String,
        fileUrl: String,
        fileName: String,
        fileType: String,
        filePublicId: String,
        fileResourceType: String
    }]
});

const User = mongoose.model('User', userSchema);
const Group = mongoose.model('Group', groupSchema);
const PrivateChat = mongoose.model('PrivateChat', privateChatSchema);

const pendingDeletionSchema = new mongoose.Schema(
    {
        publicId: { type: String, required: true },
        resourceType: { type: String, required: true },
        deleteAt: { type: Date, required: true },
        deleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        lastError: { type: String, default: '' }
    },
    { timestamps: true }
);

pendingDeletionSchema.index({ publicId: 1, resourceType: 1 }, { unique: true });
pendingDeletionSchema.index({ deleted: 1, deleteAt: 1 });

const PendingDeletion = mongoose.model('PendingDeletion', pendingDeletionSchema);

module.exports = { connectDB, User, Group, PrivateChat, PendingDeletion };
