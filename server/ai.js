const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const SYSTEM_INSTRUCTION = `You are an advanced AI Chat Agent integrated into a real-time messaging application.
Your goals:
1. Be helpful, professional yet friendly, and witty when appropriate.
2. Provide concise and accurate answers.
3. If an image is provided, analyze it thoroughly and answer questions about it.
4. You can help with coding, general knowledge, and daily tasks.
5. Since you are in a chat app, keep your responses formatted for readability (use markdown).
6. Remember the context of the conversation from the history provided.`;

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const genAI = apiKey ? new GoogleGenAI({ apiKey }) : null;

function buildMessage(userInput, image) {
    const text = (userInput || '').trim();

    if (image && image.data) {
        const base64Data = image.data.replace(/^data:image\/\w+;base64,/, '');
        const parts = [
            {
                inlineData: {
                    data: base64Data,
                    mimeType: image.mimeType || 'image/jpeg'
                }
            }
        ];

        if (text) {
            parts.push({ text });
        } else {
            parts.push({ text: 'What is in this image?' });
        }

        return parts;
    }

    return text || 'Hello!';
}

async function getAiResponse(userInput, history = [], image = null, retryCount = 0) {
    try {
        if (!genAI) {
            throw new Error('Missing GEMINI_API_KEY or GOOGLE_API_KEY environment variable.');
        }

        const chat = genAI.chats.create({
            model: MODEL_NAME,
            history,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION
            }
        });

        const result = await chat.sendMessage({
            message: buildMessage(userInput, image)
        });

        return result.text || "I'm sorry, but I couldn't generate a response just now.";
    } catch (error) {
        const status = error.status || (error.message?.includes('503') ? 503 : error.message?.includes('429') ? 429 : null);

        if ((status === 503 || status === 429) && retryCount < 1) {
            console.log(`AI busy (${status}). Retrying in 2 seconds...`);
            await new Promise((res) => setTimeout(res, 2000));
            return getAiResponse(userInput, history, image, retryCount + 1);
        }

        console.error('AI API Error:', error.message);
        return "I'm having trouble processing that right now. Try again in a second!";
    }
}

module.exports = { getAiResponse };
