// Client-side JavaScript for AI Doctor application
document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const startRecordingButton = document.getElementById('startRecording');
    const stopRecordingButton = document.getElementById('stopRecording');
    const recordingStatus = document.getElementById('recordingStatus');
    const audioPlayer = document.getElementById('audioPlayer');
    const imageInput = document.getElementById('imageInput');
    const imagePreview = document.getElementById('imagePreview');
    const uploadArea = document.getElementById('uploadArea');
    const submitButton = document.getElementById('submitButton');
    const speechToTextOutput = document.getElementById('speechToTextOutput');
    const doctorResponse = document.getElementById('doctorResponse');
    const voiceResponse = document.getElementById('voiceResponse');
    
    // Socket.io connection
    const socket = io();
    
    // MediaRecorder variables
    let mediaRecorder;
    let audioChunks = [];
    let recordedBlob;
    let imageFile = null;
    
    // Setup drag and drop for image upload
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });
    
    function highlight() {
        uploadArea.classList.add('highlight');
    }
    
    function unhighlight() {
        uploadArea.classList.remove('highlight');
    }
    
    uploadArea.addEventListener('drop', handleDrop, false);
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0 && files[0].type.match('image.*')) {
            handleImageFile(files[0]);
        }
    }
    
    // Event listeners
    startRecordingButton.addEventListener('click', startRecording);
    stopRecordingButton.addEventListener('click', stopRecording);
    imageInput.addEventListener('change', () => {
        if (imageInput.files.length > 0) {
            handleImageFile(imageInput.files[0]);
        }
    });
    submitButton.addEventListener('click', submitData);
    
    // Start audio recording
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                recordedBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                const audioURL = URL.createObjectURL(recordedBlob);
                audioPlayer.src = audioURL;
                audioPlayer.style.display = 'block';
                
                // Enable submit button if both audio and image are available
                updateSubmitButton();
            };
            
            mediaRecorder.start();
            audioChunks = [];
            
            // Update UI
            startRecordingButton.disabled = true;
            stopRecordingButton.disabled = false;
            recordingStatus.textContent = 'Recording in progress...';
            
        } catch (error) {
            console.error('Error starting recording:', error);
            recordingStatus.textContent = 'Error: Could not start recording. Check microphone permissions.';
        }
    }
    
    // Stop audio recording
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            
            // Stop all audio tracks
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            
            // Update UI
            startRecordingButton.disabled = false;
            stopRecordingButton.disabled = true;
            recordingStatus.textContent = 'Recording stopped. Ready to analyze.';
        }
    }
    
    // Handle image file selection
    function handleImageFile(file) {
        if (file.type.match('image.*')) {
            imageFile = file;
            
            // Display image preview
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                imagePreview.innerHTML = '';
                imagePreview.appendChild(img);
                img.style.display = 'block';
            };
            reader.readAsDataURL(file);
            
            // Enable submit button if both audio and image are available
            updateSubmitButton();
        }
    }
    
    // Update submit button state
    function updateSubmitButton() {
        submitButton.disabled = !recordedBlob;
    }
    
    // Submit data to server
    function submitData() {
        if (!recordedBlob) {
            alert('Please record your voice first.');
            return;
        }
        
        // Show loading state
        submitButton.disabled = true;
        submitButton.textContent = 'Processing...';
        
        // Prepare form data
        const formData = new FormData();
        formData.append('audio', recordedBlob, 'recording.mp3');
        
        if (imageFile) {
            formData.append('image', imageFile, imageFile.name);
        }
        
        // Clear previous results
        speechToTextOutput.innerHTML = '<p>Processing your speech...</p>';
        doctorResponse.innerHTML = '<p>Generating doctor\'s response...</p>';
        voiceResponse.style.display = 'none';
        
        // Send data to server
        fetch('/process', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Server error: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            // Display results
            speechToTextOutput.innerHTML = `<p>${data.speechToText}</p>`;
            doctorResponse.innerHTML = `<p>${data.doctorResponse}</p>`;
            
            // Play audio response if available
            if (data.audioResponse) {
                // Create a new audio element each time to avoid cache issues
                const audioElement = document.createElement('audio');
                audioElement.controls = true;
                
                // Add error handling
                audioElement.onerror = (e) => {
                    console.error('Error loading audio:', e);
                    const errorMsg = document.createElement('p');
                    errorMsg.className = 'error';
                    errorMsg.textContent = 'Audio response could not be loaded. Using browser speech synthesis instead.';
                    voiceResponse.innerHTML = '';
                    voiceResponse.appendChild(errorMsg);
                    
                    // Use browser's speech synthesis as fallback
                    if (window.speechSynthesis) {
                        const utterance = new SpeechSynthesisUtterance(data.doctorResponse);
                        window.speechSynthesis.speak(utterance);
                    }
                };
                
                // Set up the audio source with timestamp to avoid caching
                const timestamp = new Date().getTime();
                audioElement.src = `${data.audioResponse}?t=${timestamp}`;
                
                // Replace existing audio player
                voiceResponse.innerHTML = '';
                voiceResponse.appendChild(audioElement);
                
                // Try to play automatically
                audioElement.style.display = 'block';
                const playPromise = audioElement.play();
                
                if (playPromise !== undefined) {
                    playPromise.catch(error => {
                        console.log('Auto-play prevented:', error);
                        // Show controls so user can play manually
                        audioElement.controls = true;
                    });
                }
            } else {
                // Handle case when audio response is not available
                const errorMsg = document.createElement('p');
                errorMsg.textContent = data.error || 'Audio response not available. Using browser speech synthesis instead.';
                voiceResponse.innerHTML = '';
                voiceResponse.appendChild(errorMsg);
                
                // Use browser's built-in speech synthesis as fallback
                if (window.speechSynthesis) {
                    const utterance = new SpeechSynthesisUtterance(data.doctorResponse);
                    window.speechSynthesis.speak(utterance);
                }
            }
            
            // Reset UI
            submitButton.disabled = false;
            submitButton.textContent = 'Analyze';
        })
        .catch(error => {
            console.error('Error:', error);
            
            // Show error messages
            speechToTextOutput.innerHTML = '<p class="error">Error processing your request.</p>';
            doctorResponse.innerHTML = '<p class="error">Error: ' + error.message + '</p>';
            
            // Reset UI
            submitButton.disabled = false;
            submitButton.textContent = 'Analyze';
        });
    }
});
