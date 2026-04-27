const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * @param {string} userInput - The message from the user
 * @param {Array} history - The chat history array (must be managed by your app state/DB)
 * @param {Object} image - Optional: { data: "base64...", mimeType: "image/jpeg" }
 * @param {number} retryCount - Internal counter for retries
 */
async function getAiResponse(userInput, history = [], image = null, retryCount = 0) {
    try {
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-flash-lite-preview", 
            systemInstruction: `You are an advanced AI Chat Agent integrated into a real-time messaging application. 
            Your goals:
            1. Be helpful, professional yet friendly, and witty when appropriate.
            2. Provide concise and accurate answers.
            3. If an image is provided, analyze it thoroughly and answer questions about it.
            4. You can help with coding, general knowledge, and daily tasks.
            5. Since you are in a chat app, keep your responses formatted for readability (use markdown).
            6. Remember the context of the conversation from the history provided.`
        });

        // Initialize chat session with existing history
        const chat = model.startChat({
            history: history,
        });

        let result;

        if (image && image.data) {
            // Remove the data URL prefix (e.g., "data:image/jpeg;base64,") if it exists
            const base64Data = image.data.replace(/^data:image\/\w+;base64,/, "");
            
            // For multimodal (Text + Image) in a chat session
            const messagePayload = [
                {
                    inlineData: {
                        data: base64Data,
                        mimeType: image.mimeType || "image/jpeg"
                    }
                },
                { text: userInput || "What is in this image?" }
            ];

            result = await chat.sendMessage(messagePayload);
        } else {
            // Standard text-only message
            result = await chat.sendMessage(userInput || "Hello!");
        }

        const response = await result.response;
        return response.text();

    } catch (error) {
        const status = error.status || (error.message?.includes('503') ? 503 : error.message?.includes('429') ? 429 : null);

        // Retry logic for busy server or rate limits
        if ((status === 503 || status === 429) && retryCount < 1) {
            console.log(`⚠️ AI Busy (${status}). Retrying in 2 seconds...`);
            await new Promise(res => setTimeout(res, 2000));
            return getAiResponse(userInput, history, image, retryCount + 1);
        }

        console.error('AI API Error:', error.message);
        return "I'm having trouble processing that right now. Try again in a second!";
    }
}

module.exports = { getAiResponse };