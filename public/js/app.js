document.addEventListener('DOMContentLoaded', () => {

    // Request browser notification permission
    requestNotificationPermission();

    window.current = { type: null, id: null };
    let users = [];
    let replyingToMessage = null;

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
        // console.log("check event >>>>>>>>>>>>>>>>>>>>>>");

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

        // Update both sidebar (if still used) and top-nav username
        const userDisplay = document.getElementById('currentUser');
        if (userDisplay) userDisplay.textContent = 'Logged in as: ' + username;
        
        const userNavDisplay = document.getElementById('currentUserNav');
        if (userNavDisplay) userNavDisplay.textContent = username;

        const userAvatar = document.getElementById('userAvatar');
        const headerAvatar = document.getElementById('headerAvatar');
        const headerName = document.getElementById('headerName');

        if (username) {
            const initial = username.charAt(0).toUpperCase();
            if (userAvatar) userAvatar.textContent = initial;
            if (headerAvatar) headerAvatar.textContent = initial;
            if (headerName) headerName.textContent = username;
        }

        // Hide login page, show app
        document.getElementById('loginPage').style.display = 'none';
        document.querySelector('.app').style.display = 'flex';

        // Show admin panel if Alpha
        if (username === 'Alpha') {
            document.getElementById('adminPanel').style.display = 'block';
            socket.emit('get pending users');
        } else {
            document.getElementById('adminPanel').style.display = 'none';
        }

        socket.emit('get users');
        socket.emit('get groups'); // Request groups list

        // Initial render to show persisted notifications
        renderUsers(users);
        renderGroups(window.currentGroups || {});
    });

    // Dropdown logic
    const userProfile = document.getElementById('userProfile');
    const profileDropdown = document.getElementById('profileDropdown');

    if (userProfile && profileDropdown) {
        userProfile.onclick = (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
            userProfile.classList.toggle('active');
        };

        // Close dropdown when clicking outside
        window.addEventListener('click', () => {
            profileDropdown.classList.remove('active');
            userProfile.classList.remove('active');
        });
    }

    socket.on('auth failed', (msg) => {
        if ((msg || '').toLowerCase().includes('not exist')) {
            alert('User not exist. Please register yourself.');
            const attempted = document.getElementById('loginUsername').value.trim();
            if (attempted) document.getElementById('regUsername').value = attempted;
            document.getElementById('loginPage').style.display = 'none';
            document.getElementById('registerPage').style.display = 'flex';
        } else if (msg === 'your account open approvel get by admin') {
            alert('your account open approvel get by admin');
            localStorage.removeItem('username');
            localStorage.removeItem('password');
            document.getElementById('loginPassword').value = '';
        } else {
            alert('Authentication failed: ' + msg);
            document.getElementById('loginPassword').value = '';
        }
    });

    socket.on('register success', (msg) => {
        alert(msg);
        if (msg === 'your account open approvel get by admin') {
            document.getElementById('registerPage').style.display = 'none';
            document.getElementById('loginPage').style.display = 'flex';
            return;
        }
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

    socket.on('deleted', (msg) => {
        alert(msg);
        localStorage.removeItem('username');
        localStorage.removeItem('password');
        window.location.reload();
    });

    socket.on('group list updated', () => {
        socket.emit('get groups');
    });

    socket.on('group deleted', (groupId) => {
        if (window.current.type === 'group' && window.current.id === groupId) {
            current = { type: null, id: null };
            toggleChat(false);
            document.getElementById('messages').innerHTML = '';
        }
        socket.emit('get groups');
    });

    socket.on('user deleted', (deletedUsername) => {
        // If current private chat was with this user, clear it
        if (window.current.type === 'private' && window.current.id === deletedUsername) {
            current = { type: null, id: null };
            toggleChat(false);
            document.getElementById('messages').innerHTML = '';
        }

        // Remove from local users list
        users = users.filter(u => u.username !== deletedUsername);
        renderUsers(users);
    });

    socket.on('group list', (groups) => {
        window.currentGroups = groups;
        renderGroups(groups);

        // Refresh header if current chat is a group
        if (window.current.type === 'group' && groups[window.current.id]) {
            const g = groups[window.current.id];
            const memberCount = g.members ? g.members.length : 0;
            const membersList = g.members ? g.members.join(', ') : '';
            const creatorInfo = g.creator ? ` | Admin: ${g.creator}` : '';
            document.getElementById('chatTitle').textContent = g.name;
            document.getElementById('chatStatus').textContent = memberCount + ' members: ' + membersList + creatorInfo;
        }
    });

    socket.on('private history', messages => {
        const key = 'private_' + [username, window.current.id].sort().join('-');
        chatHistory[key] = messages;
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        if (window.current.type === 'private') {
            loadMessages();
        }
    });

    socket.on('group history', serverMessages => {
        const key = 'group_' + window.current.id;

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
        if (window.current.type === 'group') {
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
        const isCurrentlyChatting = window.current.type === 'private' && window.current.id === msg.from;

        console.log('isForMe:', isForMe, 'isFromMe:', isFromMe, 'isCurrentlyChatting:', isCurrentlyChatting);

        saveMessage(roomKey, msg);

        // Show notification for every message when not viewing this chat OR if window is not focused
        const isWindowFocused = document.hasFocus();
        if (isForMe && (!isCurrentlyChatting || !isWindowFocused)) {
            console.log('Showing notification for private message. isCurrentlyChatting:', isCurrentlyChatting, 'isWindowFocused:', isWindowFocused);
            window.notifications[msg.from] = (window.notifications[msg.from] || 0) + 1;
            saveNotifications();
            renderUsers(users);
            const notifBody = msg.text || (msg.fileType === 'image' ? '[Image attached]' : (msg.fileUrl ? '[File attached]' : 'New message'));
            showNotification(
                'New message from ' + msg.from,
                notifBody,
                () => {
                    window.notifications[msg.from] = 0;
                    saveNotifications();
                    selectPrivate(msg.from);
                    document.getElementById('chatTitle').textContent = msg.from;
                }
            );
        }

        if (window.current.type === 'private' && (window.current.id === msg.from || window.current.id === msg.to)) {
            addMessage(msg, isFromMe);
        }
    });

    // ✅ GROUP MESSAGE
    socket.on('group message', msg => {
        const currentUsername = username || window.username || localStorage.getItem('username') || '';
        console.log('Group message received:', msg, 'My username:', currentUsername);

        const roomKey = 'group_' + msg.groupId;
        const isCurrentlyViewing = window.current.type === 'group' && window.current.id === msg.groupId;
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

            const notifBody = msg.text ? (msg.username + ': ' + msg.text) : (msg.username + ': ' + (msg.fileType === 'image' ? '[Image attached]' : '[File attached]'));
            showNotification(
                'New message in ' + msg.groupName,
                notifBody,
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

    function resizeMessageBox() {
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });

    // Emit typing events while user types
    input.addEventListener('input', () => {
        // resizeMessageBox();
        if (!window.current.type || !window.current.id) return;
        if (!typingState.active) {
            typingState.active = true;
            if (window.current.type === 'private') {
                socket.emit('typing private', { to: window.current.id, isTyping: true });
            } else {
                socket.emit('typing group', { groupId: window.current.id, isTyping: true });
            }
        }
        if (typingState.timeoutId) clearTimeout(typingState.timeoutId);
        typingState.timeoutId = setTimeout(() => stopTyping(), 1200);
    });

    input.addEventListener('blur', () => stopTyping());

    function stopTyping() {
        if (!typingState.active) return;
        typingState.active = false;
        if (!window.current.type || !window.current.id) return;
        if (window.current.type === 'private') {
            socket.emit('typing private', { to: window.current.id, isTyping: false });
        } else {
            socket.emit('typing group', { groupId: window.current.id, isTyping: false });
        }
    }

    function updateTypingIndicator(text) {
        typingIndicator.textContent = text || '';
    }

    // Handle incoming typing indicators (private)
    socket.on('typing private', ({ from, isTyping }) => {
        const currentUsername = username || window.username || localStorage.getItem('username') || '';
        if (!from || from.toLowerCase() === (currentUsername || '').toLowerCase()) return;
        if (window.current.type === 'private' && window.current.id === from) {
            updateTypingIndicator(isTyping ? `${from} is typing…` : '');
        }
    });

    // Handle incoming typing indicators (group)
    socket.on('typing group', ({ groupId, from, isTyping }) => {
        const currentUsername = username || window.username || localStorage.getItem('username') || '';
        if (!from || from.toLowerCase() === (currentUsername || '').toLowerCase()) return;
        if (window.current.type !== 'group' || window.current.id !== groupId) return;
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

    function toggleChat(show) {
        const welcomeScreen = document.getElementById('welcomeScreen');
        const chatContent = document.getElementById('chatContent');
        if (show) {
            welcomeScreen.style.display = 'none';
            chatContent.style.display = 'flex';
        } else {
            welcomeScreen.style.display = 'flex';
            chatContent.style.display = 'none';
        }
    }

    // ✅ SELECT PRIVATE
    window.selectPrivate = function (id) {
        current = { type: 'private', id };
        toggleChat(true);

        socket.emit('join private', id);

        window.notifications[id] = 0;
        saveNotifications();

        // Update Header
        const targetUser = users.find(u => u.username === id);
        const status = targetUser?.online ? 'Online' : 'Offline';
        document.getElementById('chatTitle').textContent = id;
        document.getElementById('chatStatus').textContent = status;

        loadMessages();
        renderUsers(users);
        // Reset typing state on chat switch
        typingState.groupTypers.clear();
        updateTypingIndicator('');
        cancelReply();
    };

    // ✅ SELECT GROUP
    window.selectGroup = function (id, groupName, members) {
        current = { type: 'group', id };
        toggleChat(true);

        socket.emit('join group', id); // Join the group socket room

        window.notifications[id] = 0; // Clear notifications for this group
        saveNotifications();
        renderGroups(window.currentGroups || {}); // Refresh UI

        // Show group info with member count
        const memberCount = members ? members.length : 0;
        const membersList = members ? members.join(', ') : '';
        const currentGroup = window.currentGroups && window.currentGroups[id];
        const creatorInfo = currentGroup && currentGroup.creator ? ` | Admin: ${currentGroup.creator}` : '';
        document.getElementById('chatTitle').textContent = groupName;
        document.getElementById('chatStatus').textContent = memberCount + ' members: ' + membersList + creatorInfo;

        loadMessages();
        // Reset typing state on chat switch
        typingState.groupTypers.clear();
        updateTypingIndicator('');
        cancelReply();
    };

    // ✅ REPLY LOGIC
    window.initiateReply = function (msg) {
        replyingToMessage = msg;
        const preview = document.getElementById('replyPreview');
        const userText = preview.querySelector('.reply-user');
        const contentText = preview.querySelector('.reply-text');

        userText.textContent = `Replying to ${msg.from}`;
        contentText.textContent = msg.text || (msg.fileType === 'image' ? '[Image]' : '[File]');
        preview.style.display = 'flex';
        input.focus();
    };

    window.cancelReply = function () {
        replyingToMessage = null;
        const preview = document.getElementById('replyPreview');
        if (preview) preview.style.display = 'none';
    };

    // ✅ SEND
    window.send = async function (fileData = null, textOverride = null) {
        let text = textOverride !== null ? String(textOverride).trim() : input.value.trim();

        // If there's no text and no file, do nothing
        if (!text && !fileData) return;

        if (!window.current.type) {
            alert('Select chat first');
            return;
        }

        const payload = { text };
        if (fileData) {
            payload.fileUrl = fileData.url;
            payload.fileType = fileData.fileType;
            payload.fileName = fileData.fileName;
            if (fileData.publicId) payload.filePublicId = fileData.publicId;
            if (fileData.resourceType) payload.fileResourceType = fileData.resourceType;
        }

        // Add reply context if active
        if (replyingToMessage) {
            payload.replyTo = {
                text: replyingToMessage.text || (replyingToMessage.fileType === 'image' ? '[Image]' : '[File]'),
                from: replyingToMessage.from
            };
        }

        if (window.current.type === 'private') {
            payload.to = window.current.id;
            socket.emit('private message', payload);
        } else {
            payload.groupId = window.current.id;
            socket.emit('group message', payload);
        }

        input.value = '';
        cancelReply();
        stopTyping();
    };

    // ✅ FILE UPLOAD
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0) return;

            if (files.length > 10) {
                alert('You can upload max 10 files at once.');
                fileInput.value = '';
                return;
            }

            const tooLarge = files.find(f => f.size > 10 * 1024 * 1024);
            if (tooLarge) {
                alert('File is too large. Max limit is 10MB.');
                fileInput.value = '';
                return;
            }

            if (!window.current.type) {
                alert('Select chat first');
                fileInput.value = '';
                return;
            }

            const formData = new FormData();
            files.forEach(f => formData.append('files', f));

            // Show uploading indicator (simple approach)
            const btn = document.querySelector('.attach-btn');
            const originalIcon = btn.innerHTML;
            btn.innerHTML = '⏳';
            btn.disabled = true;

            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Upload failed');
                }

                const uploadedFiles = Array.isArray(result.files) ? result.files : [result];
                const typedText = input.value.trim();
                uploadedFiles.forEach((fileData, idx) => {
                    window.send(fileData, idx === 0 ? typedText : '');
                });
            } catch (error) {
                console.error('Upload error:', error);
                alert('File upload failed: ' + error.message);
            } finally {
                btn.innerHTML = originalIcon;
                btn.disabled = false;
                fileInput.value = ''; // Reset input
            }
        });
    }

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
        if (window.current.type === 'private') {
            return 'private_' + [username, window.current.id].sort().join('-');
        }
        if (window.current.type === 'group') {
            return 'group_' + window.current.id;
        }
    }

    function getPrivateRoomKey(msg) {
        return 'private_' + [msg.from, msg.to].sort().join('-');
    }

    // ✅ Modal Logic
    const memberModal = document.getElementById('memberModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalLabel = document.getElementById('modalLabel');
    const modalInput = document.getElementById('modalInput');
    const modalConfirm = document.getElementById('modalConfirm');
    const modalCancel = document.getElementById('modalCancel');
    const selectedMembersDiv = document.getElementById('selectedMembers');

    let modalCallback = null;
    let selectedMemberNames = new Set();
    let isMultiSelect = false;

    window.showModal = function (title, label, buttonText, callback, multi = false) {
        modalTitle.textContent = title;
        modalLabel.textContent = label;
        modalInput.value = '';
        modalConfirm.textContent = buttonText;
        modalCallback = callback;
        isMultiSelect = multi;
        selectedMemberNames.clear();
        selectedMembersDiv.innerHTML = '';
        memberModal.style.display = 'flex';
        modalInput.focus();
    };

    function addMemberChip(name) {
        if (selectedMemberNames.has(name)) return;
        selectedMemberNames.add(name);

        const chip = document.createElement('div');
        chip.className = 'member-chip';
        chip.innerHTML = `
            <span>${name}</span>
            <span class="remove-chip">&times;</span>
        `;

        chip.querySelector('.remove-chip').onclick = () => {
            selectedMemberNames.delete(name);
            chip.remove();
        };

        selectedMembersDiv.appendChild(chip);
    }

    modalInput.oninput = (e) => {
        const name = modalInput.value.trim();
        // Check if the input value matches an existing user exactly (from datalist)
        const userExists = users.some(u => u.username === name);
        if (userExists) {
            if (isMultiSelect) {
                addMemberChip(name);
                modalInput.value = '';
            }
        }
    };

    modalInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            const name = modalInput.value.trim();
            if (name) {
                if (isMultiSelect) {
                    addMemberChip(name);
                    modalInput.value = '';
                } else {
                    modalConfirm.onclick();
                }
            }
        }
    };

    modalCancel.onclick = () => {
        memberModal.style.display = 'none';
        modalCallback = null;
    };

    modalConfirm.onclick = () => {
        if (isMultiSelect) {
            if (modalCallback) {
                modalCallback(Array.from(selectedMemberNames));
            }
        } else {
            const val = modalInput.value.trim();
            if (val && modalCallback) {
                modalCallback(val);
            }
        }
        memberModal.style.display = 'none';
        modalCallback = null;
    };

    // Close modal on escape key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && memberModal.style.display === 'flex') {
            modalCancel.onclick();
        }
    });

    // ✅ CREATE GROUP
    window.createGroup = function () {
        const name = prompt('Group name');
        if (!name) return;

        window.showModal(
            'Add Initial Members',
            'Search users and select:',
            'Create Group',
            (members) => {
                if (members.length === 0) {
                    alert('Please select at least one member');
                    return;
                }
                socket.emit('create group', { name, members });
            },
            true // Enable multi-select
        );
    };

    // ✅ DELETE GROUP
    window.deleteGroup = function (groupId) {
        socket.emit('delete group', groupId);
    };

    // Handle group deleted
    socket.on('group deleted', (groupId) => {
        // Clear chat history if viewing deleted group
        if (window.current.type === 'group' && window.current.id === groupId) {
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

    window.logout = function () {
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('username');
            localStorage.removeItem('password');
            window.location.reload();
        }
    };

    window.changePassword = function () {
        const currentPassword = prompt('Enter current password:');
        if (!currentPassword) return;
        const newPassword = prompt('Enter new password:');
        if (!newPassword) return;
        socket.emit('change password', { currentPassword, newPassword });
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

    // Handle pending users list for Admin (Alpha)
    socket.on('pending users list', (pendingUsers) => {
        const container = document.getElementById('pendingUsers');
        if (!container) return;

        container.innerHTML = '';
        if (pendingUsers.length === 0) {
            container.innerHTML = '<div style="padding: 10px; font-size: 12px; opacity: 0.6;">No pending approvals</div>';
            return;
        }

        pendingUsers.forEach(user => {
            const div = document.createElement('div');
            div.className = 'pending-user';
            div.innerHTML = `
                <span style="font-size: 13px;">${user.username}</span>
                <div class="pending-actions">
                    <button onclick="approveUser('${user.username}')" class="approve-btn">Approve</button>
                    <button onclick="rejectUser('${user.username}')" class="reject-btn">Reject</button>
                </div>
            `;
            container.appendChild(div);
        });
    });

    window.approveUser = function (username) {
        if (confirm(`Approve user ${username}?`)) {
            socket.emit('approve user', username);
        }
    };

    window.rejectUser = function (username) {
        if (confirm(`Reject registration for user ${username}?`)) {
            socket.emit('reject user', username);
        }
    };

    socket.on('user approved', (username) => {
        alert(`User ${username} approved!`);
        socket.emit('get pending users');
    });

    socket.on('user rejected', (username) => {
        alert(`User ${username} rejected!`);
        socket.emit('get pending users');
    });

    socket.on('approved', (msg) => {
        alert(msg);
    });

    // Automatically clear notifications for current chat when window is focused
    window.addEventListener('focus', () => {
        if (window.current.id) {
            console.log('Window focused, clearing notifications for:', window.current.id);
            window.notifications[window.current.id] = 0;
            saveNotifications();
            if (window.current.type === 'private') {
                renderUsers(users);
            } else if (window.current.type === 'group') {
                renderGroups(window.currentGroups || {});
            }
        }
        updateTypingIndicator('');
    });

    // ✅ AI Sidebar Logic
    const aiSidebar = document.getElementById('aiSidebar');
    const aiToggleBtn = document.getElementById('aiToggleBtn');
    const closeAiSidebar = document.getElementById('closeAiSidebar');
    const newAiChatBtn = document.getElementById('newAiChatBtn');
    const aiMsgInput = document.getElementById('aiMsgInput');
    const sendAiBtn = document.getElementById('sendAiBtn');
    const aiMessages = document.getElementById('aiMessages');
    const aiImageInput = document.getElementById('aiImageInput');
    const aiUploadBtn = document.getElementById('aiUploadBtn');
    const aiImagePreview = document.getElementById('aiImagePreview');
    const aiPreviewImg = document.getElementById('aiPreviewImg');
    const aiRemoveImg = document.getElementById('aiRemoveImg');

    // Store current AI chat session ID
    let currentAiChatId = null;

    // Store selected image for AI upload
    let aiSelectedImage = null;

    // AI Image Upload Handlers
    aiUploadBtn.addEventListener('click', () => {
        aiImageInput.click();
    });

    aiImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                aiSelectedImage = {
                    data: event.target.result,
                    mimeType: file.type
                };
                aiPreviewImg.src = event.target.result;
                aiImagePreview.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        }
    });

    aiRemoveImg.addEventListener('click', () => {
        aiSelectedImage = null;
        aiImagePreview.style.display = 'none';
        aiPreviewImg.src = '';
        aiImageInput.value = '';
    });

    aiToggleBtn.addEventListener('click', () => {
        aiSidebar.classList.toggle('open');
        if (aiSidebar.classList.contains('open')) {
            aiMsgInput.focus();
            // Load history when opening if no chat is active
            if (!currentAiChatId) {
                socket.emit('get ai history');
            }
        }
    });

    newAiChatBtn.addEventListener('click', () => {
        if (confirm('Start a new AI conversation? Current history will be saved.')) {
            socket.emit('new ai chat');
        }
    });

    socket.on('ai chat created', (data) => {
        currentAiChatId = data.chatId;
        aiMessages.innerHTML = '';
        const welcomeMsg = "Started a new chat session. How can I help you today?";
        addAiMessageToSidebar(welcomeMsg, false);
    });

    socket.on('ai history', (data) => {
        currentAiChatId = data.chatId;
        aiMessages.innerHTML = '';
        
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(msg => {
                addAiMessageToSidebar(msg.text, msg.role === 'user', msg.image?.data);
            });
        } else {
            const welcomeMsg = "Hello! I'm your AI assistant. How can I help you today?";
            addAiMessageToSidebar(welcomeMsg, false);
        }
    });

    closeAiSidebar.addEventListener('click', () => {
        aiSidebar.classList.remove('open');
    });

    function addAiMessageToSidebar(text, isUser = false, imageData = null) {
        const div = document.createElement('div');
        div.className = `message ${isUser ? 'sent' : 'received ai-message'}`;

        const header = document.createElement('span');
        header.className = 'message-header';

        if (!isUser) {
            header.innerHTML = `
                <span class="ai-icon-mini">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2L14.5 8.5L21 11L14.5 13.5L12 20L9.5 13.5L3 11L9.5 8.5L12 2Z"/>
                    </svg>
                </span>
                AI Assistant
            `;
        } else {
            header.textContent = 'You';
        }

        const content = document.createElement('div');
        content.className = 'message-content';

        // Add image if provided
        if (imageData) {
            const imgContainer = document.createElement('div');
            imgContainer.className = 'message-image-container';
            const img = document.createElement('img');
            img.src = imageData;
            img.className = 'message-image chat-image clickable-image';
            img.onclick = () => {
                if (window.openImageModal) window.openImageModal(imageData);
            };
            imgContainer.appendChild(img);
            content.appendChild(imgContainer);
        }

        const textSpan = document.createElement('span');
        if (typeof renderMessageContent === 'function') {
            textSpan.innerHTML = renderMessageContent(text);
        } else {
            textSpan.textContent = text;
        }
        content.appendChild(textSpan);

        // Add copy button for AI sidebar messages
        const copyBtn = document.createElement('button');
        copyBtn.className = 'msg-copy-btn';
        copyBtn.innerHTML = '📋';
        copyBtn.title = 'Copy message';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.copyMessageText) {
                window.copyMessageText(copyBtn, text);
            } else {
                navigator.clipboard.writeText(text);
            }
        };
        div.appendChild(copyBtn);

        div.appendChild(header);
        div.appendChild(content);
        aiMessages.appendChild(div);
        aiMessages.scrollTop = aiMessages.scrollHeight;
    }

    function setAiInputState(isLoading) {
        aiMsgInput.disabled = isLoading;
        sendAiBtn.disabled = isLoading;
        aiUploadBtn.disabled = isLoading;
        if (isLoading) {
            sendAiBtn.style.opacity = '0.5';
            sendAiBtn.style.cursor = 'not-allowed';
            aiMsgInput.placeholder = 'AI is thinking...';
        } else {
            sendAiBtn.style.opacity = '1';
            sendAiBtn.style.cursor = 'pointer';
            aiMsgInput.placeholder = 'Ask AI anything...';
            aiMsgInput.focus();
        }
    }

    function validateAiInput(text, image) {
        if (!text && !image) return false;
        
        // If there's an image, we allow empty or short text
        if (image) return true;

        const trimmedText = text.trim();
        
        // 1. Minimum length check
        if (trimmedText.length < 2) {
            alert('Please enter a more descriptive message.');
            return false;
        }

        // 2. Gibberish check: Check for extremely long words (e.g., > 40 chars) 
        // that are likely keyboard mashing, unless it's a URL or specific pattern
        const words = trimmedText.split(/\s+/);
        const hasTooLongWord = words.some(word => word.length > 40 && !word.startsWith('http'));
        
        if (hasTooLongWord) {
            alert('Your message contains words that are too long. Please use clear language.');
            return false;
        }

        // 3. Repetitive character check (e.g., "aaaaaaa")
        if (/(.)\1{10,}/.test(trimmedText)) {
            alert('Please avoid repetitive characters.');
            return false;
        }

        return true;
    }

    sendAiBtn.addEventListener('click', () => {
        const text = aiMsgInput.value.trim();
        
        if (sendAiBtn.disabled) return;
        if (!validateAiInput(text, aiSelectedImage)) return;

        // Set loading state
        setAiInputState(true);

        // Add user message to sidebar with image if present
        const imageToSend = aiSelectedImage;
        addAiMessageToSidebar(text, true, imageToSend ? imageToSend.data : null);
        aiMsgInput.value = '';

        // Clear image preview
        aiSelectedImage = null;
        aiImagePreview.style.display = 'none';
        aiPreviewImg.src = '';
        aiImageInput.value = '';

        // Add a loading indicator from AI
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message received ai-message loading';
        loadingDiv.id = 'aiLoading';
        loadingDiv.innerHTML = `
            <span class="message-header">
                <span class="ai-icon-mini">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2L14.5 8.5L21 11L14.5 13.5L12 20L9.5 13.5L3 11L9.5 8.5L12 2Z"/>
                    </svg>
                </span>
                AI Assistant
            </span>
            <div class="message-content">
                <span class="thinking-dots">${imageToSend ? 'Analyzing image...' : 'Thinking...'}</span>
            </div>
        `;
        aiMessages.appendChild(loadingDiv);
        aiMessages.scrollTop = aiMessages.scrollHeight;

        // Send message with optional image
        const payload = { 
            text, 
            chatId: currentAiChatId,
            image: imageToSend 
        };
        socket.emit('ai message', payload);
    });

    aiMsgInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAiBtn.click();
        }
    });

    socket.on('ai response', (data) => {
        const loadingDiv = document.getElementById('aiLoading');
        if (loadingDiv) loadingDiv.remove();

        setAiInputState(false);
        addAiMessageToSidebar(data.text, false);
    });

    socket.on('reaction update', (data) => {
        const { chatType, chatId, messageId, reactions } = data;
        const currentRoomKey = getRoomKey();

        if (currentRoomKey === (chatType === 'group' ? `group_${chatId}` : chatId)) {
            updateMessageReactions(data);

            if (chatHistory[currentRoomKey]) {
                const msgObj = chatHistory[currentRoomKey].find(m =>
                    (m.messageId || `${m.from}-${m.time}`) === messageId
                );
                if (msgObj) {
                    msgObj.reactions = reactions;
                }
            }
        }
    });

    socket.on('remove reaction update', (data) => {
        const { chatType, chatId, messageId, reactions } = data;
        const currentRoomKey = getRoomKey();

        if (currentRoomKey === (chatType === 'group' ? `group_${chatId}` : chatId)) {
            updateMessageReactions(data);

            if (chatHistory[currentRoomKey]) {
                const msgObj = chatHistory[currentRoomKey].find(m =>
                    (m.messageId || `${m.from}-${m.time}`) === messageId
                );
                if (msgObj) {
                    msgObj.reactions = reactions;
                }
            }
        }
    });

});
