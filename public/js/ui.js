function addMessage(msg, isMe = false) {
    const messages = document.getElementById('messages');

    const div = document.createElement('div');
    div.className = `message ${isMe ? 'sent' : 'received'}`;
    div.title = 'Click to copy message text';
    
    const header = document.createElement('span');
    header.className = 'message-header';
    header.textContent = isMe ? 'You' : (msg.username || 'User');
    
    const content = document.createElement('div');
    content.textContent = msg.text;

    div.appendChild(header);
    div.appendChild(content);

    // Add click-to-copy functionality
    div.onclick = () => {
        navigator.clipboard.writeText(msg.text).then(() => {
            div.classList.add('copied');

            const existingFeedback = div.querySelector('.copy-feedback');
            if (existingFeedback) {
                clearTimeout(existingFeedback.timeoutId);
                existingFeedback.remove();
            }

            const feedback = document.createElement('div');
            feedback.className = 'copy-feedback';
            feedback.textContent = '✓ Copied';
            div.appendChild(feedback);

            feedback.timeoutId = setTimeout(() => {
                feedback.remove();
                div.classList.remove('copied');
            }, 1200);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    };

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function renderUsers(users) {
    const el = document.getElementById('users');
    el.innerHTML = '';

    const datalist = document.getElementById('user-list');
    if (datalist) {
        datalist.innerHTML = '';
        users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.username;
            datalist.appendChild(opt);
        });
    }

    if (users.length === 0) {
        el.innerHTML = '<div style="color: #888; font-size: 12px;">No users online</div>';
        return;
    }

    const currentUser = window.username;

    // Sort users: current user first, then others alphabetically
    const sortedUsers = [...users].sort((a, b) => {
        if (a.username === currentUser) return -1;
        if (b.username === currentUser) return 1;
        return a.username.localeCompare(b.username);
    });

    sortedUsers.forEach(u => {
        const d = document.createElement('div');
        d.className = 'user';

        const isMe = u.username === currentUser;
        const isActive = window.current && window.current.type === 'private' && window.current.id === u.username;
        const status = u.online ? '🟢' : '🔴';
        const notify = window.notifications[u.username] ? ` (${window.notifications[u.username]})` : '';
        const meLabel = isMe ? ' (me)' : '';

        d.textContent = status + ' ' + u.username + meLabel + notify;
        d.style.display = 'flex';
        d.style.justifyContent = 'space-between';
        d.style.alignItems = 'center';

        if (isActive) d.classList.add('active');

        if (!isMe) {
            d.style.cursor = 'pointer';
            d.onclick = (e) => {
                if (e.target.className === 'delete-btn') return;
                selectPrivate(u.username);
                document.getElementById('chatTitle').textContent = u.username;
            };
        } else {
            d.style.opacity = '0.7';
        }

        if (currentUser === 'Alpha' && !isMe) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '✕';
            deleteBtn.className = 'delete-btn';
            deleteBtn.style.cssText = 'background:#ff4444;color:white;border:none;border-radius:3px;padding:2px 6px;cursor:pointer;font-size:10px;margin-left:8px;';
            deleteBtn.onclick = () => {
                console.log('Delete clicked for:', u.username);
                if (confirm('Delete ' + u.username + '?')) {
                    console.log('Emitting delete user:', u.username);
                    socket.emit('delete user', u.username);
                }
            };
            d.appendChild(deleteBtn);
        }

        el.appendChild(d);
    });
}

