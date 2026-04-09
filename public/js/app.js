document.addEventListener('DOMContentLoaded', () => {

    // Request browser notification permission
    requestNotificationPermission();

    let current = { type: null, id: null };
    let users = [];
    const typingState = {
        active: false,
        timeoutId: null,
        groupTypers: new Set()
    };

    let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || {};
    window.notifications = JSON.parse(localStorage.getItem('notifications')) || {};

    // Create typing indicator element just under messages
    const messagesContainer = document.getElementById('messages');
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typingIndicator';
    typingIndicator.className = 'typing-indicator';
    messagesContainer.parentNode.insertBefore(typingIndicator, document.querySelector('.input-area'));

    // Authentication flow - store both username and password for auto-login
    let username = localStorage.getItem('username');
    let password = localStorage.getItem('password'); // Store password for auto-login
    let isAuthenticated = false;
    let pendingAuth = null;

    function doAuthenticate(user, pass) {
        console.log("check event >>>>>>>>>>>>>>>>>>>>>>");
        
        if (socket.connected) {
            socket.emit('authenticate', { username: user, password: pass });
        } else {
            pendingAuth = { username: user, password: pass };
        }
    }

    function authenticate() {
        // Check if both username and password stored (auto-login)
        const storedUsername = localStorage.getItem('username');
        const storedPassword = localStorage.getItem('password');

        if (storedUsername && storedPassword !== null) {
            // Auto-login with stored credentials
            username = storedUsername;
            password = storedPassword;
            console.log('Auto-login for:', username);
            doAuthenticate(username, password);
            
            // Show app, hide login
            document.getElementById('loginPage').style.display = 'none';
            document.querySelector('.app').style.display = 'flex';
        } else {
            // Show login page
            document.getElementById('loginPage').style.display = 'flex';
            document.querySelector('.app').style.display = 'none';
        }
    }

    // Handle login form submission
    document.getElementById('loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const user = document.getElementById('loginUsername').value.trim();
        const pass = document.getElementById('loginPassword').value;
        
        if (!user) {
            alert('Please enter a username');
            return;
        }
        
        username = user;
        password = pass || '';
        
        doAuthenticate(username, password);
    });

    // Switch between login and register pages
    document.getElementById('openRegister').addEventListener('click', (e) => {
        e.preventDefault();
        const user = document.getElementById('loginUsername').value.trim();
        if (user) document.getElementById('regUsername').value = user;
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('registerPage').style.display = 'flex';
    });
    document.getElementById('openLogin').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('registerPage').style.display = 'none';
        document.getElementById('loginPage').style.display = 'flex';
    });

    // Register form submission
    document.getElementById('registerForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const user = document.getElementById('regUsername').value.trim();
        const pass = document.getElementById('regPassword').value;
        const confirm = document.getElementById('regConfirm').value;
        if (!user) {
            alert('Please enter a username');
            return;
        }
        if (!pass) {
            alert('Please enter a password');
            return;
        }
        if (pass !== confirm) {
            alert('Passwords do not match');
            return;
        }
        socket.emit('register', { username: user, password: pass });
    });

    // Handle socket connection - send pending auth
    socket.on('connect', () => {
        const storedUsername = localStorage.getItem('username');
        const storedPassword = localStorage.getItem('password');

        if (storedUsername) {
            // Always re-authenticate on connect to associate new socket.id
            socket.emit('authenticate', { username: storedUsername, password: storedPassword || '' });
        } else if (pendingAuth) {
            socket.emit('authenticate', pendingAuth);
            pendingAuth = null;
        }
    });

    // Handle authentication response
    socket.on('auth success', (data) => {
        isAuthenticated = true;
        username = data.username; // Use the exact username from server
        window.username = username;
        localStorage.setItem('username', username);
        localStorage.setItem('password', password || ''); // Save password for auto-login
        document.getElementById('currentUser').textContent = 'Logged in as: ' + username;
        
        // Hide login page, show app
        document.getElementById('loginPage').style.display = 'none';
        document.querySelector('.app').style.display = 'flex';

        socket.emit('get users');
        socket.emit('get groups'); // Request groups list

        // Initial render to show persisted notifications
        renderUsers(users);
        renderGroups(window.currentGroups || {});
    });

    socket.on('auth failed', (msg) => {
        if ((msg || '').toLowerCase().includes('not exist')) {
            alert('User not exist. Please register yourself.');
            const attempted = document.getElementById('loginUsername').value.trim();
            if (attempted) document.getElementById('regUsername').value = attempted;
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('registerPage').style.display = 'flex';
        } else {
            alert('Authentication failed: ' + msg);
            document.getElementById('loginPassword').value = '';
        }
    });

    socket.on('register success', (msg) => {
        alert(msg);
        const user = document.getElementById('regUsername').value.trim();
        const pass = document.getElementById('regPassword').value;
        username = user;
        password = pass;
        localStorage.setItem('username', username);
        localStorage.setItem('password', password);
        document.getElementById('registerPage').style.display = 'none';
        document.getElementById('loginPage').style.display = 'none';
        document.querySelector('.app').style.display = 'flex';
    });

    socket.on('register failed', (msg) => {
        alert('Registration failed: ' + msg);
    });

    // Start authentication
    authenticate();

    socket.on('user list', data => {
        users = data;
        renderUsers(users);
    });

    socket.on('error', msg => {
        alert('Error: ' + msg);
    });

    socket.on('group list', renderGroups);

    socket.on('private history', messages => {
        const key = 'private_' + [username, current.id].sort().join('-');
        chatHistory[key] = messages;
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        if (current.type === 'private') {
            loadMessages();
        }
    });

    socket.on('group history', serverMessages => {
        const key = 'group_' + current.id;

        // Merge server history with local history (to avoid duplicates)
        const localMessages = chatHistory[key] || [];

        // Create a map of existing messages by unique key (text + time + username)
        const existingKeys = new Set(localMessages.map(m => `${m.username}:${m.text}:${m.time}`));

        // Add server messages that don't exist locally
        serverMessages.forEach(msg => {
            const msgKey = `${msg.username}:${msg.text}:${msg.time}`;
            if (!existingKeys.has(msgKey)) {
                localMessages.push(msg);
            }
        });

        // Sort by time if available
        localMessages.sort((a, b) => {
            if (a.time && b.time) return a.time.localeCompare(b.time);
            return 0;
        });

        chatHistory[key] = localMessages;
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        if (current.type === 'group') {
            loadMessages();
        }
    });

    // ✅ PRIVATE MESSAGE
    socket.on('private message', msg => {
        const currentUsername = username || window.username || localStorage.getItem('username') || '';
        console.log('Private message received:', msg, 'My username:', currentUsername);

        const roomKey = getPrivateRoomKey(msg);
        const isForMe = msg.to && currentUsername && msg.to.toLowerCase() === currentUsername.toLowerCase();
        const isFromMe = msg.from && currentUsername && msg.from.toLowerCase() === currentUsername.toLowerCase();
        const isCurrentlyChatting = current.type === 'private' && current.id === msg.from;

        console.log('isForMe:', isForMe, 'isFromMe:', isFromMe, 'isCurrentlyChatting:', isCurrentlyChatting);

        saveMessage(roomKey, msg);

        // Show notification for every message when not viewing this chat OR if window is not focused
        const isWindowFocused = document.hasFocus();
        if (isForMe && (!isCurrentlyChatting || !isWindowFocused)) {
            console.log('Showing notification for private message. isCurrentlyChatting:', isCurrentlyChatting, 'isWindowFocused:', isWindowFocused);
            window.notifications[msg.from] = (window.notifications[msg.from] || 0) + 1;
            saveNotifications();
            renderUsers(users);
            showNotification(
                'New message from ' + msg.from,
                msg.text,
                () => {
                    window.notifications[msg.from] = 0;
                    saveNotifications();
                    selectPrivate(msg.from);
                    document.getElementById('chatTitle').textContent = msg.from;
                }
            );
        }

        if (current.type === 'private' && (current.id === msg.from || current.id === msg.to)) {
            addMessage(msg, isFromMe);
        }
    });

    // ✅ GROUP MESSAGE
    socket.on('group message', msg => {
        const currentUsername = username || window.username || localStorage.getItem('username') || '';
        console.log('Group message received:', msg, 'My username:', currentUsername);

        const roomKey = 'group_' + msg.groupId;
        const isCurrentlyViewing = current.type === 'group' && current.id === msg.groupId;
        const isFromMe = msg.from && currentUsername && msg.from.toLowerCase() === currentUsername.toLowerCase();

        saveMessage(roomKey, msg);

        // Show notification for messages from others when not viewing this group OR if window is not focused
        const isWindowFocused = document.hasFocus();
        if (!isFromMe && (!isCurrentlyViewing || !isWindowFocused)) {
            console.log('Showing notification for group message from ' + msg.from + '. isFromMe:', isFromMe, 'isCurrentlyViewing:', isCurrentlyViewing, 'isWindowFocused:', isWindowFocused);
            // Track unread count for group
            window.notifications[msg.groupId] = (window.notifications[msg.groupId] || 0) + 1;
            saveNotifications();
            renderGroups(window.currentGroups || {}); // Refresh to show badge

            showNotification(
                'New message in ' + msg.groupName,
                msg.username + ': ' + msg.text,
                () => {
                    window.notifications[msg.groupId] = 0; // Clear notification on click
                    saveNotifications();
                    
                    const groupEl = document.querySelector('[data-group-id="' + msg.groupId + '"]');
                    let members = [];
                    if (groupEl && groupEl.dataset.members) {
                        members = groupEl.dataset.members.split(',').filter(m => m);
                    }
                    selectGroup(msg.groupId, msg.groupName, members);
                    renderGroups(window.currentGroups || {}); // Refresh to clear badge
                }
            );
        }

        // Display message if viewing the group
        if (isCurrentlyViewing) {
            addMessage(msg, isFromMe);
        }
    });

    const input = document.getElementById('msg');

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });

    // Emit typing events while user types
    input.addEventListener('input', () => {
        if (!current.type || !current.id) return;
        if (!typingState.active) {
            typingState.active = true;
            if (current.type === 'private') {
                socket.emit('typing private', { to: current.id, isTyping: true });
            } else {
                socket.emit('typing group', { groupId: current.id, isTyping: true });
            }
        }
        if (typingState.timeoutId) clearTimeout(typingState.timeoutId);
        typingState.timeoutId = setTimeout(() => stopTyping(), 1200);
    });

    input.addEventListener('blur', () => stopTyping());

    function stopTyping() {
        if (!typingState.active) return;
        typingState.active = false;
        if (!current.type || !current.id) return;
        if (current.type === 'private') {
            socket.emit('typing private', { to: current.id, isTyping: false });
        } else {
            socket.emit('typing group', { groupId: current.id, isTyping: false });
        }
    }

    function updateTypingIndicator(text) {
        typingIndicator.textContent = text || '';
    }

    // Handle incoming typing indicators (private)
    socket.on('typing private', ({ from, isTyping }) => {
        const currentUsername = username || window.username || localStorage.getItem('username') || '';
        if (!from || from.toLowerCase() === (currentUsername || '').toLowerCase()) return;
        if (current.type === 'private' && current.id === from) {
            updateTypingIndicator(isTyping ? `${from} is typing…` : '');
        }
    });

    // Handle incoming typing indicators (group)
    socket.on('typing group', ({ groupId, from, isTyping }) => {
        const currentUsername = username || window.username || localStorage.getItem('username') || '';
        if (!from || from.toLowerCase() === (currentUsername || '').toLowerCase()) return;
        if (current.type !== 'group' || current.id !== groupId) return;
        if (isTyping) {
            typingState.groupTypers.add(from);
        } else {
            typingState.groupTypers.delete(from);
        }
        const list = Array.from(typingState.groupTypers);
        if (list.length === 0) {
            updateTypingIndicator('');
        } else if (list.length === 1) {
            updateTypingIndicator(`${list[0]} is typing…`);
        } else {
            updateTypingIndicator(`${list.slice(0, 3).join(', ')} ${list.length > 3 ? 'and others ' : ''}are typing…`);
        }
    });

    // ✅ SELECT PRIVATE
    window.selectPrivate = function (id) {
        current = { type: 'private', id };

        socket.emit('join private', id);

        window.notifications[id] = 0;
        saveNotifications();

        loadMessages();
        renderUsers(users);
        // Reset typing state on chat switch
        typingState.groupTypers.clear();
        updateTypingIndicator('');
    };

    // ✅ SELECT GROUP
    window.selectGroup = function (id, groupName, members) {
        current = { type: 'group', id };
        socket.emit('join group', id); // Join the group socket room

        window.notifications[id] = 0; // Clear notifications for this group
        saveNotifications();
        renderGroups(window.currentGroups || {}); // Refresh UI

        // Show group info with member count
        const memberCount = members ? members.length : 0;
        const memberList = members ? members.join(', ') : '';
        document.getElementById('chatTitle').textContent = groupName + ' (' + memberCount + ' members: ' + memberList + ')';

        loadMessages();
        // Reset typing state on chat switch
        typingState.groupTypers.clear();
        updateTypingIndicator('');
    };

    // ✅ SEND
    window.send = function () {
        const text = input.value.trim();
        if (!text) return;

        if (!current.type) {
            alert('Select chat first');
            return;
        }

        if (current.type === 'private') {
            socket.emit('private message', { to: current.id, text });
        } else {
            socket.emit('group message', { groupId: current.id, text });
        }

        input.value = '';
        stopTyping();
    };

    // ✅ STORAGE
    function saveMessage(roomKey, msg) {
        if (!chatHistory[roomKey]) chatHistory[roomKey] = [];
        chatHistory[roomKey].push(msg);
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    }

    function saveNotifications() {
        localStorage.setItem('notifications', JSON.stringify(window.notifications));
    }

    function loadMessages() {
        const messagesDiv = document.getElementById('messages');
        messagesDiv.innerHTML = '';

        const roomKey = getRoomKey();
        if (!chatHistory[roomKey]) return;

        const currentUsername = username || window.username || localStorage.getItem('username') || '';

        chatHistory[roomKey].forEach(msg => {
            const isFromMe = msg.from && currentUsername && msg.from.toLowerCase() === currentUsername.toLowerCase();
            addMessage(msg, isFromMe);
        });
    }

    function getRoomKey() {
        if (current.type === 'private') {
            return 'private_' + [username, current.id].sort().join('-');
        }
        if (current.type === 'group') {
            return 'group_' + current.id;
        }
    }

    function getPrivateRoomKey(msg) {
        return 'private_' + [msg.from, msg.to].sort().join('-');
    }

    // ✅ CREATE GROUP
    window.createGroup = function () {
        const name = prompt('Group name');
        const members = prompt('Enter usernames comma separated').split(',').map(s => s.trim());

        socket.emit('create group', { name, members });
    };

    // ✅ DELETE GROUP
    window.deleteGroup = function (groupId) {
        socket.emit('delete group', groupId);
    };

    // Handle group deleted
    socket.on('group deleted', (groupId) => {
        // Clear chat history if viewing deleted group
        if (current.type === 'group' && current.id === groupId) {
            current = { type: null, id: null };
            document.getElementById('chatTitle').textContent = 'Select a chat';
            document.getElementById('messages').innerHTML = '';
        }
        // Remove from local chat history
        const key = 'group_' + groupId;
        if (chatHistory[key]) {
            delete chatHistory[key];
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        }
    });

    // ✅ LOGOUT - only clears password on explicit logout
    window.logout = function () {
        localStorage.removeItem('username');
        localStorage.removeItem('password'); // Clear password on logout
        localStorage.removeItem('chatHistory');
        location.reload();
    };

    // ✅ CHANGE PASSWORD
    window.changePassword = function () {
        const currentPass = prompt('Enter your current password');
        if (currentPass === null) return; // Cancelled

        const newPass = prompt('Enter your new password');
        if (newPass === null) return; // Cancelled

        socket.emit('change password', {
            currentPassword: currentPass || '',
            newPassword: newPass || ''
        });
    };

    // Handle password change response
    socket.on('password changed', (msg) => {
        alert(msg);
        // Update stored password in localStorage
        const newPass = prompt('Password changed!\nRe-enter your new password to save it:');
        if (newPass !== null) {
            password = newPass;
            localStorage.setItem('password', newPass);
        }
    });

    // Automatically clear notifications for current chat when window is focused
    window.addEventListener('focus', () => {
        if (current.id) {
            console.log('Window focused, clearing notifications for:', current.id);
            window.notifications[current.id] = 0;
            saveNotifications();
            if (current.type === 'private') {
                renderUsers(users);
            } else if (current.type === 'group') {
                renderGroups(window.currentGroups || {});
            }
        }
        updateTypingIndicator('');
    });

});
