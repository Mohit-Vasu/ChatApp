const { getAiResponse } = require('../ai');

module.exports = (io, socket) => {
    socket.on('ai message', async (text) => {
        try {
            // Echo user message back to them (optional, client usually adds it immediately)
            // But we need to call AI and return response
            
            const aiText = await getAiResponse(text);
            
            socket.emit('ai response', {
                text: aiText,
                time: new Date().toLocaleTimeString()
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
