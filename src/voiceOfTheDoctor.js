// Voice of the doctor - Text-to-speech functionality
import fs from 'fs';
import playSound from 'play-sound';
const player = playSound;
import gttsPackage from 'gtts';
const gTTS = gttsPackage;
import pkg from 'elevenlabs-node';
const { ElevenLabs } = pkg;
import { exec } from 'child_process';
import os from 'os';

const audioPlayer = player({});

// Function to convert text to speech using Google TTS
function textToSpeechWithGtts(inputText, outputFilepath) {
  return new Promise((resolve, reject) => {
    try {
      const gtts = new gTTS(inputText, 'en');
      gtts.save(outputFilepath, (err) => {
        if (err) {
          console.error('Error saving audio file:', err);
          reject(err);
          return;
        }
        
        console.log(`Audio saved to ${outputFilepath}`);
        
        // Play the audio
        playAudio(outputFilepath)
          .then(() => resolve(outputFilepath))
          .catch(reject);
      });
    } catch (error) {
      console.error('Error generating speech:', error);
      reject(error);
    }
  });
}

// Function to convert text to speech using ElevenLabs
async function textToSpeechWithElevenlabs(inputText, outputFilepath) {
  try {
    console.log('Starting ElevenLabs text-to-speech conversion');
    
    // Check API key
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('ElevenLabs API key is missing');
      throw new Error('ElevenLabs API key is missing');
    }
    
    const voice = 'Aria';
    const model = 'eleven_turbo_v2';
    
    // Initialize ElevenLabs client
    console.log('Initializing ElevenLabs client');
    const elevenlabs = new ElevenLabs({
      apiKey: process.env.ELEVENLABS_API_KEY
    });
    
    // Truncate text if too long (ElevenLabs has limits)
    const maxTextLength = 5000;
    const truncatedText = inputText.length > maxTextLength 
      ? inputText.substring(0, maxTextLength) + '...'
      : inputText;
    
    // Generate audio
    console.log('Generating audio with ElevenLabs');
    const audioBuffer = await elevenlabs.generate({
      voice,
      text: truncatedText,
      model
    });
    
    // Check if audio buffer is valid
    if (!audioBuffer || audioBuffer.length === 0) {
      console.error('Received empty audio buffer from ElevenLabs');
      throw new Error('Empty audio buffer received');
    }
    
    // Create directory if doesn't exist
    const directory = outputFilepath.substring(0, outputFilepath.lastIndexOf('/'));
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }
    
    // Save audio to file
    console.log(`Writing audio buffer (${audioBuffer.length} bytes) to ${outputFilepath}`);
    fs.writeFileSync(outputFilepath, audioBuffer);
    console.log(`Audio saved to ${outputFilepath}`);
    
    // Skip playing audio on server - let client play it
    // await playAudio(outputFilepath);
    
    return outputFilepath;
  } catch (error) {
    console.error('Error generating speech with ElevenLabs:', error);
    
    // Try fallback to Google TTS
    try {
      console.log('Falling back to Google TTS');
      return await textToSpeechWithGtts(inputText, outputFilepath);
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      throw new Error('Text-to-speech generation failed with all available services');
    }
  }
}

// Function to play audio file based on OS
async function playAudio(filepath) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    
    try {
      if (platform === 'darwin') {  // macOS
        exec(`afplay "${filepath}"`, (error) => {
          if (error) {
            console.error(`Error playing audio: ${error}`);
            reject(error);
          } else {
            resolve();
          }
        });
      } else if (platform === 'win32') {  // Windows
        exec(`powershell -c "(New-Object Media.SoundPlayer '${filepath}').PlaySync();"`, (error) => {
          if (error) {
            console.error(`Error playing audio: ${error}`);
            reject(error);
          } else {
            resolve();
          }
        });
      } else if (platform === 'linux') {  // Linux
        exec(`aplay "${filepath}"`, (error) => {
          if (error) {
            console.error(`Error playing audio: ${error}`);
            reject(error);
          } else {
            resolve();
          }
        });
      } else {
        // Use play-sound as fallback
        audioPlayer.play(filepath, (err) => {
          if (err) {
            console.error(`Error playing audio: ${err}`);
            reject(err);
          } else {
            resolve();
          }
        });
      }
    } catch (error) {
      console.error(`Error playing audio: ${error}`);
      reject(error);
    }
  });
}

export { textToSpeechWithGtts, textToSpeechWithElevenlabs };
