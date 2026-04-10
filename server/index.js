const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust this if you have a specific domain
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, '../public')));

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    require('./socket/users')(io, socket);
    require('./socket/groupChat')(io, socket);
    require('./socket/privateChat')(io, socket);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});