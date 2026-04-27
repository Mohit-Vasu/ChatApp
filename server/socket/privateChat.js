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

    socket.on('private message', async ({ to, text, fileUrl, fileName, fileType, filePublicId, fileResourceType, replyTo }) => {
        try {
            const fromUser = await User.findOne({ socketId: socket.id });
            if (!fromUser) return;

            const message = {
                messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                text,
                fileUrl,
                fileName,
                fileType,
                filePublicId,
                fileResourceType,
                username: fromUser.username,
                from: fromUser.username,
                to,
                time: new Date().toLocaleTimeString(),
                replyTo: replyTo ? {
                    text: replyTo.text,
                    from: replyTo.from
                } : null
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
            socket.join(roomKey); // Join the private chat room

            const chat = await PrivateChat.findOne({ roomKey });
            socket.emit('private history', chat ? chat.messages : []);
        } catch (e) {
            console.error('Join private error:', e);
        }
    });

    socket.on('add reaction', async ({ chatType, chatId, messageId, emoji, username }) => {
        if (chatType && chatType !== 'private') return;
        try {
            const fromUser = await User.findOne({ socketId: socket.id });
            if (!fromUser) return;

            const roomKey = chatId.startsWith('private_') ? chatId : getRoomKey(fromUser.username, chatId);
            const chat = await PrivateChat.findOne({ roomKey });
            if (!chat) return;

            const message = chat.messages.find(m => (m.messageId || `${m.from}-${m.time}`) === messageId);
            if (!message) return;

            const reactionUsername = username || fromUser.username;
            if (!message.reactions) message.reactions = new Map();

            let reactionsForEmoji = message.reactions.get(emoji) || [];
            if (!reactionsForEmoji.some(r => r.username === reactionUsername)) {
                reactionsForEmoji.push({
                    username: reactionUsername,
                    emoji,
                    timestamp: new Date().toISOString()
                });
                message.reactions.set(emoji, reactionsForEmoji);
                await chat.save();
            }

            io.to(roomKey).emit('reaction update', {
                chatType: 'private',
                chatId: roomKey,
                messageId,
                reactions: Object.fromEntries(message.reactions)
            });
        } catch (e) {
            console.error('Add reaction error (private):', e);
        }
    });

    socket.on('remove reaction', async ({ chatType, chatId, messageId, emoji }) => {
        if (chatType && chatType !== 'private') return;
        try {
            const fromUser = await User.findOne({ socketId: socket.id });
            if (!fromUser) return;

            const roomKey = chatId.startsWith('private_') ? chatId : getRoomKey(fromUser.username, chatId);
            const chat = await PrivateChat.findOne({ roomKey });
            if (!chat) return;

            const message = chat.messages.find(m => (m.messageId || `${m.from}-${m.time}`) === messageId);
            if (!message || !message.reactions) return;

            let reactionsForEmoji = message.reactions.get(emoji);
            if (reactionsForEmoji) {
                const newReactions = reactionsForEmoji.filter(r => r.username !== fromUser.username);
                if (newReactions.length === 0) {
                    message.reactions.delete(emoji);
                } else {
                    message.reactions.set(emoji, newReactions);
                }
                await chat.save();
            }

            io.to(roomKey).emit('remove reaction update', {
                chatType: 'private',
                chatId: roomKey,
                messageId,
                reactions: Object.fromEntries(message.reactions)
            });
        } catch (e) {
            console.error('Remove reaction error (private):', e);
        }
    });
};
