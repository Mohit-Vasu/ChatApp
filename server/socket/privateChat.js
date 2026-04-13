const { PrivateChat, User } = require('../db');

let privateChats = {};

// Load private chats from MongoDB into memory for legacy support
async function initPrivate() {
    try {
        const dbChats = await PrivateChat.find({});
        dbChats.forEach(c => {
            privateChats[c.roomKey] = c.messages;
        });
        console.log('Private chats initialized from MongoDB');
    } catch (e) {
        console.error('Error loading private chats from MongoDB:', e);
    }
}

initPrivate();

function getRoomKey(user1, user2) {
    return 'private_' + [user1, user2].sort().join('-');
}

module.exports = (io, socket) => {

    socket.on('private message', async ({ to, text, fileUrl, fileName, fileType, filePublicId, fileResourceType }) => {
        try {
            const fromUser = await User.findOne({ socketId: socket.id });
            if (!fromUser) return;

            const message = {
                text,
                fileUrl,
                fileName,
                fileType,
                filePublicId,
                fileResourceType,
                username: fromUser.username,
                from: fromUser.username,
                to,
                time: new Date().toLocaleTimeString()
            };

            const roomKey = getRoomKey(fromUser.username, to);
            const chat = await PrivateChat.findOneAndUpdate(
                { roomKey },
                { $setOnInsert: { roomKey }, $push: { messages: message } },
                { upsert: true, returnDocument: 'after' }
            );

            if (chat?.messages) {
                privateChats[roomKey] = chat.messages;
            }

            const targetUser = await User.findOne({ username: to });
            if (targetUser?.online && targetUser.socketId) {
                io.to(targetUser.socketId).emit('private message', message);
            }
            socket.emit('private message', message);
        } catch (e) {
            console.error('Private message error:', e);
        }
    });

    // Typing indicator for private chat
    socket.on('typing private', async ({ to, isTyping }) => {
        try {
            const fromUser = await User.findOne({ socketId: socket.id });
            if (!fromUser) return;

            const targetUser = await User.findOne({ username: to });
            if (targetUser?.online && targetUser.socketId) {
                io.to(targetUser.socketId).emit('typing private', {
                    from: fromUser.username,
                    to,
                    isTyping: !!isTyping
                });
            }
        } catch (e) {
            console.error('Typing private error:', e);
        }
    });

    socket.on('join private', async (toUsername) => {
        try {
            const fromUser = await User.findOne({ socketId: socket.id });
            if (!fromUser) return;

            const roomKey = getRoomKey(fromUser.username, toUsername);
            const chat = await PrivateChat.findOne({ roomKey });
            socket.emit('private history', chat ? chat.messages : []);
        } catch (e) {
            console.error('Join private error:', e);
        }
    });
};
