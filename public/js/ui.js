function renderMessageContent(text) {
    if (!text) return '';
    
    // Configure marked for code block customization
    const renderer = new marked.Renderer();
    
    // Support both old and new marked versions
    const originalCodeRenderer = renderer.code.bind(renderer);
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderer.code = function(codeOrObj, language, isEscaped) {
        let code, lang;
        if (typeof codeOrObj === 'object') {
            code = codeOrObj.text;
            lang = codeOrObj.lang;
        } else {
            code = codeOrObj;
            lang = language;
        }

        const displayLang = lang || 'code';
        const hasLangClass = lang ? 'has-lang' : '';
        const escapedCode = escapeHtml(code);
        
        return `
            <div class="code-block-container ${hasLangClass}">
                <div class="code-block-header">
                    <span class="code-lang">${displayLang}</span>
                    <button class="copy-code-btn" onclick="copyCode(this)">
                        <span class="copy-icon">📋</span> Copy
                    </button>
                </div>
                <pre class="terminal-style"><code class="${lang ? 'language-' + lang : ''}">${escapedCode}</code></pre>
            </div>
        `;
    };

    marked.setOptions({
        renderer: renderer,
        breaks: true,
        gfm: true,
        headerIds: false,
        mangle: false
    });

    return marked.parse(text);
}

// Global copy function for code blocks
window.copyCode = function(button) {
    const container = button.closest('.code-block-container');
    const code = container.querySelector('code').textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        const originalHtml = button.innerHTML;
        button.innerHTML = '<span class="copy-icon">✅</span> Copied!';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.innerHTML = originalHtml;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy code: ', err);
    });
};

// Global copy function for simple message text
window.copyMessageText = function(button, text) {
    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = button.innerHTML;
        button.innerHTML = '✅';
        button.classList.add('copied');
        
        setTimeout(() => {
            button.innerHTML = originalHtml;
            button.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy text: ', err);
    });
};

