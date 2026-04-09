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
            const targetSocketId = users[targetUsername].socketId;
            // Delete from users.json
            delete users[targetUsername];
            saveUsers();

            // Permanent Delete related data from groups.json
            const groupsFile = './groups.json';
            try {
                let groups = JSON.parse(fs.readFileSync(groupsFile, 'utf8'));
                let groupsChanged = false;
                Object.keys(groups).forEach(groupId => {
                    const group = groups[groupId];
                    // If the user is the creator, delete the whole group
                    if (group.creator === targetUsername) {
                        delete groups[groupId];
                        groupsChanged = true;
                        io.emit('group deleted', groupId);
                    } else if (group.members.includes(targetUsername)) {
                        // Otherwise, just remove them from the members list
                        group.members = group.members.filter(m => m !== targetUsername);
                        groupsChanged = true;
                    }
                });
                if (groupsChanged) {
                    fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2));
                    // Notify everyone about group list update
                    io.emit('group list updated'); 
                }
            } catch (e) {
                console.error('Error updating groups.json:', e);
            }

            // Permanent Delete related data from private.json
            const privateFile = './private.json';
            try {
                let privateChats = JSON.parse(fs.readFileSync(privateFile, 'utf8'));
                let privateChanged = false;
                Object.keys(privateChats).forEach(roomKey => {
                    // Room keys are like 'private_user1-user2'
                    if (roomKey.includes(`_${targetUsername}-`) || roomKey.endsWith(`-${targetUsername}`)) {
                        delete privateChats[roomKey];
                        privateChanged = true;
                    }
                });
                if (privateChanged) {
                    fs.writeFileSync(privateFile, JSON.stringify(privateChats, null, 2));
                }
            } catch (e) {
                console.error('Error updating private.json:', e);
            }

            // Notify everyone to refresh their data
            io.emit('user list', Object.values(users));
            io.emit('user deleted', targetUsername);

            // Disconnect the deleted user if they are online
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit('deleted', 'Your account has been deleted by Alpha');
                    targetSocket.disconnect();
                }
            }
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
