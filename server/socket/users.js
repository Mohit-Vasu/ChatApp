const { User } = require('../db');

let users = {};

// Load users from MongoDB into memory for legacy support
async function initUsers() {
    try {
        const dbUsers = await User.find({});
        dbUsers.forEach(u => {
            users[u.username] = {
                username: u.username,
                password: u.password,
                socketId: u.socketId,
                online: u.online,
                isApproved: u.isApproved
            };
        });
        console.log('Users initialized from MongoDB');
    } catch (e) {
        console.error('Error loading users from MongoDB:', e);
    }
}

initUsers();

function getApprovedUsers() {
    return Object.values(users).filter(u => u.isApproved || u.username === 'Alpha');
}

module.exports = (io, socket) => {

    // Authentication with password
    socket.on('authenticate', async ({ username, password }) => {
        console.log('Auth attempt:', username);

        if (!username) {
            socket.emit('auth failed', 'Username required');
            return;
        }

        const trimmedUsername = username.trim();
        const providedPassword = password || '';

        try {
            let user = await User.findOne({ username: trimmedUsername });

            if (user) {
                if (user.password === providedPassword) {
                    // Check if user is approved
                    if (!user.isApproved && user.username !== 'Alpha') {
                        socket.emit('auth failed', 'your account open approvel get by admin');
                        return;
                    }

                    user.socketId = socket.id;
                    user.online = true;
                    await user.save();
                    
                    // Update memory cache
                    users[trimmedUsername] = {
                        username: user.username,
                        password: user.password,
                        socketId: user.socketId,
                        online: user.online,
                        isApproved: user.isApproved
                    };

                    socket.emit('auth success', { username: trimmedUsername });
                    io.emit('user list', getApprovedUsers());
                } else {
                    socket.emit('auth failed', 'Incorrect password');
                }
            } else {
                socket.emit('auth failed', 'User not exist');
            }
        } catch (e) {
            console.error('Auth error:', e);
            socket.emit('auth failed', 'Server error during authentication');
        }
    });

    socket.on('disconnect', async () => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (user) {
                user.online = false;
                await user.save();
                
                // Update memory cache
                if (users[user.username]) {
                    users[user.username].online = false;
                }
            }
            io.emit('user list', getApprovedUsers());
        } catch (e) {
            console.error('Disconnect error:', e);
        }
    });

    socket.on('get users', () => {
        socket.emit('user list', getApprovedUsers());
    });

    socket.on('delete user', async (targetUsername) => {
        console.log('delete this user ', targetUsername);
        
        try {
            const requestingUser = await User.findOne({ socketId: socket.id });
            if (!requestingUser || requestingUser.username !== 'Alpha') {
                socket.emit('error', 'Only Alpha can delete users');
                return;
            }
            if (targetUsername === 'Alpha') {
                socket.emit('error', 'Cannot delete Alpha');
                return;
            }

            const targetUser = await User.findOne({ username: targetUsername });
            if (targetUser) {
                const targetSocketId = targetUser.socketId;
                
                await User.deleteOne({ username: targetUsername });
                
                // Update memory cache
                delete users[targetUsername];

                // Notify everyone to refresh their data
                io.emit('user list', getApprovedUsers());
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
        } catch (e) {
            console.error('Delete user error:', e);
            socket.emit('error', 'Server error during deletion');
        }
    });

    // Change password
    socket.on('change password', async ({ currentPassword, newPassword }) => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (!user) {
                socket.emit('error', 'User not found');
                return;
            }

            if (user.password !== currentPassword) {
                socket.emit('error', 'Current password is incorrect');
                return;
            }

            user.password = newPassword || '';
            await user.save();
            
            // Update memory cache
            if (users[user.username]) {
                users[user.username].password = user.password;
            }

            socket.emit('password changed', 'Password updated successfully');
        } catch (e) {
            console.error('Change password error:', e);
            socket.emit('error', 'Server error during password update');
        }
    });

    // Register new user
    socket.on('register', async ({ username, password }) => {
        if (!username) {
            socket.emit('register failed', 'Username required');
            return;
        }
        const trimmedUsername = username.trim();
        
        try {
            const existingUser = await User.findOne({ username: trimmedUsername });
            if (existingUser) {
                socket.emit('register failed', 'User already exists');
                return;
            }

            const newUser = new User({
                username: trimmedUsername,
                password: password || '',
                socketId: socket.id,
                online: true,
                isApproved: trimmedUsername === 'Alpha' // Alpha is pre-approved
            });
            await newUser.save();

            // Update memory cache
            users[trimmedUsername] = {
                username: trimmedUsername,
                password: password || '',
                socketId: socket.id,
                online: true,
                isApproved: newUser.isApproved
            };

            if (newUser.isApproved) {
                socket.emit('register success', 'Account created');
                socket.emit('auth success', { username: trimmedUsername, isNew: true });
                io.emit('user list', getApprovedUsers());
            } else {
                socket.emit('register success', 'your account open approvel get by admin');
            }
        } catch (e) {
            console.error('Register error:', e);
            socket.emit('register failed', 'Server error during registration');
        }
    });

    // Get pending users for Alpha
    socket.on('get pending users', async () => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (user && user.username === 'Alpha') {
                const pendingUsers = await User.find({ isApproved: false });
                socket.emit('pending users list', pendingUsers);
            }
        } catch (e) {
            console.error('Get pending users error:', e);
        }
    });

    // Approve user
    socket.on('approve user', async (targetUsername) => {
        try {
            const admin = await User.findOne({ socketId: socket.id });
            if (!admin || admin.username !== 'Alpha') {
                socket.emit('error', 'Only Alpha can approve users');
                return;
            }

            const user = await User.findOne({ username: targetUsername });
            if (user) {
                user.isApproved = true;
                await user.save();

                // Update memory cache
                if (users[targetUsername]) {
                    users[targetUsername].isApproved = true;
                } else {
                    users[targetUsername] = {
                        username: user.username,
                        password: user.password,
                        socketId: user.socketId,
                        online: user.online,
                        isApproved: true
                    };
                }

                socket.emit('user approved', targetUsername);
                io.emit('user list', getApprovedUsers());
                
                // If user is online, notify them (though they wouldn't be able to log in anyway)
                if (user.socketId) {
                    const targetSocket = io.sockets.sockets.get(user.socketId);
                    if (targetSocket) {
                        targetSocket.emit('approved', 'Your account has been approved by Alpha. You can now log in.');
                    }
                }
            }
        } catch (e) {
            console.error('Approve user error:', e);
            socket.emit('error', 'Server error during approval');
        }
    });

    // Reject and delete user
    socket.on('reject user', async (targetUsername) => {
        try {
            const admin = await User.findOne({ socketId: socket.id });
            if (!admin || admin.username !== 'Alpha') {
                socket.emit('error', 'Only Alpha can reject users');
                return;
            }

            const user = await User.findOne({ username: targetUsername });
            if (user) {
                if (user.isApproved) {
                    socket.emit('error', 'Cannot reject an already approved user. Use delete instead.');
                    return;
                }

                const targetSocketId = user.socketId;
                await User.deleteOne({ username: targetUsername });
                
                // Update memory cache
                delete users[targetUsername];

                socket.emit('user rejected', targetUsername);
                // No need to emit user list since they were never in it
                
                // If user is online, notify them and disconnect
                if (targetSocketId) {
                    const targetSocket = io.sockets.sockets.get(targetSocketId);
                    if (targetSocket) {
                        targetSocket.emit('deleted', 'Your registration request has been rejected by Alpha.');
                        targetSocket.disconnect();
                    }
                }
            }
        } catch (e) {
            console.error('Reject user error:', e);
            socket.emit('error', 'Server error during rejection');
        }
    });
};

module.exports.users = users;
