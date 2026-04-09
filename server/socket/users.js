const fs = require('fs');

const usersFile = './users.json';

let users = {};

try {
    users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
} catch (e) {}

function saveUsers() {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

module.exports = (io, socket) => {

    // Authentication with password
    socket.on('authenticate', ({ username, password }) => {
        console.log('Auth attempt:', username);

        if (!username) {
            socket.emit('auth failed', 'Username required');
            return;
        }

        const trimmedUsername = username.trim();
        const providedPassword = password || ''; // Allow empty passwords

        if (users[trimmedUsername]) {
            // Existing user - verify password
            console.log('Existing user, checking password');
            if (users[trimmedUsername].password === providedPassword) {
                users[trimmedUsername].socketId = socket.id;
                users[trimmedUsername].online = true;
                saveUsers();
                socket.emit('auth success', { username: trimmedUsername });
                io.emit('user list', Object.values(users));
            } else {
                socket.emit('auth failed', 'Incorrect password');
            }
        } else {
            socket.emit('auth failed', 'User not exist');
        }
    });

    socket.on('disconnect', () => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (user) {
            user.online = false;
            saveUsers();
        }
        io.emit('user list', Object.values(users));
    });

    socket.on('get users', () => {
        socket.emit('user list', Object.values(users));
    });

    socket.on('delete user', (targetUsername) => {
        console.log('delete this user ', targetUsername);
        
        const requestingUser = Object.values(users).find(u => u.socketId === socket.id);
        if (!requestingUser || requestingUser.username !== 'Alpha') {
            socket.emit('error', 'Only Alpha can delete users');
            return;
        }
        if (targetUsername === 'Alpha') {
            socket.emit('error', 'Cannot delete Alpha');
            return;
        }
        if (users[targetUsername]) {
            delete users[targetUsername];
            saveUsers();
            io.emit('user list', Object.values(users));
            io.emit('user deleted', targetUsername);
        }
    });

    // Change password
    socket.on('change password', ({ currentPassword, newPassword }) => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (!user) {
            socket.emit('error', 'User not found');
            return;
        }

        // Verify current password
        if (user.password !== currentPassword) {
            socket.emit('error', 'Current password is incorrect');
            return;
        }

        // Update password
        user.password = newPassword || '';
        saveUsers();
        socket.emit('password changed', 'Password updated successfully');
    });

    // Register new user
    socket.on('register', ({ username, password }) => {
        if (!username) {
            socket.emit('register failed', 'Username required');
            return;
        }
        const trimmedUsername = username.trim();
        if (users[trimmedUsername]) {
            socket.emit('register failed', 'User already exists');
            return;
        }
        users[trimmedUsername] = {
            username: trimmedUsername,
            password: password || '',
            socketId: socket.id,
            online: true
        };
        saveUsers();
        socket.emit('register success', 'Account created');
        socket.emit('auth success', { username: trimmedUsername, isNew: true });
        io.emit('user list', Object.values(users));
    });
};

module.exports.users = users;
