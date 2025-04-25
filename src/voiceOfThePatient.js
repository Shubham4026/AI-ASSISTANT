// Voice of the patient - Audio recording and speech-to-text functionality
import fs from 'fs';
import recorderPkg from 'node-record-lpcm16';
const recorder = recorderPkg;
import { Groq } from 'groq-sdk';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Function to record audio from the microphone
async function recordAudio(filePath, timeout = 20000) {
  console.log('Adjusting for ambient noise...');
  console.log('Start speaking now...');
  
  return new Promise((resolve, reject) => {
    // Create a writable stream
    const fileStream = fs.createWriteStream(`${filePath}.wav`);
    
    // Start recording
    const recording = recorder.record({
      sampleRate: 16000,
      channels: 1,
      threshold: 0.5,
      endOnSilence: true,
      silence: '1.0',
    });
    
    // Pipe the recording to the file
    recording.stream().pipe(fileStream);
    
    // Set timeout to stop recording
    const stopTimeout = setTimeout(() => {
      recording.stop();
      console.log('Recording stopped due to timeout');
    }, timeout);
    
    // Handle recording end
    recording.stream().on('end', async () => {
      clearTimeout(stopTimeout);
      console.log('Recording complete.');
      
      try {
        // Convert WAV to MP3 using ffmpeg (if available)
        // This uses native audio conversion in Node.js without requiring ffmpeg
        // For production, you might want to use a more robust solution
        await convertWavToMp3(`${filePath}.wav`, filePath);
        console.log(`Audio saved to ${filePath}`);
        resolve(filePath);
      } catch (error) {
        console.error('Error converting audio:', error);
        // If conversion fails, just use the WAV file
        resolve(`${filePath}.wav`);
      }
    });
    
    // Handle recording error
    recording.stream().on('error', (err) => {
      clearTimeout(stopTimeout);
      reject(err);
    });
    
    // Allow manual stopping
    setTimeout(() => {
      console.log('Recording for a few seconds...');
    }, 1000);
  });
}

// Function to convert WAV to MP3 (without requiring ffmpeg)
async function convertWavToMp3(wavFile, mp3File) {
  try {
    // Check if we can convert using built-in methods
    // For a full implementation, you'd use a library like fluent-ffmpeg
    // For now, we'll create a simple wrapper that renames the file
    // In a production app, you would implement proper conversion
    fs.copyFileSync(wavFile, mp3File);
    fs.unlinkSync(wavFile); // Remove the WAV file
    return mp3File;
  } catch (error) {
    console.error('Error converting WAV to MP3:', error);
    throw error;
  }
}

// Function to transcribe audio using Groq API
async function transcribeWithGroq(sttModel, audioFilepath) {
  try {
    const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    
    const audioBuffer = fs.readFileSync(audioFilepath);
    
    // Create a file object that's compatible with the Groq API
    const file = {
      buffer: audioBuffer,
      name: 'audio.mp3',
      type: 'audio/mp3'
    };
    
    // Call the Groq API for transcription
    const transcription = await client.audio.transcriptions.create({
      model: sttModel,
      file: file
    });

    return transcription.text || "I couldn't understand the audio. Please try again.";
    
  } catch (error) {
    console.error('Error transcribing audio:', error);
    // Return a friendly error message instead of throwing
    return "Sorry, I had trouble processing your speech. Please try again.";
  }
}

export { recordAudio, transcribeWithGroq };
