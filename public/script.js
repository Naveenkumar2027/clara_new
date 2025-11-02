/**
 * Clara AI Reception System - Client Script
 */

class Clara {
    constructor() {
        this.socket = io(window.location.origin, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 500,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
        this.conversationId = null;
        this.sessionId = null;
        this.speechRecognition = null;
        this.speechSynthesis = window.speechSynthesis;
        this.isListening = false;
        		this.isSpeechEnabled = true;
		this.isTextCleaningEnabled = true; // New property for text cleaning
		this.isTyping = false;
        this.isConversationStarted = false;
		this.availableVoices = [];
		this.pendingSpeakQueue = [];
		this.noSpeechRetries = 0;
		// Video call state
		this.peerConnection = null;
		this.localStream = null;
		this.remoteStream = null;
		this.currentCallId = null;
        
        this.initializeElements();
        this.initializeSpeechRecognition();
		this.initializeVoices();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.setWelcomeTime();
        this.setupKeyboardShortcuts();
        this.renderedQRCodes = new Set();
    }

    initializeElements() {
        // Chat elements
        this.chatMessages = document.getElementById('chatMessages');
        this.speechInputButton = document.getElementById('speechInputButton');
        this.micIcon = document.getElementById('micIcon');
        this.speechStatusDisplay = document.getElementById('speechStatusDisplay');
        this.speechToggle = document.getElementById('speechToggle');
        this.speechIcon = document.getElementById('speechIcon');
        this.speechStatus = document.getElementById('speechStatus');
        
        // Text cleaning controls
        this.textCleaningToggle = document.getElementById('textCleaningToggle');
        this.textCleaningIcon = document.getElementById('textCleaningIcon');
        this.textCleaningStatus = document.getElementById('textCleaningStatus');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        
        // Error handling
        this.errorModal = document.getElementById('errorModal');
        this.errorTitle = document.getElementById('errorTitle');
        this.errorMessage = document.getElementById('errorMessage');
        this.closeError = document.getElementById('closeError');
    }

    initializeSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.speechRecognition = new SpeechRecognition();
            
            // Improved configuration for better reliability
            this.speechRecognition.continuous = false; // Changed to false for better control
            this.speechRecognition.interimResults = false; // Changed to false to avoid partial results
            this.speechRecognition.lang = 'en-US';
            this.speechRecognition.maxAlternatives = 1;
            
            this.speechRecognition.onstart = () => {
                this.isListening = true;
                this.speechInputButton.classList.add('recording');
                this.micIcon.className = 'fas fa-stop';
                this.speechStatusDisplay.textContent = 'Listening... Speak now!';
                this.speechStatusDisplay.classList.add('listening');
                this.updateStatus('Listening...', 'listening');
            };
            
            this.speechRecognition.onresult = (event) => {
                if (event.results.length > 0) {
                    const transcript = event.results[0][0].transcript.trim();
                    if (transcript) {
                        this.speechStatusDisplay.textContent = `Heard: "${transcript}"`;
                        this.sendMessage(transcript);
                    }
                }
            };
            
            this.speechRecognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                
                switch (event.error) {
                    case 'no-speech':
                        this.speechStatusDisplay.textContent = "Didn't catch that. Please try again.";
                        this.speechStatusDisplay.classList.remove('listening');
                        if (this.noSpeechRetries < 2 && this.isConversationStarted) {
                            this.noSpeechRetries += 1;
                            setTimeout(() => {
                                try { 
                                    this.speechRecognition.start(); 
                                } catch (e) {
                                    console.error('Failed to restart speech recognition:', e);
                                    this.resetSpeechInput();
                                }
                            }, 1000);
                            return;
                        }
                        break;
                        
                    case 'audio-capture':
                        this.showError('No microphone input detected. Please check your microphone and ensure it\'s not being used by another application.');
                        break;
                        
                    case 'not-allowed':
                    case 'service-not-allowed':
                        this.showError('Microphone permission denied. Please allow microphone access in your browser settings and refresh the page.');
                        break;
                        
                    case 'network':
                        this.showError('Network error occurred. Please check your internet connection.');
                        break;
                        
                    case 'aborted':
                        // User manually stopped, no need to show error
                        break;
                        
                    default:
                        this.showError(`Speech recognition error: ${event.error}. Please try again.`);
                }
                
                this.resetSpeechInput();
            };
            
