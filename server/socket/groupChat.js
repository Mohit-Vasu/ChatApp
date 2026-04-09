const fs = require('fs');
const { users } = require('./users');

const groupsFile = './groups.json';

let groups = {};

try {
    groups = JSON.parse(fs.readFileSync(groupsFile, 'utf8'));
} catch (e) {}

function saveGroups() {
    fs.writeFileSync(groupsFile, JSON.stringify(groups, null, 2));
}

module.exports = (io, socket) => {

    socket.on('create group', ({ name, members }) => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (!user) return;

        const id = 'g_' + Date.now();

        // Check for non-existent users first
        const missingUsers = members.filter(m => !users[m]);
        if (missingUsers.length > 0) {
            socket.emit('error', `User(s) [${missingUsers.join(', ')}] do not exist. Please check usernames.`);
            return;
        }

        // Ensure creator is included in members
        if (!members.includes(user.username)) {
            members.push(user.username);
        }

        groups[id] = { name, creator: user.username, members: [...new Set(members)], messages: [] };

        // Join all online members to the group room
        members.forEach(m => {
            if (users[m]?.online) {
                io.sockets.sockets.get(users[m].socketId)?.join(id);
            }
        });

        saveGroups();

        // Send filtered group list to each member
        Object.entries(groups).forEach(([gid, group]) => {
            group.members.forEach(member => {
                if (users[member]?.online) {
                    const memberGroups = {};
                    Object.entries(groups).forEach(([id, g]) => {
                        if (g.members.includes(member)) {
                            memberGroups[id] = g;
                        }
                    });
                    io.to(users[member].socketId).emit('group list', memberGroups);
                }
            });
        });
    });

    socket.on('group message', ({ groupId, text }) => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (!user) return;

        const group = groups[groupId];
        if (!group) return;

        // Check if user is a member of the group
        if (!group.members.includes(user.username)) {
            socket.emit('error', 'You are not a member of this group');
            return;
        }

        const groupName = group.name || 'Unknown Group';
        const message = {
            text,
            username: user.username,
            from: user.username,
            groupId,
            groupName,
            time: new Date().toLocaleTimeString()
        };

        group.messages.push(message);
        saveGroups();

        // Emit to all members in the group room (including sender)
        io.to(groupId).emit('group message', message);
    });

    // Typing indicator for group chat
    socket.on('typing group', ({ groupId, isTyping }) => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (!user) return;

        const group = groups[groupId];
        if (!group) return;

        // Only notify group members and exclude sender
        if (!group.members.includes(user.username) && user.username !== 'Alpha') {
            return;
        }

        socket.to(groupId).emit('typing group', {
            groupId,
            from: user.username,
            isTyping: !!isTyping
        });
    });

    socket.on('join group', (groupId) => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (!user) return;

        const group = groups[groupId];
        if (!group) {
            socket.emit('error', 'Group not found');
            return;
        }

        // Check if user is a member
        if (!group.members.includes(user.username) && user.username !== 'Alpha') {
            socket.emit('error', 'You are not a member of this group');
            return;
        }

        socket.join(groupId);
        socket.emit('group history', group.messages);
    });

    // Send groups list on request (for page reload) - filter by membership
    socket.on('get groups', () => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (!user) return;

        // Filter groups - only show where user is a member
        const userGroups = {};
        Object.entries(groups).forEach(([id, group]) => {
            if (group.members.includes(user.username) || user.username === 'Alpha') {
                userGroups[id] = group;
                // Join the group room to receive notifications
                socket.join(id);
            }
        });

        socket.emit('group list', userGroups);
    });

    // Add member to group
    socket.on('add member', ({ groupId, usernameToAdd }) => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (!user) return;

        const group = groups[groupId];
        if (!group) {
            socket.emit('error', 'Group not found');
            return;
        }

        // Only creator or Alpha can add members
        if (group.creator !== user.username && user.username !== 'Alpha') {
            socket.emit('error', 'Only the group creator can add members');
            return;
        }

        // Check if user exists
        if (!users[usernameToAdd]) {
            socket.emit('error', 'User "' + usernameToAdd + '" does not exist');
            return;
        }

        if (group.members.includes(usernameToAdd)) {
            socket.emit('error', 'User is already a member of this group');
            return;
        }

        group.members.push(usernameToAdd);
        saveGroups();

        // Join the new member's socket to the room if they are online
        const targetUser = users[usernameToAdd];
        if (targetUser && targetUser.online) {
            io.sockets.sockets.get(targetUser.socketId)?.join(groupId);
        }

        // Refresh group list for everyone to show updated member count
        Object.entries(groups).forEach(([gid, g]) => {
            g.members.forEach(member => {
                if (users[member]?.online) {
                    const memberGroups = {};
                    Object.entries(groups).forEach(([id, gr]) => {
                        if (gr.members.includes(member)) {
                            memberGroups[id] = gr;
                        }
                    });
                    io.to(users[member].socketId).emit('group list', memberGroups);
                }
            });
        });
    });

    // Delete group
    socket.on('delete group', (groupId) => {
        const user = Object.values(users).find(u => u.socketId === socket.id);
        if (!user) return;

        const group = groups[groupId];
        if (!group) {
            socket.emit('error', 'Group not found');
            return;
        }

        // Only Alpha can delete groups
        if (user.username !== 'Alpha') {
            socket.emit('error', 'Only the admin (Alpha) can delete groups');
            return;
        }

        delete groups[groupId];
        saveGroups();

        // Send filtered group list to each online user
        Object.values(users).forEach(u => {
            if (u?.online) {
                const memberGroups = {};
                Object.entries(groups).forEach(([id, g]) => {
                    if (g.members.includes(u.username) || u.username === 'Alpha') {
                        memberGroups[id] = g;
                    }
                });
                io.to(u.socketId).emit('group list', memberGroups);
            }
        });
        io.emit('group deleted', groupId);
    });
};