function addMessage(msg, isMe = false) {
    const messages = document.getElementById('messages');

    const div = document.createElement('div');
    div.className = `message ${isMe ? 'sent' : 'received'} ${msg.isAi ? 'ai-message' : ''}`;
    // div.title = 'Click to copy message text'; // Remove this as it might interfere with code block copy
    div.dataset.messageId = msg.messageId || `${msg.from}-${msg.time}`;

    const header = document.createElement('span');
    header.className = 'message-header';
    header.textContent = isMe ? 'You' : (msg.username || 'User');

    // Reply context if exists
    if (msg.replyTo) {
        const replyContext = document.createElement('div');
        replyContext.className = 'message-reply-context';
        replyContext.innerHTML = `
            <span class="message-reply-user">${msg.replyTo.from}</span>
            <span class="message-reply-text">${msg.replyTo.text}</span>
        `;
        div.appendChild(replyContext);
    }

    const content = document.createElement('div');
    content.className = 'message-content';
    if (msg.text) {
        // Use markdown rendering
        content.innerHTML = renderMessageContent(msg.text);
        
        // Add copy button for text messages
        const copyBtn = document.createElement('button');
        copyBtn.className = 'msg-copy-btn';
        copyBtn.innerHTML = '📋';
        copyBtn.title = 'Copy message';
        copyBtn.onclick = (e) => {
            e.stopPropagation();
            window.copyMessageText(copyBtn, msg.text);
        };
        div.appendChild(copyBtn);
    }

    div.appendChild(header);
    div.appendChild(content);

    // Reaction Button
    const reactionBtn = document.createElement('button');
    reactionBtn.className = 'reaction-btn';
    reactionBtn.innerHTML = '😀';
    reactionBtn.title = 'React with emoji';
    reactionBtn.onclick = (e) => {
        e.stopPropagation();
        openEmojiPicker(msg, isMe, div);
    };
    div.appendChild(reactionBtn);

    // Reply Button
    const replyBtn = document.createElement('button');
    replyBtn.className = 'reply-btn';
    replyBtn.innerHTML = '⤴️';
    replyBtn.title = 'Reply';
    replyBtn.onclick = (e) => {
        e.stopPropagation();
        window.initiateReply(msg);
    };
    div.appendChild(replyBtn);

    // If there is a file attached
    if (msg.fileUrl) {
        const fileContainer = document.createElement('div');
        fileContainer.className = 'file-message';

        if (msg.fileType === 'image') {
            const img = document.createElement('img');
            img.src = msg.fileUrl;
            img.alt = msg.fileName || 'Image';
            img.onclick = (e) => {
                e.stopPropagation();
                window.open(msg.fileUrl, '_blank');
            };
            img.onload = () => {
                messages.scrollTop = messages.scrollHeight;
            };
            fileContainer.appendChild(img);
        } else {
            const link = document.createElement('a');

            // For Cloudinary downloads, we use fl_attachment to force the download
            // The server now provides a URL that already ends with the original filename
            let downloadUrl = msg.fileUrl;
            if (!downloadUrl.includes('/fl_attachment')) {
                downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
            }

            link.href = downloadUrl;
            link.target = '_blank';
            link.download = msg.fileName || 'file';

            // Get icon based on file extension
            const ext = (msg.fileName || '').split('.').pop().toLowerCase();
            let icon = '📄';
            if (ext === 'pdf') icon = '📕';
            else if (['doc', 'docx'].includes(ext)) icon = '📘';
            else if (['xls', 'xlsx'].includes(ext)) icon = '📗';
            else if (['ppt', 'pptx'].includes(ext)) icon = '📙';
            else if (ext === 'txt') icon = '📝';
            else if (['zip', 'rar', '7z'].includes(ext)) icon = '📦';
            else if (['mp3', 'wav', 'ogg'].includes(ext)) icon = '🎵';
            else if (['mp4', 'mov', 'avi'].includes(ext)) icon = '🎬';

            link.innerHTML = `
                <span class="file-icon">${icon}</span>
                <span class="file-name">${msg.fileName || 'Document'}</span>
                <span class="download-hint" style="margin-left: auto; font-size: 0.8em; opacity: 0.6;">⬇️</span>
            `;
            link.onclick = (e) => e.stopPropagation();
            fileContainer.appendChild(link);
        }

        div.appendChild(fileContainer);
    }

    // Render existing reactions
    if (msg.reactions) {
        renderReactions(msg, div);
    }

    // Update click to copy logic to avoid conflict with code block buttons
    div.onclick = (e) => {
        // If the click was on a button or inside a code block, don't trigger general copy
        if (e.target.closest('button') || e.target.closest('.code-block-container')) {
            return;
        }
        
        if (!msg.text) return;
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

const EMOJIS = [
    // Smiles & Emotions
    '😄', '😅', '😂', '🤣', '🙃', '😌', '🥰', '😗', '😙', '😚', '😛', '😝', '😜', '🤨', '🧐', '🤓', '🤩', '🥳', '😒', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😭', '😤', '😡', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '😴', '🤤', '😪', '🤐', '🥴', '🤢', '🤮', '🤧', '🤨', '🤫', '🤥', '🤡', '👻', '👽', '🤖', '💩', '💀', '👾',
    // Gestures & Body
    '🤚', '✋', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👆', '🖕', '👇', '☝️', '👍', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '🦾', '🦵', '🦿', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '🩸',
    // Hearts & Symbols
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '⚛️', '🉑', '☢️', '☣️', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '⚠️', '🚸', '🔰', '♻️', '🈯', '💹', '❇️', '✳️', '❎', '✅', '💠', '🌀', '➿', '🌐', 'Ⓜ️', '🏧', '🈂️', '♿', '🚾', '🅿️', '🚰', '🚹', '🎦', '🈁', '🆖', '🆗', '🆙', '🆒', '🆕', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏏️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '➡️', '⬅️', '⬆️', '⬇️', '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🎵', '🎶', '➕', '➖', '➗', '✖️', '♾️', '™️', '©️', '®️', '👁️‍️', '🔙', '🔝', '🔜',
    // Animals & Nature
    '🐹', '🐰', '🦊', '🐻', '🐼', '🐮', '🐵', '🙈', '🙉', '🐒', '🐔', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇', '🐝', '🐛', '🐌', '🐞', '🐜', '🦟', '🦂', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬', '🐳', '🐋', '🦈', '🐊', '🦓', '🦍', '🦧', '🐪', '🦒', '🦘', '🐂', '🐄', '🐎', '🐕', '🐩', '🦃', '🕊️', '🦝', '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐾', '🐉', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘️', '🍀', '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🌾', '💐', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙', '🌎', '🪐', '💫', '⭐️', '✨', '⚡️', '☄️', '💥', '🔥', '☀️', '⛅️', '☁️', '⛈️', '🌩️', '❄️', '☃️', '⛄️', '💨', '💧', '💦', '☔️', '☂️',
];

window.currentReactingMessage = null;

function openEmojiPicker(msgObj, isMe, messageDiv) {
    console.log('Opening emoji picker for message:', msgObj.messageId || `${msgObj.from}-${msgObj.time}`);
    window.currentReactingMessage = { msg: msgObj, isMe, messageDiv };

    const modal = document.getElementById('emojiPickerModal');
    const grid = document.getElementById('emojiGrid');
    if (!modal || !grid) {
        console.error('Emoji picker elements not found');
        return;
    }
    grid.innerHTML = '';

    EMOJIS.forEach(emoji => {
        if (emoji === 'generate-id') return; // Filter out the typo if any
        const btn = document.createElement('button');
        btn.textContent = emoji;
        btn.type = 'button';
        btn.onclick = (e) => {
            e.stopPropagation();
            console.log('Emoji selected:', emoji);
            selectReaction(emoji);
        };
        grid.appendChild(btn);
    });

    modal.style.display = 'flex';
}

function closeEmojiPicker() {
    const modal = document.getElementById('emojiPickerModal');
    modal.style.display = 'none';
    window.currentReactingMessage = null;
}

function selectReaction(emoji) {
    if (!window.currentReactingMessage) {
        console.error('No message selected for reaction');
        return;
    }

    if (!window.current || !window.current.type || !window.current.id) {
        console.error('No active chat for reaction');
        return;
    }

    const { msg } = window.currentReactingMessage;
    const currentUsername = window.username || localStorage.getItem('username') || '';

    // Robust check for existing reaction
    let hasReacted = false;
    if (msg.reactions && msg.reactions[emoji]) {
        const reactionList = msg.reactions[emoji];
        if (Array.isArray(reactionList)) {
            hasReacted = reactionList.some(r => r.username === currentUsername);
        }
    }

    const payload = {
        chatType: window.current.type,
        chatId: window.current.id,
        messageId: msg.messageId || `${msg.from}-${msg.time}`,
        emoji,
        username: currentUsername
    };

    if (hasReacted) {
        socket.emit('remove reaction', payload);
    } else {
        socket.emit('add reaction', payload);
    }

    closeEmojiPicker();
}

function renderReactions(msg, messageDiv) {
    const currentUsername = window.username || localStorage.getItem('username') || '';
    let reactionsDiv = messageDiv.querySelector('.message-reactions');

    if (!msg.reactions || Object.keys(msg.reactions).length === 0) {
        if (reactionsDiv) reactionsDiv.remove();
        return;
    }

    if (!reactionsDiv) {
        reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        messageDiv.appendChild(reactionsDiv);
    }

    reactionsDiv.innerHTML = '';

    Object.entries(msg.reactions).forEach(([emoji, users]) => {
        if (!users || users.length === 0) return;

        const badge = document.createElement('span');
        badge.className = 'reaction-badge';

        const hasMyReaction = users.some(r => r.username === currentUsername);
        if (hasMyReaction) {
            badge.classList.add('my-reaction');
        }

        const emojiSpan = document.createElement('span');
        emojiSpan.className = 'reaction-emoji';
        emojiSpan.textContent = emoji;

        const countSpan = document.createElement('span');
        countSpan.className = 'reaction-count';
        countSpan.textContent = users.length;

        const tooltip = document.createElement('span');
        tooltip.className = 'reaction-tooltip';
        tooltip.textContent = users.map(r => r.username).join(', ');

        badge.appendChild(emojiSpan);
        badge.appendChild(countSpan);
        badge.appendChild(tooltip);

        badge.onclick = (e) => {
            e.stopPropagation();
            window.currentReactingMessage = { msg, messageDiv };
            selectReaction(emoji);
        };

        reactionsDiv.appendChild(badge);
    });
}

function updateMessageReactions(msg) {
    const messages = document.querySelectorAll('.message');
    const msgId = msg.messageId || `${msg.from}-${msg.time}`;

    messages.forEach(messageDiv => {
        const divMsgId = messageDiv.dataset.messageId;
        if (divMsgId === msgId) {
            renderReactions(msg, messageDiv);
        }
    });
}
