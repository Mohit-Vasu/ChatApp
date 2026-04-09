const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../public')));

io.on('connection', (socket) => {
    console.log('Connected:', socket.id);

    require('./socket/users')(io, socket);
    require('./socket/groupChat')(io, socket);
    require('./socket/privateChat')(io, socket);
});

server.listen(8080, () => {
    console.log('Server running on port 8080');
});