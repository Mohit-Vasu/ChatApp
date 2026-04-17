const { Group, User } = require('../db');
const { users } = require('./users');
const { getAiResponse } = require('../ai');

let groups = {};

// Load groups from MongoDB into memory for legacy support
async function initGroups() {
    try {
        const dbGroups = await Group.find({});
        dbGroups.forEach(g => {
            groups[g.groupId] = {
                name: g.name,
                creator: g.creator,
                members: g.members,
                messages: g.messages
            };
        });
        console.log('Groups initialized from MongoDB');
    } catch (e) {
        console.error('Error loading groups from MongoDB:', e);
    }
}

initGroups();

module.exports = (io, socket) => {

    socket.on('create group', async ({ name, members }) => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (!user) return;

            const id = 'g_' + Date.now();

            // Check for non-existent users first
            const missingUsers = [];
            for (const m of members) {
                const existingUser = await User.findOne({ username: m });
                if (!existingUser) missingUsers.push(m);
            }

            if (missingUsers.length > 0) {
                socket.emit('error', `User(s) [${missingUsers.join(', ')}] do not exist. Please check usernames.`);
                return;
            }

            // Ensure creator is included in members
            if (!members.includes(user.username)) {
                members.push(user.username);
            }

            const uniqueMembers = [...new Set(members)];
            const newGroup = new Group({
                groupId: id,
                name,
                creator: user.username,
                members: uniqueMembers,
                messages: []
            });
            await newGroup.save();

            // Update memory cache
            groups[id] = { 
                name, 
                creator: user.username, 
                members: uniqueMembers, 
                messages: [] 
            };

            // Join all online members to the group room
            for (const m of uniqueMembers) {
                const memberUser = await User.findOne({ username: m });
                if (memberUser?.online && memberUser.socketId) {
                    io.sockets.sockets.get(memberUser.socketId)?.join(id);
                }
            }

            // Send filtered group list to each member
            for (const member of uniqueMembers) {
                const memberUser = await User.findOne({ username: member });
                if (memberUser?.online && memberUser.socketId) {
                    const memberGroups = {};
                    for (const [gid, g] of Object.entries(groups)) {
                        if (g.members.includes(member)) {
                            memberGroups[gid] = g;
                        }
                    }
                    io.to(memberUser.socketId).emit('group list', memberGroups);
                }
            }
        } catch (e) {
            console.error('Create group error:', e);
            socket.emit('error', 'Server error during group creation');
        }
    });

    socket.on('group message', async ({ groupId, text, fileUrl, fileName, fileType, filePublicId, fileResourceType, replyTo }) => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (!user) return;

            const group = await Group.findOne({ groupId });
            if (!group) return;

            // Check if user is a member of the group
            if (!group.members.includes(user.username)) {
                socket.emit('error', 'You are not a member of this group');
                return;
            }

            const groupName = group.name || 'Unknown Group';
            const message = {
                text,
                fileUrl,
                fileName,
                fileType,
                filePublicId,
                fileResourceType,
                username: user.username,
                from: user.username,
                groupId,
                groupName,
                time: new Date().toLocaleTimeString(),
                replyTo: replyTo ? {
                    text: replyTo.text,
                    from: replyTo.from
                } : null
            };

            group.messages.push(message);
            await group.save();

            // Update memory cache
            if (groups[groupId]) {
                groups[groupId].messages.push(message);
            }

            // Emit to all members in the group room (including sender)
            io.to(groupId).emit('group message', message);
        } catch (e) {
            console.error('Group message error:', e);
        }
    });

    // Typing indicator for group chat
    socket.on('typing group', async ({ groupId, isTyping }) => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (!user) return;

            const group = await Group.findOne({ groupId });
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
        } catch (e) {
            console.error('Typing group error:', e);
        }
    });

    socket.on('join group', async (groupId) => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (!user) return;

            const group = await Group.findOne({ groupId });
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
        } catch (e) {
            console.error('Join group error:', e);
        }
    });

    // Send groups list on request (for page reload) - filter by membership
    socket.on('get groups', async () => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (!user) return;

            // Filter groups - only show where user is a member, or show all for Alpha
            const userGroups = {};
            const finalGroups = (user.username === 'Alpha') 
                ? await Group.find({}) 
                : await Group.find({ members: user.username });

            finalGroups.forEach(g => {
                userGroups[g.groupId] = {
                    name: g.name,
                    creator: g.creator,
                    members: g.members,
                    messages: g.messages
                };
                socket.join(g.groupId);
            });

            socket.emit('group list', userGroups);
        } catch (e) {
            console.error('Get groups error:', e);
        }
    });

    // Add member to group
    socket.on('add member', async ({ groupId, usernameToAdd }) => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (!user) return;

            const group = await Group.findOne({ groupId });
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
            const targetUser = await User.findOne({ username: usernameToAdd });
            if (!targetUser) {
                socket.emit('error', 'User "' + usernameToAdd + '" does not exist');
                return;
            }

            if (group.members.includes(usernameToAdd)) {
                socket.emit('error', 'User is already a member of this group');
                return;
            }

            group.members.push(usernameToAdd);
            await group.save();

            // Update memory cache
            if (groups[groupId]) {
                groups[groupId].members.push(usernameToAdd);
            }

            // Join the new member's socket to the room if they are online
            if (targetUser.online && targetUser.socketId) {
                io.sockets.sockets.get(targetUser.socketId)?.join(groupId);
            }

            // Refresh group list for everyone to show updated member count
            const allMembers = group.members;
            for (const member of allMembers) {
                const memberUser = await User.findOne({ username: member });
                if (memberUser?.online && memberUser.socketId) {
                    const memberGroups = {};
                    const dbMemberGroups = await Group.find({ members: member });
                    dbMemberGroups.forEach(g => {
                        memberGroups[g.groupId] = {
                            name: g.name,
                            creator: g.creator,
                            members: g.members,
                            messages: g.messages
                        };
                    });
                    io.to(memberUser.socketId).emit('group list', memberGroups);
                }
            }
        } catch (e) {
            console.error('Add member error:', e);
        }
    });

    // Delete group (only for Alpha)
    socket.on('delete group', async (groupId) => {
        try {
            const user = await User.findOne({ socketId: socket.id });
            if (!user || user.username !== 'Alpha') {
                socket.emit('error', 'Only Alpha can delete groups');
                return;
            }

            const group = await Group.findOne({ groupId });
            if (!group) {
                socket.emit('error', 'Group not found');
                return;
            }

            const members = group.members;
            await Group.deleteOne({ groupId });

            // Update memory cache
            if (groups[groupId]) {
                delete groups[groupId];
            }

            // Notify all members to refresh their group list
            for (const member of members) {
                const memberUser = await User.findOne({ username: member });
                if (memberUser?.online && memberUser.socketId) {
                    // Send group list update
                    const memberGroups = {};
                    const dbMemberGroups = await Group.find({ members: member });
                    dbMemberGroups.forEach(g => {
                        memberGroups[g.groupId] = {
                            name: g.name,
                            creator: g.creator,
                            members: g.members,
                            messages: g.messages
                        };
                    });
                    io.to(memberUser.socketId).emit('group list', memberGroups);
                    // Explicitly tell client group is deleted (to clear UI if active)
                    io.to(memberUser.socketId).emit('group deleted', groupId);
                }
            }
        } catch (e) {
            console.error('Delete group error:', e);
            socket.emit('error', 'Server error during group deletion');
        }
    });
};
