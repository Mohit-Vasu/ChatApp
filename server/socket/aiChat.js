const { getAiResponse } = require('../ai');
const { AIChat } = require('../db');

function toGeminiHistory(messages = []) {
    return messages.reduce((acc, message) => {
        const parts = [];
        const text = typeof message.text === 'string' ? message.text.trim() : '';

        if (message.image?.data) {
            parts.push({
                inlineData: {
                    data: message.image.data.replace(/^data:image\/\w+;base64,/, ''),
                    mimeType: message.image.mimeType || 'image/jpeg'
                }
            });
        }

        if (text) {
            parts.push({ text });
        }

        if (parts.length === 0) {
            return acc;
        }

        acc.push({
            role: message.role,
            parts
        });

        return acc;
    }, []);
}

module.exports = (io, socket) => {
    // Start a new AI chat session
    socket.on('new ai chat', async () => {
        try {
            const username = socket.username;
            if (!username) return;

            const chatId = Date.now().toString();
            const newChat = new AIChat({
                username,
                chatId,
                messages: []
            });
            await newChat.save();

            socket.emit('ai chat created', { chatId });
        } catch (e) {
            console.error('Error creating new AI chat:', e);
        }
    });

    // Get AI chat history
    socket.on('get ai history', async (data) => {
        try {
            const username = socket.username;
            if (!username) return;

            let chatId = data?.chatId;
            
            // If no chatId provided, get the most recent one or create a new one
            let chat;
            if (chatId) {
                chat = await AIChat.findOne({ username, chatId });
            } else {
                chat = await AIChat.findOne({ username }).sort({ createdAt: -1 });
            }

            if (!chat) {
                // Create a default chat if none exists
                chatId = Date.now().toString();
                chat = new AIChat({
                    username,
                    chatId,
                    messages: []
                });
                await chat.save();
            }

            socket.emit('ai history', {
                chatId: chat.chatId,
                messages: chat.messages
            });
        } catch (e) {
            console.error('Error fetching AI history:', e);
        }
    });

    // Handle AI message
    socket.on('ai message', async (data) => {
        try {
            const username = socket.username;
            if (!username) return;

            const text = typeof data === 'string' ? data : data.text;
            const image = typeof data === 'object' && data.image ? data.image : null;
            const chatId = data.chatId;

            // Server-side validation
            if (!image && (!text || text.trim().length < 2)) {
                return socket.emit('ai response', {
                    text: "Please provide a more descriptive message.",
                    time: new Date().toLocaleTimeString()
                });
            }

            if (text && text.length > 2000) {
                return socket.emit('ai response', {
                    text: "Message is too long. Please keep it under 2000 characters.",
                    time: new Date().toLocaleTimeString()
                });
            }

            if (!chatId) {
                return socket.emit('ai response', {
                    text: "Error: No active chat session. Please start a new chat.",
                    time: new Date().toLocaleTimeString()
                });
            }

            // Find the chat session
            const chat = await AIChat.findOne({ username, chatId });
            if (!chat) {
                return socket.emit('ai response', {
                    text: "Error: Chat session not found.",
                    time: new Date().toLocaleTimeString()
                });
            }

            // Format history for Gemini API
            const history = toGeminiHistory(chat.messages);

            // Save user message to DB
            chat.messages.push({
                role: 'user',
                text: text || '',
                image: image ? { data: image.data, mimeType: image.mimeType } : undefined,
                time: new Date().toLocaleTimeString()
            });

            // Get AI response
            const aiText = await getAiResponse(text, history, image);

            // Save AI response to DB
            chat.messages.push({
                role: 'model',
                text: aiText,
                time: new Date().toLocaleTimeString()
            });

            // Update title if it's the first message
            if (chat.messages.length <= 2 && text) {
                chat.title = text.substring(0, 30) + (text.length > 30 ? '...' : '');
            }

            await chat.save();

            socket.emit('ai response', {
                text: aiText,
                time: new Date().toLocaleTimeString(),
                chatId: chatId
            });
        } catch (e) {
            console.error('AI Chat Error:', e);
            socket.emit('ai response', {
                text: "Sorry, I encountered an error processing your request.",
                time: new Date().toLocaleTimeString()
            });
        }
    });
};
