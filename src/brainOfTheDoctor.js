// Brain of the doctor - Image analysis functionality
import fs from 'fs';
import { Groq } from 'groq-sdk';

// Function to encode image to base64
function encodeImage(imagePath) {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  } catch (error) {
    console.error('Error encoding image:', error);
    throw error;
  }
}

// Function to analyze image with LLM query
async function analyzeImageWithQuery(query, model, encodedImage) {
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    let messages;
    
    // Different format for Claude models
    if (model.includes('claude')) {
      messages = [
        {
          role: "user",
          content: `${query}\n\n<image>\ndata:image/jpeg;base64,${encodedImage}\n</image>`
        }
      ];
    } else {
      // Format for other models like Llama
      messages = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: query
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${encodedImage}`,
              },
            },
          ],
        }
      ];
    }
    
    console.log(`Sending request to Groq API with model: ${model}`);
    const chatCompletion = await client.chat.completions.create({
      messages: messages,
      model: model
    });

    return chatCompletion.choices[0].message.content;
  } catch (error) {
    console.error('Error analyzing image:', error);
    
    // Check for model not found error
    if (error.error && error.error.error && error.error.error.code === 'model_not_found') {
      console.error(`Model not found: ${model}`);
      throw new Error('model_not_found');
    } 
    // Check for other specific API errors
    else if (error.status >= 400) {
      console.error(`API error: ${error.status}`);
      throw new Error('api_error');
    }
    // For unknown errors, return a generic message
    else {
      return "I couldn't analyze the image properly. Please make sure it's a clear image and try again.";
    }
  }
}

export { encodeImage, analyzeImageWithQuery };
