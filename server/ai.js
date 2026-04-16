const axios = require('axios');
require('dotenv').config();

/**
 * Calls the AI API with the provided user input.
 * @param {string} userInput - The message from the user.
 * @returns {Promise<string>} - The AI's response text.
 */
async function getAiResponse(userInput) {
    try {
        const response = await axios.post('https://api.openai.com/v1/responses', {
            model: "gpt-5-nano",
            input: `Please respond in English: ${userInput}`,
            store: true
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });

        // The response format for this specific (non-standard) endpoint is likely 
        // response.data.output or response.data.choices[0].message.content
        // Based on "input" and "model: gpt-5-nano", it might be a new/preview API.
        // If it's standard OpenAI chat completion, it would be choices[0].message.content.
        // If it's a newer "responses" endpoint, we'll try to extract the text.
        
        // console.log('AI Response:', JSON.stringify(response.data));
        
        // Handle the specific JSON structure provided by the user
        if (response.data.output && Array.isArray(response.data.output)) {
            for (const outputItem of response.data.output) {
                if (outputItem.type === 'message' && outputItem.content && Array.isArray(outputItem.content)) {
                    for (const contentItem of outputItem.content) {
                        if (contentItem.type === 'output_text' && contentItem.text) {
                            return contentItem.text;
                        }
                    }
                }
            }
        }

        // Fallback to other common places
        if (response.data.output && typeof response.data.output === 'string') {
            return response.data.output;
        } else if (response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
            return response.data.choices[0].message.content;
        } else if (response.data.response) {
            return response.data.response;
        }
        
        return "I'm sorry, I couldn't process that request.";
    } catch (error) {
        console.error('AI API Error:', error.response ? JSON.stringify(error.response.data) : error.message);
        
        if (error.response && error.response.status === 401) {
            return "Error: Invalid API Key. Please check your .env file.";
        } else if (error.response && error.response.status === 404) {
            return `Error: The model 'gpt-5-nano' or endpoint was not found. Please verify the API details.`;
        }
        
        return "Sorry, I'm having trouble connecting to my brain right now.";
    }
}

module.exports = { getAiResponse };
