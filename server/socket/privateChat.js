const fs = require('fs');
const { users } = require('./users');

const privateFile = './private.json';

let privateChats = {};

try {
    privateChats = JSON.parse(fs.readFileSync(privateFile, 'utf8'));
} catch (e) {}

function savePrivate() {
    fs.writeFileSync(privateFile, JSON.stringify(privateChats, null, 2));
}

function getRoomKey(user1, user2) {
    return 'private_' + [user1, user2].sort().join('-');
}

module.exports = (io, socket) => {

    socket.on('private message', ({ to, text }) => {
        const fromUser = Object.values(users).find(u => u.socketId === socket.id);
        if (!fromUser) return;

        const message = {
            text,
            username: fromUser?.username,
            from: fromUser?.username,
            to,
            time: new Date().toLocaleTimeString()
        };

        const roomKey = getRoomKey(fromUser.username, to);
        if (!privateChats[roomKey]) privateChats[roomKey] = [];
        privateChats[roomKey].push(message);
        savePrivate();

        const toSocket = users[to]?.socketId;
        if (users[to]?.online && toSocket) io.to(toSocket).emit('private message', message);
        socket.emit('private message', message);
    });

    // Typing indicator for private chat
    socket.on('typing private', ({ to, isTyping }) => {
        const fromUser = Object.values(users).find(u => u.socketId === socket.id);
        if (!fromUser) return;

        const toSocket = users[to]?.socketId;
        if (users[to]?.online && toSocket) {
            io.to(toSocket).emit('typing private', {
                from: fromUser.username,
                to,
                isTyping: !!isTyping
            });
        }
    });

    socket.on('join private', (toUsername) => {
        const fromUser = Object.values(users).find(u => u.socketId === socket.id);
        if (!fromUser) return;

        const roomKey = getRoomKey(fromUser.username, toUsername);
        socket.emit('private history', privateChats[roomKey] || []);
    });
};
