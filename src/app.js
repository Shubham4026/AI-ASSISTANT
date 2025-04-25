// Main application file - Express server with API endpoints
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Groq } from 'groq-sdk';
import { encodeImage, analyzeImageWithQuery } from './brainOfTheDoctor.js';
import { transcribeWithGroq } from './voiceOfThePatient.js';
import { textToSpeechWithElevenlabs } from './voiceOfTheDoctor.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = process.env.PORT || 3000;

// Get current file directory (ESM equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up static file serving
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// System prompt for the AI doctor
const systemPrompt = `You have to act as a professional doctor, i know you are not but this is for learning purpose. 
What's in this image?. Do you find anything wrong with it medically? 
If you make a differential, suggest some remedies for them. Donot add any numbers or special characters in 
your response. Your response should be in one long paragraph. Also always answer as if you are answering to a real person.
Donot say 'In the image I see' but say 'With what I see, I think you have ....'
Dont respond as an AI model in markdown, your answer should mimic that of an actual doctor not an AI bot, 
Keep your answer concise (max 2 sentences). No preamble, start your answer right away please`;

// Process input endpoint
app.post('/process', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files;
    
    if (!files || !files.audio) {
      return res.status(400).json({ error: 'Audio file is required' });
    }
    
    const audioFile = files.audio[0];
    const imageFile = files.image ? files.image[0] : null;
    
    // Transcribe audio
    try {
      const speechToTextOutput = await transcribeWithGroq(
        "whisper-large-v3", 
        audioFile.path
      );
      console.log(speechToTextOutput);
      let doctorResponse;
      
      // Process image if available, otherwise just process the text query
      if (imageFile) {
        try {
          const encodedImage = encodeImage(imageFile.path);
          
          // First try with Claude model
          try {
            doctorResponse = await analyzeImageWithQuery(
              systemPrompt + speechToTextOutput, 
              "meta-llama/llama-4-scout-17b-16e-instruct", 
              encodedImage
            );
          } catch (modelError) {
            console.log("First model failed, trying fallback model...");
            // Fallback to Llama model if Claude fails
            doctorResponse = await analyzeImageWithQuery(
              systemPrompt + speechToTextOutput,
              "llama-3-70b-8192",
              encodedImage
            );
          }
        } catch (imgError) {
          console.error('Error analyzing image:', imgError);
          doctorResponse = "I had trouble analyzing your image. Could you please try with a clearer image?";
        }
      } else {
        // Handle audio-only input by using a text-only model for a more helpful response
        try {
          // Use a text-only model for audio-only queries
          const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
          
          const chatCompletion = await client.chat.completions.create({
            messages: [
              {
                role: "system",
                content: "You are a helpful AI assistant with medical knowledge. The user is asking a medical question but hasn't provided an image. Explain that you'd need an image to provide visual medical analysis, but still try to be helpful with the information provided."
              },
              {
                role: "user",
                content: speechToTextOutput
              }
            ],
            model: "claude-3-5-sonnet-20240620" // Text-only request should work fine
          });
          
          doctorResponse = chatCompletion.choices[0].message.content;
        } catch (textError) {
          console.error('Error generating text response:', textError);
          doctorResponse = `I heard your question: "${speechToTextOutput}". However, without an image to analyze, I can't provide specific medical analysis. If you have a medical concern, please add a relevant image for me to examine.`;
        }
      }
      
      // Generate audio response
      try {
        console.log("Generating audio response...");
        // Ensure the uploads directory exists
        const uploadsDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        const outputFilePath = path.join(uploadsDir, 'final.mp3');
        await textToSpeechWithElevenlabs(doctorResponse, outputFilePath);
        
        // Verify the file exists before returning response
        if (fs.existsSync(outputFilePath)) {
          console.log("Audio file generated successfully");
          
          // Return results with audio
          res.json({
            speechToText: speechToTextOutput,
            doctorResponse: doctorResponse,
            audioResponse: '/audio/final.mp3' // Path to be used by client to access the audio
          });
        } else {
          console.error("Audio file was not created");
          throw new Error("Audio file was not created");
        }
      } catch (ttsError) {
        console.error('Error generating speech:', ttsError);
        // Still return text responses even if audio generation fails
        res.json({
          speechToText: speechToTextOutput,
          doctorResponse: doctorResponse,
          audioResponse: null,
          error: "Could not generate audio response"
        });
      }
    } catch (sttError) {
      console.error('Error transcribing speech:', sttError);
      res.status(500).json({ error: 'Error processing your speech. Please try again.' });
    }
    
  } catch (error) {
    console.error('Error processing inputs:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
});

// Serve audio files
app.get('/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, '../uploads', filename);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found' });
  }
  
  res.sendFile(filePath);
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// Start server
server.listen(port, () => {
  console.log(`AI Doctor server listening at http://localhost:${port}`);
});