function renderGroups(groups) {
    const el = document.getElementById('groups');
    el.innerHTML = '';

    // Store current groups for notification updates
    window.currentGroups = groups;

    // Sort groups alphabetically by name
    const sortedGroups = Object.entries(groups).sort((a, b) => {
        return a[1].name.localeCompare(b[1].name);
    });

    sortedGroups.forEach(([id, g]) => {
        const container = document.createElement('div');
        container.className = 'group-container';
        const isActive = window.current && window.current.type === 'group' && window.current.id === id;
        if (isActive) container.classList.add('active');
        
        container.style.display = 'flex';
        container.style.justifyContent = 'space-between';
        container.style.alignItems = 'center';
        container.style.padding = '12px';
        container.style.marginBottom = '5px';
        container.style.borderRadius = '10px';

        const d = document.createElement('div');
        d.className = 'group';
        d.dataset.groupId = id;
        d.dataset.members = g.members ? g.members.join(',') : '';
        const memberCount = g.members ? g.members.length : 0;
        const notify = window.notifications[id] ? ` (${window.notifications[id]})` : '';
        
        // Group Info Container
        const groupInfo = document.createElement('div');
        groupInfo.style.display = 'flex';
        groupInfo.style.flexDirection = 'column';
        groupInfo.style.flex = '1';

        const nameLine = document.createElement('div');
        nameLine.textContent = '👨‍👩‍👧 ' + g.name + ' (' + memberCount + ')' + notify;
        nameLine.style.fontWeight = '600';

        const membersLine = document.createElement('div');
        membersLine.textContent = g.members ? g.members.join(', ') : '';
        membersLine.style.fontSize = '11px';
        membersLine.style.opacity = '0.7';
        membersLine.style.whiteSpace = 'nowrap';
        membersLine.style.overflow = 'hidden';
        membersLine.style.textOverflow = 'ellipsis';
        membersLine.style.maxWidth = '160px';
        membersLine.style.marginTop = '2px';

        groupInfo.appendChild(nameLine);
        groupInfo.appendChild(membersLine);

        d.appendChild(groupInfo);
        d.style.cursor = 'pointer';
        d.style.flex = '1';
        d.title = 'Members: ' + (g.members ? g.members.join(', ') : '');

        d.onclick = () => {
            window.notifications[id] = 0; // Clear notification on click
            selectGroup(id, g.name, g.members);
        };

        const currentUser = window.username;
        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '8px';

        // Add member button (only for creator or Alpha)
        if (g.creator === currentUser || currentUser === 'Alpha') {
            const addBtn = document.createElement('button');
            addBtn.textContent = '+';
            addBtn.title = 'Add Member';
            addBtn.style.background = '#25d366';
            addBtn.style.color = 'white';
            addBtn.style.border = 'none';
            addBtn.style.borderRadius = '50%';
            addBtn.style.width = '24px';
            addBtn.style.height = '24px';
            addBtn.style.cursor = 'pointer';
            addBtn.style.display = 'flex';
            addBtn.style.justifyContent = 'center';
            addBtn.style.alignItems = 'center';
            addBtn.style.fontSize = '14px';
            addBtn.onclick = (e) => {
                e.stopPropagation();
                if (window.showModal) {
                    window.showModal(
                        'Add Members to "' + g.name + '"',
                        'Search users and select:',
                        'Add Members',
                        (selectedUsers) => {
                            if (Array.isArray(selectedUsers)) {
                                selectedUsers.forEach(userToAdd => {
                                    socket.emit('add member', { groupId: id, usernameToAdd: userToAdd });
                                });
                            } else if (selectedUsers && selectedUsers.trim()) {
                                socket.emit('add member', { groupId: id, usernameToAdd: selectedUsers.trim() });
                            }
                        },
                        true // Enable multi-select
                    );
                } else {
                    const userToAdd = prompt('Enter username to add to "' + g.name + '"');
                    if (userToAdd && userToAdd.trim()) {
                        socket.emit('add member', { groupId: id, usernameToAdd: userToAdd.trim() });
                    }
                }
            };
            controls.appendChild(addBtn);
        }

        // Delete group button (only for Alpha)
        if (currentUser === 'Alpha') {
            const delBtn = document.createElement('button');
            delBtn.textContent = '✕';
            delBtn.title = 'Delete Group';
            delBtn.style.background = '#ff4444';
            delBtn.style.color = 'white';
            delBtn.style.border = 'none';
            delBtn.style.borderRadius = '50%';
            delBtn.style.width = '24px';
            delBtn.style.height = '24px';
            delBtn.style.cursor = 'pointer';
            delBtn.style.display = 'flex';
            delBtn.style.justifyContent = 'center';
            delBtn.style.alignItems = 'center';
            delBtn.style.fontSize = '12px';
            delBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete group "' + g.name + '"?')) {
                    socket.emit('delete group', id);
                }
            };
            controls.appendChild(delBtn);
        }

        container.appendChild(d);
        container.appendChild(controls);
        el.appendChild(container);
    });
}

// Request notification permission on load
function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

let notificationId = 0;

function showNotification(title, message, onClick = null) {
    // Use native browser notification if permitted
    if ('Notification' in window && Notification.permission === 'granted') {
        notificationId++;
        const notification = new Notification(title, {
            body: message,
            icon: '💬',
            badge: '💬',
            tag: 'chat-' + Date.now() + '-' + notificationId, // Unique tag for each notification
            requireInteraction: false
        });

        notification.onclick = () => {
            window.focus();
            if (onClick) onClick();
            notification.close();
        };

        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000);

        return notification;
    }

    // Fallback to custom popup if permission denied or not supported
    return showCustomNotification(title, message, onClick);
}

function showCustomNotification(title, message, onClick = null) {
    const container = document.getElementById('notification-container');

    const notification = document.createElement('div');
    notification.className = 'notification-popup';

    const header = document.createElement('div');
    header.className = 'notification-header';
    header.textContent = '💬 ' + title;

    const msg = document.createElement('div');
    msg.className = 'notification-message';
    msg.textContent = message;

    notification.appendChild(header);
    notification.appendChild(msg);

    if (onClick) {
        notification.onclick = () => {
            onClick();
            hideNotification(notification);
        };
    }

    container.appendChild(notification);

    setTimeout(() => {
        hideNotification(notification);
    }, 5000);

    return notification;
}

function hideNotification(notification) {
    notification.classList.add('hiding');
    setTimeout(() => {
        notification.remove();
    }, 300);
}