            this.speechRecognition.onend = () => {
                // Only reset if we're not trying to restart
                if (this.noSpeechRetries === 0) {
                    this.resetSpeechInput();
                }
            };
        } else {
            console.warn('Speech recognition not supported');
            this.speechInputButton.style.display = 'none';
            this.speechStatusDisplay.textContent = 'Speech recognition not supported in this browser';
            this.showError('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari for the best experience.');
        }
    }

    initializeVoices() {
        if (!this.speechSynthesis) return;

        const loadVoices = () => {
            const voices = this.speechSynthesis.getVoices() || [];
            if (voices.length > 0) {
                this.availableVoices = voices;
                
                // Set default English voice
                const defaultVoice = voices.find(v => /en(-|_)US/i.test(v.lang) && /Google|Natural|Premium|Enhanced/i.test(v.name))
                    || voices.find(v => /en(-|_)GB/i.test(v.lang) && /Google|Natural|Premium|Enhanced/i.test(v.name))
                    || voices.find(v => /en(-|_)US/i.test(v.lang))
                    || voices.find(v => /en(-|_)GB/i.test(v.lang))
                    || voices.find(v => /en/i.test(v.lang));
                
                if (defaultVoice) {
                    console.log('Default English voice set:', defaultVoice.name, defaultVoice.lang);
                }
                
                // Flush any pending speech once voices are available
                if (this.pendingSpeakQueue.length > 0) {
                    const queue = [...this.pendingSpeakQueue];
                    this.pendingSpeakQueue = [];
                    queue.forEach(text => this.speak(text));
                }
            }
        };

        // Attempt to load immediately (Chrome may already have voices)
        loadVoices();
        // Also listen for async population of voices
        if (typeof window !== 'undefined') {
            window.speechSynthesis.onvoiceschanged = () => loadVoices();
            
            // Ensure speech synthesis is properly initialized
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
        }
    }

    setupEventListeners() {
        // Speech input button
        this.speechInputButton.addEventListener('click', () => {
            if (!this.isConversationStarted) {
                this.startConversation();
                return;
            }
            
            if (this.isListening) {
                this.speechRecognition.stop();
            } else {
                this.startSpeechRecognition();
            }
        });

        // Speech toggle
        this.speechToggle.addEventListener('click', () => {
            this.toggleSpeech();
        });

        // Text cleaning toggle
        this.textCleaningToggle.addEventListener('click', () => {
            this.toggleTextCleaning();
        });

        // Error modal
        if (this.closeError) {
            this.closeError.addEventListener('click', () => {
                this.closeErrorModal();
            });
        }

        // Close error modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeErrorModal();
            }
        });
    }

    setupSocketListeners() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateStatus('Connected', 'ready');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateStatus('Disconnected', 'error');
        });

        // Conversation events
        this.socket.on('conversation-started', (data) => {
            console.log('Conversation started:', data);
            this.sessionId = data.sessionId;
            this.conversationId = data.callId;
            this.isConversationStarted = true;
            this.selectedStaffId = data.selectedStaffId || this.selectedStaffId;
            this.updateStatus('Ready to chat', 'ready');
            this.speechStatusDisplay.textContent = 'Click the microphone to speak';
            
            // Store user data for welcome message
            this.userData = data;
            
            // Add welcome message
            let welcome;
            if (data.purpose && data.purpose.trim() !== "Just wanted to chat and get some help") {
                welcome = `Hi ${data.name}! I'm Clara, your friendly AI receptionist! 😊 I see you mentioned: "${data.purpose}". I'd love to help you with that and anything else you need! What would you like to know?`;
            } else {
                welcome = `Hi ${data.name}! I'm Clara, your friendly AI receptionist! 😊 I'm so excited to help you today! What can I assist you with? Feel free to ask me anything - I'm here to help!`;
            }
			this.addMessage(welcome, 'bot');
			if (this.isSpeechEnabled) {
				this.speak(welcome);
			}
        });

        // Video call flow (targeted staff request)
        this.socket.on('initiate-video-call', (data) => {
            try {
                console.log('🎥 Initiating video call:', data);
                const payload = {
                    staffName: data.staffName,
                    staffEmail: data.staffEmail,
                    staffDepartment: data.staffDepartment,
                    clientName: (this.userData && this.userData.name) ? this.userData.name : 'Client',
                    clientSocketId: this.socket.id
                };
                this.socket.emit('video-call-request', payload);
                this.updateStatus('Connecting to staff...', 'processing');
                this.addMessage('Please wait while I establish the connection...', 'bot');
            } catch (error) {
                console.error('Error initiating video call:', error);
            }
        });

        // Fallback: if initiate-video-call missing staffEmail, derive from selected staff and re-send
        this.socket.on('initiate-video-call', (data) => {
            if (!data.staffEmail && this.selectedStaffId) {
                try {
                    const staffMap = {
                        'NN': 'nagashreen@gmail.com',
                        'LDN': 'lakshmidurgan@gmail.com',
                        'ACS': 'anithacs@gmail.com',
                        'GD': 'gdhivyasri@gmail.com',
                        'NSK': 'nishask@gmail.com',
                        'ABP': 'amarnathbpatil@gmail.com',
                        'JK': 'jyotikumari@gmail.com',
                        'VR': 'vidyashreer@gmail.com',
                        'BA': 'bhavanaa@gmail.com',
                        'BTN': 'bhavyatn@gmail.com'
                    };
                    const fallbackEmail = staffMap[this.selectedStaffId];
                    if (fallbackEmail) {
                        this.socket.emit('video-call-request', {
                            staffName: data.staffName || this.userData?.staffName || 'Staff',
                            staffEmail: fallbackEmail,
                            staffDepartment: data.staffDepartment || 'Computer Science Engineering',
                            clientName: (this.userData && this.userData.name) ? this.userData.name : 'Client',
                            clientSocketId: this.socket.id
                        });
                    }
                } catch (_) {}
            }
        });

        this.socket.on('video-call-request-sent', (data) => {
            console.log('Video call request sent:', data);
            this.updateStatus('Request sent. Waiting for staff...', 'processing');
        });

        this.socket.on('video-call-accepted', (data) => {
            console.log('Video call accepted:', data);
            this.updateStatus('Staff accepted. Starting call...', 'ready');
            this.addMessage(`Great news! ${data.staffName} accepted your video call.`, 'bot');
        });

        this.socket.on('video-call-rejected', (data) => {
            console.log('Video call rejected:', data);
            this.updateStatus('Staff unavailable', 'error');
            this.addMessage(data.message || 'The staff member is not available for a video call right now.', 'bot');
        });

         // Handle incoming video call requests
         this.socket.on('webrtc-call-request', (data) => {
             console.log('📞 Incoming video call request:', data);
             showCallLog(data);
         });

         // Handle video call response
         this.socket.on('webrtc-call-response', (data) => {
             console.log('📞 Video call response:', data);
             if (data.accepted) {
                 this.addMessage('Video call accepted! Starting call...', 'system');
                 showVideoCallDisplay(data);
             } else {
                 this.addMessage('Video call declined', 'system');
             }
         });

         // Handle video call ended
         this.socket.on('video-call-ended', (data) => {
             console.log('📞 Video call ended:', data);
             this.addMessage('Video call ended', 'system');
             const videoDisplay = document.getElementById('videoCallInterface');
             if (videoDisplay) {
                 videoDisplay.style.display = 'none';
             }
         });

         // Handle QR code generation for completed calls
         this.socket.on('call-completed-qr', async (data) => {
             try {
                 console.log('📱 Received QR code generation request:', data);
                 console.log('📱 QRCode library available:', typeof QRCode !== 'undefined');
                 await this.generateQRCode(data);
                 console.log('📱 QR code generation completed successfully');
             } catch (error) {
                 console.error('Error generating QR code:', error);
             }
         });

        // Show server-side conversation errors immediately
        this.socket.on('conversation-error', (data) => {
            const msg = (data && data.message) ? data.message : 'Failed to start conversation.';
            this.showError(msg);
            this.updateStatus('Error', 'error');
        });

        this.socket.on('ai-response', (data) => {
            this.hideTypingIndicator();
            this.addMessage(data.response, 'bot');
            
            if (this.isSpeechEnabled) {
                this.speak(data.response);
            }
            
            this.updateStatus('Ready', 'ready');
        });

        this.socket.on('call-accepted', (data) => {
            this.addMessage(`Your call has been accepted by ${data.staffName} from ${data.staffDepartment}. You will be connected shortly.`, 'system');
        });

        this.socket.on('call-completed', (data) => {
            const decision = data.decision === 'accepted' ? 'accepted' : 'declined';
            this.addMessage(`Your meeting request has been ${decision}. ${data.notes ? 'Notes: ' + data.notes : ''}`, 'system');
        });

         // Call started -> initialize WebRTC as caller
         this.socket.on('call-started', async (data) => {
             try {
                 this.currentCallId = data.callId;
                 await this.initializeWebRTCForClient();
                 await this.createOffer();
                 this.addMessage('Starting video call...', 'system');
             } catch (e) {
                 console.error('Failed to start video call:', e);
             }
         });

         // Handle incoming WebRTC offer
         this.socket.on('webrtc-offer', async (data) => {
             try {
                 console.log('📞 Received WebRTC offer:', data);
                 await this.handleOffer(data.offer, data.callId);
             } catch (e) {
                 console.error('Failed to handle offer:', e);
             }
         });

         // Handle incoming WebRTC answer
         this.socket.on('webrtc-answer', async (data) => {
             try {
                 console.log('📞 Received WebRTC answer:', data);
                 await this.handleAnswer(data.answer);
             } catch (e) {
                 console.error('Failed to handle answer:', e);
             }
         });

         // Handle incoming ICE candidate
         this.socket.on('ice-candidate', async (data) => {
             try {
                 console.log('📞 Received ICE candidate:', data);
                 await this.handleIceCandidate(data.candidate);
             } catch (e) {
                 console.error('Failed to handle ICE candidate:', e);
             }
         });

        // Receive answer from staff
        this.socket.on('answer', async (data) => {
            try {
                if (!this.peerConnection || data.callId !== this.currentCallId) return;
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch (e) {
                console.error('Failed to handle answer:', e);
            }
        });

        // Receive ICE candidate from staff
        this.socket.on('ice-candidate', async (data) => {
            try {
                if (!this.peerConnection || data.callId !== this.currentCallId) return;
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (e) {
                console.error('Failed to add ICE candidate:', e);
            }
        });

        // Error handling
        this.socket.on('error', (data) => {
            console.error('Socket error:', data);
            this.showError(data.message || 'An error occurred');
            this.updateStatus('Error', 'error');
        });
        
        // Connection error handling
        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            const msg = (error && (error.message || error.description)) || 'Failed to connect to server.';
            this.showError(msg + ' Retrying...');
            this.updateStatus('Reconnecting...', 'connecting');
        });

        this.socket.on('reconnect_attempt', (n) => {
            this.updateStatus('Reconnecting...', 'connecting');
        });

        this.socket.on('reconnect', () => {
            this.updateStatus('Connected', 'ready');
        });

        this.socket.on('reconnect_failed', () => {
            this.updateStatus('Connection Failed', 'error');
            this.showError('Unable to reconnect to server. Please refresh the page.');
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Spacebar to toggle speech input
            if (e.code === 'Space' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                if (!this.isConversationStarted) {
                    this.startConversation();
                    return;
                }
                
                if (this.speechRecognition) {
                    if (this.isListening) {
                        this.speechRecognition.stop();
                    } else {
                        this.startSpeechRecognition();
                    }
                }
            }
        });
    }

    startConversation() {
        // Show conversation start form
        this.showConversationForm();
    }

    showConversationForm() {
		const formHTML = `
            <div class="conversation-form-overlay">
                <div class="conversation-form">
                                         <h2>Let's Get Started! 😊</h2>
                     <p>Hi there! I'm Clara and I'm excited to chat with you! Just tell me your name and email, and optionally share what brings you here. I'll analyze everything from your voice or text to help you better!</p>
                    
                                         <form id="conversationForm">
                         <div class="form-group">
                             <label for="userName">Your Name</label>
 							<div style="display:flex; gap:8px; align-items:center;">
 								<input type="text" id="userName" name="name" required>
 								<button type="button" class="btn btn-secondary field-mic" data-field="userName" title="Speak your name">
 									<i class="fas fa-microphone"></i>
 								</button>
 							</div>
                         </div>
                         
                         <div class="form-group">
                             <label for="userEmail">Email Address</label>
 							<div style="display:flex; gap:8px; align-items:center;">
 								<input type="email" id="userEmail" name="email" required>
 								<button type="button" class="btn btn-secondary field-mic" data-field="userEmail" title="Speak your email">
 									<i class="fas fa-microphone"></i>
 								</button>
 							</div>
                         </div>
                         
                         <div class="form-group">
                             <label for="purpose">Tell me about your visit (optional)</label>
 							<div style="display:flex; gap:8px; align-items:center;">
 								<textarea id="purpose" name="purpose" placeholder="You can tell me anything - I'll analyze it from your voice or text! Or just say 'hello' to start chatting." rows="3"></textarea>
 								<button type="button" class="btn btn-secondary field-mic" data-field="purpose" title="Speak about your visit">
 									<i class="fas fa-microphone"></i>
 								</button>
 							</div>
                         </div>
                         
                         <div class="form-group">
                             <label for="staffSelect">Select Staff Member <span id="staffStatus" style="color: #666; font-size: 12px;">(Loading...)</span></label>
                             <select id="staffSelect" name="selectedStaffId" required>
                                 <option value="">Loading staff members...</option>
                             </select>
                         </div>
                         
                         <div class="form-actions">
                             <button type="submit" class="btn btn-primary">
                                 <i class="fas fa-play"></i>
                                 Start Conversation
                             </button>
                         </div>
                     </form>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', formHTML);
        
        const form = document.getElementById('conversationForm');
        form.addEventListener('submit', (e) => this.handleConversationSubmit(e));
        
        // Load available staff with a small delay to ensure DOM is ready
        setTimeout(() => {
            this.loadAvailableStaff().then(() => {
                console.log('✅ Staff loading completed');
            }).catch(error => {
                console.error('❌ Staff loading failed:', error);
            });
        }, 100);
		
		// Voice dictation buttons for form fields
		const fieldMics = document.querySelectorAll('.field-mic');
		fieldMics.forEach(btn => {
			btn.addEventListener('click', () => {
				const fieldId = btn.getAttribute('data-field');
				this.dictateToField(fieldId, fieldId === 'userEmail' ? 'email' : 'text', btn);
			});
		});
    }

	// Load available staff members
	async loadAvailableStaff() {
		try {
			console.log('🔄 Loading available staff...');
			let staff = [];
			let response;
			try {
				response = await fetch('/api/staff/available');
				if (response.ok) {
					staff = await response.json();
				}
			} catch (_) {}

			// Always include static staff directory if connected list is empty OR to allow selecting staff before they log in
			if (!Array.isArray(staff) || staff.length === 0) {
				console.log('ℹ️ No connected staff. Falling back to static staff list');
				const res2 = await fetch('/api/staff/list');
				if (res2.ok) {
					staff = await res2.json();
				}
			}
			// If some are connected, enrich by appending static entries that are not present yet
			else {
				try {
					const res2 = await fetch('/api/staff/list');
					if (res2.ok) {
						const staticList = await res2.json();
						const existingIds = new Set(staff.map(s => s._id || s.id));
						staticList.forEach(s => { if (!existingIds.has(s._id)) staff.push(s); });
					}
				} catch (_) {}
			}
			console.log('📋 Staff data received:', staff);
			
			const staffSelect = document.getElementById('staffSelect');
			if (staffSelect && staff.length > 0) {
				const options = '<option value="">Select a staff member...</option>' +
					staff.map(member => `<option value="${member._id || member.id}">${member.name} (${member.department || 'General'})</option>`).join('');
				staffSelect.innerHTML = options;
				
				// Update status
				const staffStatus = document.getElementById('staffStatus');
				if (staffStatus) {
					staffStatus.textContent = `(${staff.length} staff members available)`;
					staffStatus.style.color = '#10b981';
				}
				
				console.log('✅ Staff dropdown populated with', staff.length, 'options');
			} else {
				staffSelect.innerHTML = '<option value="">No staff members available</option>';
				
				// Update status
				const staffStatus = document.getElementById('staffStatus');
				if (staffStatus) {
					staffStatus.textContent = '(No staff available)';
					staffStatus.style.color = '#ef4444';
				}
				
				console.log('⚠️ No staff members available');
			}
		} catch (error) {
			console.error('❌ Error loading staff:', error);
			const staffSelect = document.getElementById('staffSelect');
			if (staffSelect) {
				staffSelect.innerHTML = '<option value="">Failed to load staff - please refresh</option>';
			}
			
			// Update status
			const staffStatus = document.getElementById('staffStatus');
			if (staffStatus) {
				staffStatus.textContent = '(Failed to load)';
				staffStatus.style.color = '#ef4444';
			}
			
			// Show error to user
			this.showError('Failed to load staff members. Please refresh the page and try again.');
		}
	}

	// Dictate to a specific form field using a temporary SpeechRecognition instance
	dictateToField(fieldId, fieldType = 'text', buttonEl) {
		if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
			this.showError('Speech recognition is not supported in your browser.');
			return;
		}
		const target = document.getElementById(fieldId);
		if (!target) return;
		const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
		const rec = new SpeechRecognition();
		rec.continuous = false;
		rec.interimResults = false;
		rec.lang = 'en-US';
		rec.onstart = () => { if (buttonEl) buttonEl.classList.add('recording'); };
		rec.onend = () => { if (buttonEl) buttonEl.classList.remove('recording'); };
		rec.onerror = () => { if (buttonEl) buttonEl.classList.remove('recording'); };
		rec.onresult = (event) => {
			let transcript = (event.results[0][0].transcript || '').trim();
			if (!transcript) return;
			if (fieldType === 'email') {
				// Basic normalization for spoken emails
				transcript = transcript
					.replace(/ at /gi, '@')
					.replace(/ dot /gi, '.')
					.replace(/ underscore /gi, '_')
					.replace(/ dash /gi, '-')
					.replace(/\s+/g, '')
					.toLowerCase();
				target.value = transcript;
			} else if (fieldType === 'select') {
				const select = target;
				let matched = null;
				const spoken = transcript.toLowerCase();
				Array.from(select.options).forEach(opt => {
					const label = String(opt.textContent || opt.value || '').toLowerCase();
					if (!matched && (label === spoken || label.includes(spoken) || spoken.includes(label))) {
						matched = opt.value;
					}
				});
				if (matched) {
					select.value = matched;
				} else {
					this.showError(`Could not match purpose: "${transcript}". Please select from the list.`);
				}
			} else {
				target.value = transcript;
			}
		};
		try { rec.start(); } catch (e) {}
	}

    handleConversationSubmit(e) {
        e.preventDefault();
        
        // Check if staff is loaded
        const staffSelect = document.getElementById('staffSelect');
        if (!staffSelect || staffSelect.options.length <= 1) {
            console.error('❌ Staff not loaded yet!');
            this.showError('Staff members are still loading. Please wait a moment and try again.');
            return;
        }
        
        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name'),
            email: formData.get('email'),
            purpose: formData.get('purpose'),
            selectedStaffId: formData.get('selectedStaffId')
        };
        
        console.log('📝 Form data collected:', data);
        
        // Validate form data
        if (!data.name || !data.email) {
            this.showError('Please provide your name and email');
            return;
        }
        
        if (!data.selectedStaffId) {
            console.error('❌ No staff member selected!');
            this.showError('Please select a staff member');
            return;
        }
        
        // If no purpose provided, set a default friendly message
        if (!data.purpose || data.purpose.trim() === '') {
            data.purpose = "Just wanted to chat and get some help";
        }
        
        // Remove the form
        const overlay = document.querySelector('.conversation-form-overlay');
        if (overlay) {
            overlay.remove();
        }
        
        // Update UI
        this.updateStatus('Starting conversation...', 'processing');
        this.speechStatusDisplay.textContent = 'Setting up your conversation...';
        
        // Start conversation with server
        try {
            this.socket.emit('start-conversation', data);
            console.log('Emitting start-conversation with data:', data);
            
            // Store selected staff information for video call requests
            this.selectedStaffId = data.selectedStaffId;
            this.userData = {
                name: data.name,
                email: data.email,
                purpose: data.purpose
            };
            
            // Removed automatic video call request triggering
            // Video calls will only be initiated when user explicitly requests them
            
            // Set a timeout for conversation start
            setTimeout(() => {
                if (!this.isConversationStarted) {
                    this.showError('Failed to start conversation. Please check your connection and try again.');
                    this.updateStatus('Error', 'error');
                }
            }, 10000); // 10 second timeout
            
        } catch (error) {
            console.error('Error starting conversation:', error);
            this.showError('Failed to start conversation. Please try again.');
            this.updateStatus('Error', 'error');
        }
    }

    startSpeechRecognition() {
        if (!this.speechRecognition) {
            this.showError('Speech recognition is not available in your browser.');
            return;
        }
        
        if (!this.isConversationStarted) {
            this.showError('Please start a conversation first.');
            return;
        }
        
        if (this.isListening) {
            try {
                this.speechRecognition.stop();
            } catch (e) {
                console.error('Failed to stop speech recognition:', e);
            }
            return;
        }
        
        // Reset retry counter
        this.noSpeechRetries = 0;
        
        try {
            this.speechRecognition.start();
        } catch (error) {
            console.error('Failed to start speech recognition:', error);
            this.showError('Failed to start speech recognition. Please try again.');
            this.resetSpeechInput();
        }
    }

    resetSpeechInput() {
        this.isListening = false;
        this.noSpeechRetries = 0; // Reset retry counter
        
        // Reset UI elements
        this.speechInputButton.classList.remove('recording');
        this.micIcon.className = 'fas fa-microphone';
        this.speechStatusDisplay.classList.remove('listening');
        
        // Update status text based on conversation state
        if (this.isConversationStarted) {
            this.speechStatusDisplay.textContent = 'Click the microphone to speak';
            this.updateStatus('Ready to chat', 'ready');
        } else {
            this.speechStatusDisplay.textContent = 'Click to start conversation';
            this.updateStatus('Ready', 'ready');
        }
    }

    sendMessage(message) {
        if (!message.trim() || !this.isConversationStarted) return;
        
        // Add user message to chat
        this.addMessage(message, 'user');
        
        // Show typing indicator
        this.showTypingIndicator();
        
        // Update status
        this.updateStatus('Processing...', 'processing');
        
        // Send message via Socket.IO
        this.socket.emit('chat-message', {
            sessionId: this.sessionId,
            message: message
        });
    }

    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.setAttribute('role', 'article');
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        
        const icon = document.createElement('i');
        if (sender === 'bot') {
            icon.className = 'fas fa-robot';
        } else if (sender === 'user') {
            icon.className = 'fas fa-user';
        } else if (sender === 'system') {
            icon.className = 'fas fa-info-circle';
        }
        avatar.appendChild(icon);
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.textContent = text;
        
        const time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = new Date().toLocaleTimeString();
        
        content.appendChild(messageText);
        content.appendChild(time);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        if (this.isTyping) return;
        
        this.isTyping = true;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot-message typing-message';
        typingDiv.setAttribute('role', 'article');
        typingDiv.id = 'typingIndicator';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        const icon = document.createElement('i');
        icon.className = 'fas fa-robot';
        avatar.appendChild(icon);
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'typing-indicator';
        typingIndicator.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        
        content.appendChild(typingIndicator);
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(content);
        
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.isTyping = false;
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    toggleSpeech() {
        this.isSpeechEnabled = !this.isSpeechEnabled;
        
        if (this.isSpeechEnabled) {
            this.speechIcon.className = 'fas fa-volume-up';
            this.speechStatus.textContent = 'Clara voice enabled';
            this.speechToggle.classList.remove('disabled');
        } else {
            this.speechIcon.className = 'fas fa-volume-mute';
            this.speechStatus.textContent = 'Clara voice disabled';
            this.speechToggle.classList.add('disabled');
        }
    }

    toggleTextCleaning() {
        this.isTextCleaningEnabled = !this.isTextCleaningEnabled;
        
        if (this.isTextCleaningEnabled) {
            this.textCleaningIcon.className = 'fas fa-magic';
            this.textCleaningStatus.textContent = 'Text cleaning enabled';
        } else {
            this.textCleaningIcon.className = 'fas fa-magic-slash';
            this.textCleaningStatus.textContent = 'Text cleaning disabled';
        }
    }

	speak(text) {
		if (!this.speechSynthesis || !this.isSpeechEnabled || !text) return;
		
		// Clean text for speech synthesis - remove emojis and special characters (if enabled)
		let cleanedText = text;
		if (this.isTextCleaningEnabled) {
			cleanedText = this.cleanTextForSpeech(text);
			console.log('Original text:', text);
			console.log('Cleaned text for speech:', cleanedText);
			
			// Show speech indicator if text was cleaned
			if (cleanedText !== text) {
				this.showSpeechIndicator(cleanedText);
			}
		}
		
		// Stop current speech for promptness
		try { 
			this.speechSynthesis.cancel(); 
		} catch (e) {
			console.warn('Failed to cancel speech synthesis:', e);
		}

		// Ensure speech synthesis is ready
		if (this.speechSynthesis.paused) {
			this.speechSynthesis.resume();
		}
		
		// Ensure we have voices; if not, queue until voiceschanged fires
		const voices = this.availableVoices && this.availableVoices.length > 0
			? this.availableVoices
			: (this.speechSynthesis.getVoices() || []);
			
		if (!voices || voices.length === 0) {
			this.pendingSpeakQueue.push(text);
			return;
		}

		const utterance = new SpeechSynthesisUtterance(cleanedText);
		
		// Improved voice settings for better quality
		utterance.rate = 0.9; // Slightly slower for clarity
		utterance.pitch = 1.0; // Natural pitch
		utterance.volume = 0.85; // Slightly lower volume
		utterance.lang = 'en-US';

		// Enhanced voice selection logic - Prioritize English voices
		const preferred = voices.find(v => /en(-|_)US/i.test(v.lang) && /Google|Natural|Premium|Enhanced/i.test(v.name))
			|| voices.find(v => /en(-|_)GB/i.test(v.lang) && /Google|Natural|Premium|Enhanced/i.test(v.name))
			|| voices.find(v => /en(-|_)US/i.test(v.lang) && v.localService)
			|| voices.find(v => /en(-|_)GB/i.test(v.lang) && v.localService)
			|| voices.find(v => /en(-|_)US/i.test(v.lang))
			|| voices.find(v => /en(-|_)GB/i.test(v.lang))
			|| voices.find(v => /en/i.test(v.lang))
			|| voices[0];
			
		if (preferred) {
			utterance.voice = preferred;
		}

		// Enhanced error handling for speech synthesis
		utterance.onerror = (event) => {
			console.error('Speech synthesis error:', event.error);
			
			// Handle specific error types
			switch (event.error) {
				case 'interrupted':
					console.log('Speech was interrupted, continuing...');
					// Don't clear queue for interrupted - just continue
					return;
				case 'canceled':
					console.log('Speech was canceled');
					break;
				case 'not-allowed':
					console.error('Speech synthesis not allowed by browser');
					this.showError('Speech synthesis is not allowed. Please check your browser settings.');
					break;
				case 'audio-busy':
					console.log('Audio system busy, retrying...');
					setTimeout(() => this.speak(text), 1000);
					return;
				case 'audio-hardware':
					console.error('Audio hardware error');
					this.showError('Audio hardware error. Please check your speakers/headphones.');
					break;
				case 'network':
					console.error('Network error in speech synthesis');
					break;
				case 'synthesis-not-supported':
					console.error('Speech synthesis not supported');
					this.showError('Speech synthesis is not supported in this browser.');
					break;
				case 'synthesis-failed':
					console.error('Speech synthesis failed');
					break;
				default:
					console.error('Unknown speech synthesis error:', event.error);
			}
			
			// Clear the queue and continue
			this.pendingSpeakQueue = [];
		};

		utterance.onend = () => {
			console.log('Speech synthesis completed successfully');
			// Process next item in queue if any
			if (this.pendingSpeakQueue.length > 0) {
				const nextText = this.pendingSpeakQueue.shift();
				setTimeout(() => this.speak(nextText), 100);
			}
		};
		
		utterance.onstart = () => {
			console.log('Speech synthesis started');
		};
		
		utterance.onpause = () => {
			console.log('Speech synthesis paused');
		};
		
		utterance.onresume = () => {
			console.log('Speech synthesis resumed');
		};

		try {
			this.speechSynthesis.speak(utterance);
		} catch (error) {
			console.error('Failed to start speech synthesis:', error);
			
			// Retry once after a short delay
			setTimeout(() => {
				try {
					console.log('Retrying speech synthesis...');
					this.speechSynthesis.speak(utterance);
				} catch (retryError) {
					console.error('Speech synthesis retry failed:', retryError);
					// Clear queue and continue without speech
					this.pendingSpeakQueue = [];
				}
			}, 500);
		}
	}

	/**
	 * Clean text for speech synthesis by removing emojis, special characters, and formatting
	 * @param {string} text - The original text to clean
	 * @returns {string} - Cleaned text suitable for speech synthesis
	 */
	cleanTextForSpeech(text) {
		if (!text || typeof text !== 'string') return '';
		
		let cleaned = text;
		
		// Remove emojis and special Unicode characters
		cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
		cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc symbols and pictographs
		cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport and map symbols
		cleaned = cleaned.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Regional indicator symbols
		cleaned = cleaned.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Supplemental symbols and pictographs
		cleaned = cleaned.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Symbols and pictographs extended-A
		cleaned = cleaned.replace(/[\u{2600}-\u{26FF}]/gu, '');   // Misc symbols
		cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');   // Dingbats
		
		// Remove markdown formatting
		cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1'); // Bold text
		cleaned = cleaned.replace(/\*(.*?)\*/g, '$1');     // Italic text
		cleaned = cleaned.replace(/`(.*?)`/g, '$1');       // Code blocks
		cleaned = cleaned.replace(/#{1,6}\s/g, '');        // Headers
		cleaned = cleaned.replace(/\n\s*\n/g, '. ');       // Double line breaks to periods
		
		// Remove HTML tags
		cleaned = cleaned.replace(/<[^>]*>/g, '');
		
		// Remove extra whitespace and normalize
		cleaned = cleaned.replace(/\s+/g, ' ').trim();
		
		// Remove common special characters that might cause speech issues
		cleaned = cleaned.replace(/[^\w\s.,!?;:()'-]/g, '');
		
		// Ensure proper sentence endings
		cleaned = cleaned.replace(/([.!?])\s*([a-z])/g, '$1 $2');
		
		// Remove multiple periods or exclamation marks
		cleaned = cleaned.replace(/[.!?]{2,}/g, '.');
		
		// Clean up spacing around punctuation
		cleaned = cleaned.replace(/\s+([.,!?;:])/g, '$1');
		cleaned = cleaned.replace(/([.,!?;:])\s+/g, '$1 ');
		
		// If text is empty after cleaning, provide a fallback
		if (!cleaned.trim()) {
			cleaned = 'No readable text available';
		}
		
		return cleaned;
	}

	/**
	 * Show a temporary indicator of what text is being spoken
	 * @param {string} cleanedText - The cleaned text being spoken
	 */
	showSpeechIndicator(cleanedText) {
		// Create a temporary speech indicator
		const indicator = document.createElement('div');
		indicator.className = 'speech-indicator';
		indicator.innerHTML = `
			<div class="speech-indicator-content">
				<i class="fas fa-volume-up"></i>
				<span>Speaking: "${cleanedText.substring(0, 100)}${cleanedText.length > 100 ? '...' : ''}"</span>
			</div>
		`;
		
		// Style the indicator
		indicator.style.cssText = `
			position: fixed;
			bottom: 20px;
			right: 20px;
			background: rgba(102, 126, 234, 0.9);
			color: white;
			padding: 10px 15px;
			border-radius: 25px;
			font-size: 14px;
			z-index: 1000;
			box-shadow: 0 4px 12px rgba(0,0,0,0.2);
			animation: slideIn 0.3s ease-out;
		`;
		
		// Add animation styles if not already present
		if (!document.getElementById('speech-indicator-styles')) {
			const styles = document.createElement('style');
			styles.id = 'speech-indicator-styles';
			styles.textContent = `
				@keyframes slideIn {
					from { transform: translateX(100%); opacity: 0; }
					to { transform: translateX(0); opacity: 1; }
				}
				@keyframes slideOut {
					from { transform: translateX(0); opacity: 1; }
					to { transform: translateX(100%); opacity: 0; }
				}
			`;
			document.head.appendChild(styles);
		}
		
		// Add to page
		document.body.appendChild(indicator);
		
		// Remove after 3 seconds
		setTimeout(() => {
			indicator.style.animation = 'slideOut 0.3s ease-in';
			setTimeout(() => {
				if (indicator.parentNode) {
					indicator.parentNode.removeChild(indicator);
				}
			}, 300);
		}, 3000);
	}

    // Initialize WebRTC and local media for the client (caller)
    async initializeWebRTCForClient() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const localVideo = document.getElementById('localVideo');
            if (localVideo) localVideo.srcObject = this.localStream;

            const configuration = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            };
            this.peerConnection = new RTCPeerConnection(configuration);

            this.localStream.getTracks().forEach(track => this.peerConnection.addTrack(track, this.localStream));

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.socket.emit('ice-candidate', {
                        candidate: event.candidate,
                        callId: this.currentCallId
                    });
                }
            };

            this.peerConnection.ontrack = (event) => {
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo && remoteVideo.srcObject !== event.streams[0]) {
                    remoteVideo.srcObject = event.streams[0];
                }
            };
        } catch (e) {
            console.error('Media init failed:', e);
        }
    }

    // Create SDP offer and send to server for forwarding
    async createOffer() {
        try {
            if (!this.peerConnection) return;
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            this.socket.emit('offer', { offer, callId: this.currentCallId });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    // Handle incoming SDP offer from staff
    async handleOffer(offer, callId) {
        try {
            if (!this.peerConnection) {
                await this.initializeWebRTCForClient();
            }
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            this.socket.emit('answer', { answer, callId: callId });
        } catch (e) {
            console.error('Answer creation failed:', e);
        }
    }

    // Handle incoming SDP answer from staff
    async handleAnswer(answer) {
        try {
            if (!this.peerConnection) return;
            await this.peerConnection.setRemoteDescription(answer);
        } catch (e) {
            console.error('Answer handling failed:', e);
        }
    }

    // Handle incoming ICE candidate
    async handleIceCandidate(candidate) {
        try {
            if (!this.peerConnection) return;
            await this.peerConnection.addIceCandidate(candidate);
        } catch (e) {
            console.error('ICE candidate handling failed:', e);
        }
    }

    updateStatus(text, status) {
        if (this.statusText) {
            this.statusText.textContent = text;
        }
        
        if (this.statusDot) {
            this.statusDot.className = `status-dot ${status}`;
        }
    }

    showError(message) {
        if (this.errorModal && this.errorMessage) {
            this.errorMessage.textContent = message;
            this.errorModal.style.display = 'flex';
        } else {
            alert(message);
        }
    }

    closeErrorModal() {
        if (this.errorModal) {
            this.errorModal.style.display = 'none';
        }
    }

    scrollToBottom() {
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    setWelcomeTime() {
        const welcomeTime = document.getElementById('welcomeTime');
        if (welcomeTime) {
            welcomeTime.textContent = new Date().toLocaleTimeString();
        }
    }

     // Trigger video call request automatically when staff is selected
     triggerVideoCallRequest(data) {
         try {
             console.log('🎥 Triggering automatic video call request for staff:', data.selectedStaffId);
             
             // Use the new direct endpoint for call requests
             fetch('/api/staff/call-request', {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json'
                 },
                 body: JSON.stringify({
                     staffId: data.selectedStaffId,
                     clientName: data.name,
                     purpose: data.purpose || 'Video consultation',
                     clientSocketId: this.socket.id
                 })
             })
             .then(response => response.json())
             .then(result => {
                 if (result.success) {
                     console.log('✅ Call request sent successfully:', result.message);
                     this.updateStatus('Call request sent', 'ready');
                     // Removed automatic call request message
                     // this.addMessage(`I've sent a video call request to the staff member. ${result.message}`, 'bot');
                 } else {
                     console.error('❌ Call request failed:', result.error);
                     this.addMessage('I encountered an error while sending the call request. Please try again.', 'bot');
                 }
             })
             .catch(error => {
                 console.error('❌ Error sending call request:', error);
                 this.addMessage('I encountered an error while sending the call request. Please try again.', 'bot');
             });
             
         } catch (error) {
             console.error('❌ Error triggering video call request:', error);
             this.addMessage('I encountered an error while requesting the video call. Please try again.', 'bot');
         }
     }

     // Generate QR code for appointment
     async generateQRCode(appointmentData) {
         try {
             console.log('📱 generateQRCode called with data:', appointmentData);
             console.log('📱 QRCode library available:', typeof QRCode !== 'undefined');
             
            // Ensure QRCode library is available (retry briefly if needed)
            await this.ensureQRCodeLib();
            if (typeof QRCode !== 'undefined') {
                 console.log('📱 Using QRCode library for visual QR code');
                 await this.generateQRCodeWithLibrary(appointmentData);
             } else {
                 console.log('📱 Using fallback text-based QR code method');
                 await this.generateQRCodeFallback(appointmentData);
             }
         } catch (error) {
             console.error('Error generating QR code:', error);
             // Fallback to text-based method
             await this.generateQRCodeFallback(appointmentData);
         }
     }

     async generateQRCodeWithLibrary(appointmentData) {
         try {
             console.log('📱 Generating QR code with Google Charts API:', appointmentData);

             const qrData = {
                 appointmentId: appointmentData.appointmentId || Date.now().toString(),
                 clientName: appointmentData.clientName || 'Client',
                 staffName: appointmentData.staffName || 'Staff Member',
                 staffEmail: appointmentData.staffEmail || 'staff@example.com',
                 purpose: appointmentData.purpose || 'Consultation',
                 date: new Date().toLocaleDateString(),
                 time: new Date().toLocaleTimeString(),
                 status: 'confirmed',
                 location: 'College Campus',
                 department: 'Computer Science Engineering',
                 contact: appointmentData.staffEmail || 'staff@example.com'
             };

            // Store appointment data on server for QR code lookup
            await this.storeAppointmentData(qrData);
            
            // Create QR code data with URL to appointment details page
            const baseUrl = await this.getPublicUrl();
            // Use shorter URL format for better mobile compatibility
            const appointmentId = qrData.appointmentId;
            const dataB64 = btoa(unescape(encodeURIComponent(JSON.stringify(qrData))));
            const appointmentDetailsUrl = `https://clarastokes.vercel.app/appointment-frontend/?id=${appointmentId}&api=${encodeURIComponent(baseUrl)}&data=${encodeURIComponent(dataB64)}`;
            const qrCodeString = appointmentDetailsUrl;
            console.log('📱 QR code URL:', qrCodeString);
             
             // Create appointment confirmation message with QR code container
             const qrMessage = document.createElement('div');
             qrMessage.className = 'message bot-message';
             qrMessage.innerHTML = `
                 <div class="message-content">
                     <div class="message-header">
                         <div class="message-avatar">
                             <i class="fas fa-robot"></i>
                         </div>
                         <div class="message-info">
                             <span class="message-sender">Clara</span>
                             <span class="message-time">${new Date().toLocaleTimeString()}</span>
                         </div>
                     </div>
                     <div class="message-text">
                         <h3 style="margin-bottom: 15px; color: #2d3748;">🎉 Appointment Confirmed!</h3>
                         <div style="margin-bottom: 15px;">
                             <p><strong>Appointment ID:</strong> ${qrData.appointmentId}</p>
                             <p><strong>Client:</strong> ${qrData.clientName}</p>
                             <p><strong>Staff:</strong> ${qrData.staffName}</p>
                             <p><strong>Department:</strong> ${qrData.department}</p>
                             <p><strong>Purpose:</strong> ${qrData.purpose}</p>
                             <p><strong>Date:</strong> ${qrData.date}</p>
                             <p><strong>Time:</strong> ${qrData.time}</p>
                             <p><strong>Location:</strong> ${qrData.location}</p>
                             <p><strong>Status:</strong> <span style="color: #38a169; font-weight: bold;">${qrData.status}</span></p>
                             <p><strong>Contact:</strong> ${qrData.contact}</p>
                         </div>
                         <div style="text-align: center; margin-bottom: 15px; padding: 20px; background: #f7fafc; border: 2px dashed #cbd5e0; border-radius: 8px;">
                             <p style="font-size: 14px; color: #718096; margin-bottom: 10px;">📱 Appointment QR Code Data:</p>
                             <div id="qr-code-container-${qrData.appointmentId}" style="background: white; padding: 15px; border-radius: 4px; min-height: 200px; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0;">
                                 <div id="qr-code-loading-${qrData.appointmentId}" style="text-align: center; color: #64748b;">
                                     <div style="margin-bottom: 10px;">🔄 Generating QR Code...</div>
                                     <div style="font-size: 12px;">Please wait</div>
                                 </div>
                             </div>
                             <p style="font-size: 12px; color: #64748b; margin-top: 10px;">📋 Scan this QR code to access appointment details</p>
                         </div>
                         <p style="font-size: 12px; color: #64748b; text-align: center;">📱 Show this QR code to ${qrData.staffName} when you arrive</p>
                         <p style="font-size: 12px; color: #64748b; text-align: center;">📅 QR code contains all appointment information</p>
                     </div>
                 </div>
             `;

             // Add to chat messages
             this.chatMessages.appendChild(qrMessage);
             this.scrollToBottom();
             
             // Generate QR code using Google Charts API
             await this.generateGoogleChartsQRCode(qrCodeString, qrData.appointmentId);
             
             console.log('📱 QR code message added to chat successfully');

         } catch (error) {
             console.error('Error generating QR code with Google Charts:', error);
             // Fallback to text-based method
             await this.generateQRCodeFallback(appointmentData);
         }
     }

    async generateQRCodeFallback(appointmentData) {
        try {
            console.log('📱 Generating QR code with Google Charts API:', appointmentData);
            
            const qrData = {
                appointmentId: appointmentData.appointmentId || Date.now().toString(),
                clientName: appointmentData.clientName || 'Client',
                staffName: appointmentData.staffName || 'Staff Member',
                staffEmail: appointmentData.staffEmail || 'staff@example.com',
                purpose: appointmentData.purpose || 'Consultation',
                date: new Date().toLocaleDateString(),
                time: new Date().toLocaleTimeString(),
                status: 'confirmed',
                location: 'College Campus',
                department: 'Computer Science Engineering',
                contact: appointmentData.staffEmail || 'staff@example.com'
            };

            // Store appointment data on server for QR code lookup
            await this.storeAppointmentData(qrData);
            
            // Create QR code data with URL to appointment details page
            const baseUrl = await this.getPublicUrl();
            // Use shorter URL format for better mobile compatibility
            const appointmentId = qrData.appointmentId;
            const dataB64 = btoa(unescape(encodeURIComponent(JSON.stringify(qrData))));
            const appointmentDetailsUrl = `https://clarastokes.vercel.app/appointment-frontend/?id=${appointmentId}&api=${encodeURIComponent(baseUrl)}&data=${encodeURIComponent(dataB64)}`;
            const qrCodeString = appointmentDetailsUrl;
            console.log('📱 QR code URL:', qrCodeString);
            
            // Create appointment confirmation message with QR code container
            const qrMessage = document.createElement('div');
            qrMessage.className = 'message bot-message';
            qrMessage.innerHTML = `
                <div class="message-header">
                    <div class="message-avatar">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="message-info">
                        <span class="message-sender">Clara</span>
                        <span class="message-time">${new Date().toLocaleTimeString()}</span>
                    </div>
                </div>
                <div class="message-text">
                    <h3 style="margin-bottom: 15px; color: #2d3748;">🎉 Appointment Confirmed!</h3>
                    <div style="margin-bottom: 15px;">
                        <p><strong>Appointment ID:</strong> ${qrData.appointmentId}</p>
                        <p><strong>Client:</strong> ${qrData.clientName}</p>
                        <p><strong>Staff:</strong> ${qrData.staffName}</p>
                        <p><strong>Department:</strong> ${qrData.department}</p>
                        <p><strong>Purpose:</strong> ${qrData.purpose}</p>
                        <p><strong>Date:</strong> ${qrData.date}</p>
                        <p><strong>Time:</strong> ${qrData.time}</p>
                        <p><strong>Location:</strong> ${qrData.location}</p>
                        <p><strong>Status:</strong> <span style="color: #38a169; font-weight: bold;">${qrData.status}</span></p>
                        <p><strong>Contact:</strong> ${qrData.contact}</p>
                    </div>
                    <div style="text-align: center; margin-bottom: 15px; padding: 20px; background: #f7fafc; border: 2px dashed #cbd5e0; border-radius: 8px;">
                        <p style="font-size: 14px; color: #718096; margin-bottom: 10px;">📱 Appointment QR Code Data:</p>
                        <div id="qr-code-container-${qrData.appointmentId}" style="background: white; padding: 15px; border-radius: 4px; min-height: 200px; display: flex; align-items: center; justify-content: center; border: 1px solid #e2e8f0;">
                            <div id="qr-code-loading-${qrData.appointmentId}" style="text-align: center; color: #64748b;">
                                <div style="margin-bottom: 10px;">🔄 Generating QR Code...</div>
                                <div style="font-size: 12px;">Please wait</div>
                            </div>
                        </div>
                        <p style="font-size: 12px; color: #64748b; margin-top: 10px;">📋 Scan this QR code to access appointment details</p>
                    </div>
                    <p style="font-size: 12px; color: #64748b; text-align: center;">📱 Show this QR code to ${qrData.staffName} when you arrive</p>
                    <p style="font-size: 12px; color: #64748b; text-align: center;">📅 QR code contains all appointment information</p>
                </div>
            `;

            // Add to chat messages
            this.chatMessages.appendChild(qrMessage);
            this.scrollToBottom();
            
            await this.renderQRCodeIntoContainer(qrCodeString, qrData.appointmentId);
            await this.renderQRCodeIntoContainer(qrCodeString, qrData.appointmentId);
            
        } catch (error) {
            console.error('Error generating QR code:', error);
            this.addMessage('❌ Failed to generate QR code. Please try again.', 'error');
        }
    }

    // Removed Google Charts path; QR is rendered by QRCode.js only

    // Removed multi-method fallbacks; only local QRCode.js is used for 100% control

    // Removed Google Charts generator

    // Removed external QR services

    // Removed external QR services

    async generateQRWithQRCodeJS(qrData) {
        return new Promise((resolve, reject) => {
            try {
                // Check if QRCode library is available
                if (typeof QRCode === 'undefined') {
                    reject(new Error('QRCode library not available'));
                    return;
                }

                // Create canvas element
                const canvas = document.createElement('canvas');
                canvas.width = 200;
                canvas.height = 200;
                canvas.style.maxWidth = '180px';
                canvas.style.maxHeight = '180px';
                canvas.style.borderRadius = '4px';
                canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';

                // Generate QR code
                QRCode.toCanvas(canvas, qrData, {
                    width: 200,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    },
                    errorCorrectionLevel: 'M'
                }, (error) => {
                    if (error) {
                        reject(new Error('QRCode.js failed: ' + error.message));
                    } else {
                        resolve(canvas);
                    }
                });
            } catch (error) {
                reject(new Error('QRCode.js error: ' + error.message));
            }
        });
    }

    async ensureQRCodeLib() {
        const maxWaitMs = 1000;
        const start = Date.now();
        while (typeof QRCode === 'undefined' && Date.now() - start < maxWaitMs) {
            await new Promise(r => setTimeout(r, 50));
        }
        if (typeof QRCode === 'undefined') {
            try {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js';
                    s.async = true;
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('Failed to load QRCode lib'));
                    document.head.appendChild(s);
                });
            } catch (_) {}
        }
    }

    async renderQRCodeIntoContainer(qrString, appointmentId) {
        const container = document.getElementById(`qr-code-container-${appointmentId}`);
        const loading = document.getElementById(`qr-code-loading-${appointmentId}`);
        if (!container || !loading) return;

        // Prevent duplicates per appointment
        if (this.renderedQRCodes && this.renderedQRCodes.has(appointmentId)) {
            loading.style.display = 'none';
            return;
        }
        // Clear any existing children before rendering
        try {
            while (container.firstChild) container.removeChild(container.firstChild);
            container.appendChild(loading);
        } catch (_) {}

        // 1) Try Canvas
        try {
            await this.ensureQRCodeLib();
            if (typeof QRCode !== 'undefined' && QRCode.toCanvas) {
                const node = await this.generateQRWithQRCodeJS(qrString);
                loading.style.display = 'none';
                container.appendChild(node);
                this.renderedQRCodes && this.renderedQRCodes.add(appointmentId);
                return;
            }
        } catch (_) {}

        // 2) Try DataURL image via QRCode.toDataURL
        try {
            await this.ensureQRCodeLib();
            if (typeof QRCode !== 'undefined' && QRCode.toDataURL) {
                const dataUrl = await new Promise((resolve, reject) => {
                    QRCode.toDataURL(qrString, { width: 200, margin: 2, errorCorrectionLevel: 'M' }, (err, url) => {
                        if (err) return reject(err);
                        resolve(url);
                    });
                });
                const img = document.createElement('img');
                img.src = dataUrl;
                img.alt = 'Appointment QR Code';
                img.style.maxWidth = '180px';
                img.style.maxHeight = '180px';
                img.style.borderRadius = '4px';
                img.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                loading.style.display = 'none';
                container.appendChild(img);
                this.renderedQRCodes && this.renderedQRCodes.add(appointmentId);
                return;
            }
        } catch (_) {}

        // 3) Final fallback: external generator (no keys, HTTPS)
        try {
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrString)}`;
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Appointment QR Code';
            img.style.maxWidth = '180px';
            img.style.maxHeight = '180px';
            img.style.borderRadius = '4px';
            img.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
            img.onload = () => {
                loading.style.display = 'none';
                this.renderedQRCodes && this.renderedQRCodes.add(appointmentId);
            };
            img.onerror = () => {
                loading.innerHTML = '<div style="color:#e53e3e">Failed to render QR</div>';
            };
            container.appendChild(img);
        } catch (e) {
            loading.innerHTML = '<div style="color:#e53e3e">Failed to render QR</div>';
        }
    }

    async loadGoogleChartsAPI() {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (typeof google !== 'undefined' && google.charts) {
                resolve();
                return;
            }

            // Create script element
            const script = document.createElement('script');
            script.src = 'https://www.gstatic.com/charts/loader.js';
            script.async = true;
            
            script.onload = () => {
                console.log('📱 Google Charts API loaded successfully');
                resolve();
            };
            
            script.onerror = () => {
                console.error('📱 Failed to load Google Charts API');
                reject(new Error('Failed to load Google Charts API'));
            };
            
            document.head.appendChild(script);
        });
    }

    async storeAppointmentData(appointmentData) {
        try {
            console.log('📱 Storing appointment data:', appointmentData);
            
            // Store appointment data on server for QR code lookup
            const response = await fetch('/api/appointment', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(appointmentData)
            });

            if (!response.ok) {
                throw new Error(`Failed to store appointment data: ${response.statusText}`);
            }

            console.log('📱 Appointment data stored successfully');
        } catch (error) {
            console.error('📱 Error storing appointment data:', error);
            // Don't throw error - QR code generation should continue even if storage fails
        }
    }

    async getPublicUrl() {
        try {
            // Try to get tunnel configuration from server
            const response = await fetch('/api/tunnel-config');
            if (response.ok) {
                const config = await response.json();
                if (config.tunnelUrl) {
                    console.log('📱 Using tunnel URL:', config.tunnelUrl);
                    return config.tunnelUrl;
                }
            }
        } catch (error) {
            console.log('📱 No tunnel configuration found, using local URL');
        }
        
        // Fallback to local URL
        return window.location.origin;
    }
}

// Initialize Clara when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.claraInstance = new Clara();
    
    // Test function to generate QR code
    window.testQRCode = function() {
        if (window.claraInstance) {
            window.claraInstance.generateQRCode({
                appointmentId: 'test_123',
                clientName: 'Test Client',
                staffName: 'Prof. Anitha C S',
                staffEmail: 'anithacs@gmail.com',
                purpose: 'Test Consultation'
            });
        }
    };
    
    // Test QRCode library availability
    window.testQRCodeLibrary = function() {
        console.log('QRCode library available:', typeof QRCode !== 'undefined');
        if (typeof QRCode !== 'undefined') {
            console.log('QRCode methods:', Object.keys(QRCode));
        }
    };
    
    // Test QR code generation
    window.testQRCodeGeneration = function() {
        if (window.claraInstance) {
            const testData = {
                appointmentId: 'test_123',
                clientName: 'Test Client',
                staffName: 'Prof. Anitha C S',
                staffEmail: 'anithacs@gmail.com',
                purpose: 'Test Consultation'
            };
            console.log('Testing QR code generation with data:', testData);
            window.claraInstance.generateQRCode(testData);
        } else {
            console.log('Clara instance not available');
        }
    };
    
    // Emergency QR Code Test Function
    window.testEmergencyQR = function() {
        console.log('🚨 EMERGENCY QR CODE TEST FUNCTION ADDED!');
        
        // Test the QR code immediately
        if (typeof QRCode !== 'undefined') {
            console.log('✅ QRCode library is available');
            const testData = {
                appointmentId: 'test_123',
                clientName: 'Test Client',
                staffName: 'Prof. Anitha C S',
                staffEmail: 'anithacs@gmail.com',
                purpose: 'Test Consultation'
            };
            console.log('🚨 Testing emergency QR code with data:', testData);
            window.claraInstance.generateQRCode(testData);
        } else {
            console.log('❌ QRCode library not available');
        }
    };
});

// Video Call Functions
let currentCallData = null;

function showCallLog(callData) {
    currentCallData = callData;
    const callLogContainer = document.getElementById('callLogContainer');
    const callerName = document.getElementById('callerName');
    const callerDepartment = document.getElementById('callerDepartment');
    const callPurpose = document.getElementById('callPurpose');
    
    if (callerName) callerName.textContent = callData.staffName || 'Staff Member';
    if (callerDepartment) callerDepartment.textContent = callData.staffDepartment || 'Department';
    if (callPurpose) callPurpose.textContent = `Purpose: ${callData.purpose || 'Consultation'}`;
    
    callLogContainer.style.display = 'block';
}

function hideCallLog() {
    const callLogContainer = document.getElementById('callLogContainer');
    callLogContainer.style.display = 'none';
    currentCallData = null;
}

function acceptCall() {
    if (currentCallData) {
        // Send accept response to server
        const clara = window.claraInstance;
        if (clara && clara.socket) {
            clara.socket.emit('webrtc-call-response', {
                callId: currentCallData.callId,
                accepted: true,
                staffEmail: currentCallData.staffEmail
            });
        }
        
        // Show video call display
        showVideoCallDisplay(currentCallData);
        hideCallLog();
    }
}

function rejectCall() {
    if (currentCallData) {
        // Send reject response to server
        const clara = window.claraInstance;
        if (clara && clara.socket) {
            clara.socket.emit('webrtc-call-response', {
                callId: currentCallData.callId,
                accepted: false,
                staffEmail: currentCallData.staffEmail
            });
        }
        
        hideCallLog();
    }
}

function showVideoCallDisplay(callData) {
    const videoDisplay = document.getElementById('videoCallInterface');
    if (videoDisplay) {
        videoDisplay.style.display = 'flex';
    }
}

function showVideoCall() {
    document.getElementById('videoCallInterface').style.display = 'flex';
    initializeVideoCall();
}

function hideVideoCall() {
    document.getElementById('videoCallInterface').style.display = 'none';
    // Don't call endCall() here to avoid infinite recursion
    // endCall() will be called explicitly when needed
}

function endVideoCall() {
    // This function properly ends the call and hides the interface
    console.log('📞 Ending video call and hiding interface...');
    
    // Clean up WebRTC connection
    const clara = window.claraInstance;
    if (clara) {
        // Stop local stream
        if (clara.localStream) {
            clara.localStream.getTracks().forEach(track => track.stop());
            clara.localStream = null;
        }
        
        // Close peer connection
        if (clara.peerConnection) {
            clara.peerConnection.close();
            clara.peerConnection = null;
        }
        
        // Clear video elements
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        if (localVideo) localVideo.srcObject = null;
        if (remoteVideo) remoteVideo.srcObject = null;
        
        // Send end call to server
        if (clara.socket && currentCallData) {
            clara.socket.emit('end-video-call', {
                callId: currentCallData.callId
            });
        }
        
        clara.currentCallId = null;
    }
    
    currentCallData = null;
    
    // Hide the video call interface
    document.getElementById('videoCallInterface').style.display = 'none';
}

function initializeVideoCall() {
    // Initialize video call functionality
    console.log('🎥 Initializing video call...');
    // Add video call initialization logic here
}

function toggleMute() {
    const muteBtn = document.getElementById('muteBtn');
    const icon = muteBtn.querySelector('i');
    const clara = window.claraInstance;
    
    if (icon.classList.contains('fa-microphone')) {
        icon.classList.remove('fa-microphone');
        icon.classList.add('fa-microphone-slash');
        muteBtn.classList.add('muted');
        // Mute audio track
        if (clara && clara.localStream) {
            clara.localStream.getAudioTracks().forEach(track => {
                track.enabled = false;
            });
        }
    } else {
        icon.classList.remove('fa-microphone-slash');
        icon.classList.add('fa-microphone');
        muteBtn.classList.remove('muted');
        // Unmute audio track
        if (clara && clara.localStream) {
            clara.localStream.getAudioTracks().forEach(track => {
                track.enabled = true;
            });
        }
    }
}

function toggleVideo() {
    const videoBtn = document.getElementById('videoBtn');
    const icon = videoBtn.querySelector('i');
    const clara = window.claraInstance;
    
    if (icon.classList.contains('fa-video')) {
        icon.classList.remove('fa-video');
        icon.classList.add('fa-video-slash');
        videoBtn.classList.add('video-off');
        // Turn off video track
        if (clara && clara.localStream) {
            clara.localStream.getVideoTracks().forEach(track => {
                track.enabled = false;
            });
        }
    } else {
        icon.classList.remove('fa-video-slash');
        icon.classList.add('fa-video');
        videoBtn.classList.remove('video-off');
        // Turn on video track
        if (clara && clara.localStream) {
            clara.localStream.getVideoTracks().forEach(track => {
                track.enabled = true;
            });
        }
    }
}

function endCall() {
    console.log('📞 Ending video call...');
    endVideoCall();
}
