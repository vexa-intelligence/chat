(function () {
    let voiceActive = false;
    let mediaStream = null;
    let audioCtx = null;
    let analyser = null;
    let animFrame = null;
    let recognition = null;
    let synthUtterance = null;
    let isSpeaking = false;
    let isPaused = false;
    let isProcessing = false;
    let currentTranscript = '';

    const overlay = document.getElementById('voiceOverlay');
    const canvas = document.getElementById('voiceOrbCanvas');
    const thinkingIcon = document.getElementById('voiceThinkingIcon');
    const statusText = document.getElementById('voiceStatusText');
    const headingText = document.getElementById('voiceHeading');
    const pauseBtn = document.getElementById('voicePauseBtn');
    const endBtn = document.getElementById('voiceEndBtn');
    const callBtn = document.getElementById('topbarCallBtn');
    const ctx = canvas ? canvas.getContext('2d') : null;

    let phase = 'idle';

    function setPhase(p) {
        phase = p;
        if (canvas) canvas.style.display = (p === 'listening' || p === 'speaking') ? 'block' : 'none';
        if (thinkingIcon) thinkingIcon.style.display = (p === 'thinking') ? 'flex' : 'none';
        if (!headingText || !statusText) return;
        if (p === 'listening') {
            headingText.textContent = 'You are talking';
            statusText.textContent = 'Listening';
        } else if (p === 'thinking') {
            headingText.textContent = 'Vexa is thinking';
            statusText.textContent = 'Tap to cancel';
        } else if (p === 'speaking') {
            headingText.textContent = 'Vexa is talking';
            statusText.textContent = 'Tap to interrupt';
        } else {
            headingText.textContent = '';
            statusText.textContent = '';
        }
    }

    function resizeCanvas() {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    let listenAmplitude = 0;
    let listenTargetAmp = 0;

    function drawListening() {
        if (!ctx || !canvas) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (analyser) {
            const buf = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(buf);
            const avg = buf.slice(0, Math.floor(buf.length / 3)).reduce((a, b) => a + b, 0) / Math.floor(buf.length / 3);
            listenTargetAmp = avg / 255;
        }
        listenAmplitude += (listenTargetAmp - listenAmplitude) * 0.12;

        const cx = w / 2;
        const cy = h / 2 - 20;
        const baseR = Math.min(w, h) * 0.28;
        const wobble = listenAmplitude * baseR * 0.25;
        const t = Date.now() * 0.002;
        const pts = 80;

        ctx.beginPath();
        for (let i = 0; i <= pts; i++) {
            const angle = (i / pts) * Math.PI * 2;
            const n = Math.sin(angle * 3 + t * 1.1) * 0.5 + Math.sin(angle * 5 - t * 0.7) * 0.3 + Math.sin(angle * 7 + t * 0.9) * 0.2;
            const r = baseR + wobble * n + wobble * 0.3 * Math.sin(angle * 2 + t);
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    const BAR_COUNT = 4;
    const barHeights = new Array(BAR_COUNT).fill(0);
    const barIdleOffsets = [0, Math.PI * 0.7, Math.PI * 1.4, Math.PI * 2.1];
    let idleT = 0;

    function getFreqBands() {
        if (!analyser) return null;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(buf);
        const total = buf.length;
        const bands = [];
        const sliceSize = Math.floor(total / BAR_COUNT);
        for (let i = 0; i < BAR_COUNT; i++) {
            const start = i * sliceSize;
            const end = start + sliceSize;
            let sum = 0;
            for (let j = start; j < end; j++) sum += buf[j];
            bands.push(sum / sliceSize / 255);
        }
        return bands;
    }

    function drawSpeaking() {
        if (!ctx || !canvas) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        idleT += 0.04;

        const bands = getFreqBands();

        const barW = Math.min(w, h) * 0.11;
        const maxH = Math.min(w, h) * 0.55;
        const minH = barW * 0.85;
        const gap = barW * 0.32;
        const totalW = BAR_COUNT * barW + (BAR_COUNT - 1) * gap;
        const startX = w / 2 - totalW / 2;
        const cy = h / 2 - 20;
        const r = barW / 2;

        for (let i = 0; i < BAR_COUNT; i++) {
            let target;
            if (bands) {
                const boosted = bands[i] * 1.3;
                target = minH + Math.min(boosted, 1) * (maxH - minH);
            } else {
                const idle = (Math.sin(idleT * 1.8 + barIdleOffsets[i]) + 1) / 2;
                target = minH + idle * (maxH - minH) * 0.3;
            }

            barHeights[i] += (target - barHeights[i]) * 0.8;

            const x = startX + i * (barW + gap);
            const bh = Math.max(barHeights[i], minH);
            const y = cy - bh / 2;

            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + barW - r, y);
            ctx.arcTo(x + barW, y, x + barW, y + r, r);
            ctx.lineTo(x + barW, y + bh - r);
            ctx.arcTo(x + barW, y + bh, x + barW - r, y + bh, r);
            ctx.lineTo(x + r, y + bh);
            ctx.arcTo(x, y + bh, x, y + bh - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        }
    }

    function renderLoop() {
        if (!voiceActive) return;
        if (phase === 'listening') drawListening();
        else if (phase === 'speaking') drawSpeaking();
        animFrame = requestAnimationFrame(renderLoop);
    }

    async function startMic() {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioCtx.createMediaStreamSource(mediaStream);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);
        } catch {
            if (statusText) statusText.textContent = 'Microphone access denied';
        }
    }

    async function startSpeakerAnalyser() {
        if (!audioCtx) return;
        try {
            const dest = audioCtx.createMediaStreamDestination();
            const osc = audioCtx.createOscillator();
            osc.connect(dest);
        } catch { }
    }

    function stopMic() {
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
        if (audioCtx) { audioCtx.close(); audioCtx = null; }
        analyser = null;
    }

    function startRecognition() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { if (statusText) statusText.textContent = 'Not supported in this browser'; return; }

        recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => { setPhase('listening'); currentTranscript = ''; };

        recognition.onresult = (e) => {
            let final = '';
            let interim = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += t;
                else interim += t;
            }
            currentTranscript = final || interim;
        };

        recognition.onend = () => {
            if (!voiceActive || isPaused) return;
            if (currentTranscript.trim()) sendVoiceMessage(currentTranscript.trim());
            else setTimeout(() => { if (voiceActive && !isPaused && !isSpeaking) startRecognition(); }, 300);
        };

        recognition.onerror = (e) => {
            if ((e.error === 'no-speech' || e.error === 'aborted') && voiceActive && !isPaused && !isSpeaking) {
                setTimeout(() => startRecognition(), 400);
            }
        };

        recognition.start();
    }

    function stopRecognition() {
        if (recognition) { try { recognition.abort(); } catch { } recognition = null; }
    }

    function getOrCreateSession() {
        if (currentSessionId && chatSessions.find(s => s.id === currentSessionId)) {
            return chatSessions.find(s => s.id === currentSessionId);
        }
        const newId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
        const session = { id: newId, title: 'Voice chat', messages: [] };
        chatSessions.unshift(session);
        currentSessionId = newId;
        window.history.pushState({}, '', '/chat/' + newId);
        renderChatHistory();
        return session;
    }

    async function sendVoiceMessage(text) {
        if (isProcessing) return;
        isProcessing = true;
        stopRecognition();
        setPhase('thinking');

        const session = getOrCreateSession();
        session.messages.push({ role: 'user', content: text });

        showPageRaw('chat');
        document.querySelector('.chat-wrap')?.classList.remove('empty-chat');
        document.getElementById('feedEmpty')?.remove();
        addBubble('user', text);

        try {
            const history = buildConversationHistory(session);
            const messages = [
                { role: 'system', content: buildSystemPrompt() + ' Keep responses concise and conversational — 1–3 sentences max unless asked for detail. No markdown, no bullet points, no code blocks.' },
                ...history,
                { role: 'user', content: text }
            ];

            const res = await fetchChat(messages, currentModel || 'vexa');
            let fullReply = await readSSEStream(res);

            const cleaned = fullReply.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[\s\S]*?```/g, '').replace(/[#*`~>_]/g, '').replace(/\s+/g, ' ').trim();

            session.messages.push({ role: 'assistant', content: fullReply });

            const loadingRow = addLoading();
            swapText(loadingRow, fullReply);

            if (session.messages.filter(m => m.role === 'user').length === 1) {
                generateChatTitle(text, fullReply).then(t => { if (t) { session.title = t; renderChatHistory(); } });
            }
            await saveChatToFirebase(session.id, session.title, session.messages);

            const feed = document.getElementById('feed');
            if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });

            speakResponse(cleaned);
        } catch {
            isProcessing = false;
            if (voiceActive && !isPaused) setTimeout(() => startRecognition(), 800);
        }
    }

    let ttsAnalyser = null;

    function speakResponse(text) {
        if (!window.speechSynthesis) { isProcessing = false; startRecognition(); return; }
        window.speechSynthesis.cancel();
        isSpeaking = true;
        setPhase('speaking');

        if (audioCtx && audioCtx.state !== 'closed') {
            try {
                const dest = audioCtx.createMediaStreamDestination();
                const ttsStream = dest.stream;
                ttsAnalyser = audioCtx.createAnalyser();
                ttsAnalyser.fftSize = 256;
                ttsAnalyser.smoothingTimeConstant = 0.5;
                const src = audioCtx.createMediaStreamSource(ttsStream);
                src.connect(ttsAnalyser);
                analyser = ttsAnalyser;
            } catch { }
        }

        synthUtterance = new SpeechSynthesisUtterance(text);
        synthUtterance.rate = 1.05;
        synthUtterance.pitch = 1;

        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google US English') || (v.lang && v.lang.startsWith('en-US') && v.localService));
        if (preferred) synthUtterance.voice = preferred;

        let simT = 0;
        const simInterval = setInterval(() => {
            if (!isSpeaking) { clearInterval(simInterval); return; }
            simT += 0.08;
            const fakeData = new Uint8Array(analyser ? analyser.frequencyBinCount : 32);
            for (let i = 0; i < fakeData.length; i++) {
                const envelope = Math.abs(Math.sin(simT * 0.8)) * 0.7 + 0.3;
                fakeData[i] = Math.floor(10 + 245 * envelope * Math.abs(Math.sin(simT * 2.5 + i * 0.8)) * Math.abs(Math.sin(simT * 1.3 + i * 1.4)));
            }
            if (analyser) {
                analyser.getByteFrequencyData = (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = fakeData[i]; };
            }
        }, 30);

        synthUtterance.onend = () => {
            clearInterval(simInterval);
            if (analyser) delete analyser.getByteFrequencyData;
            isSpeaking = false;
            isProcessing = false;
            if (mediaStream && audioCtx && audioCtx.state !== 'closed') {
                const src2 = audioCtx.createMediaStreamSource(mediaStream);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.5;
                src2.connect(analyser);
            }
            if (voiceActive && !isPaused) setTimeout(() => startRecognition(), 400);
        };
        synthUtterance.onerror = () => {
            clearInterval(simInterval);
            isSpeaking = false;
            isProcessing = false;
            if (voiceActive && !isPaused) setTimeout(() => startRecognition(), 400);
        };

        window.speechSynthesis.speak(synthUtterance);
    }

    function interruptSpeech() {
        if (!isSpeaking && !isProcessing) return;
        window.speechSynthesis?.cancel();
        stopRecognition();
        isSpeaking = false;
        isProcessing = false;
        if (mediaStream && audioCtx && audioCtx.state !== 'closed') {
            try {
                const src = audioCtx.createMediaStreamSource(mediaStream);
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.5;
                src.connect(analyser);
            } catch { }
        }
        if (voiceActive && !isPaused) setTimeout(() => startRecognition(), 200);
    }

    async function openVoiceCall() {
        if (!currentUser) { if (typeof openAuthOverlay === 'function') openAuthOverlay(); return; }
        voiceActive = true;
        isPaused = false;
        isSpeaking = false;
        isProcessing = false;
        listenAmplitude = 0;
        listenTargetAmp = 0;
        idleT = 0;
        barHeights.fill(0);

        overlay.classList.add('active');
        resizeCanvas();
        setPhase('listening');
        await startMic();
        renderLoop();
        await new Promise(r => setTimeout(r, 500));
        startRecognition();
    }

    function closeVoiceCall() {
        voiceActive = false;
        isSpeaking = false;
        isProcessing = false;
        isPaused = false;
        stopRecognition();
        window.speechSynthesis?.cancel();
        stopMic();
        overlay.classList.remove('active');
        if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setPhase('idle');
        if (pauseBtn) pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    }

    function togglePause() {
        isPaused = !isPaused;
        if (pauseBtn) pauseBtn.innerHTML = isPaused ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>';
        if (isPaused) {
            stopRecognition();
            window.speechSynthesis?.cancel();
            isSpeaking = false;
            isProcessing = false;
            setPhase('idle');
            if (headingText) headingText.textContent = 'Paused';
        } else {
            setTimeout(() => startRecognition(), 200);
        }
    }

    if (overlay) overlay.addEventListener('click', (e) => { if (!e.target.closest('.voice-controls')) interruptSpeech(); });
    if (pauseBtn) pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
    if (endBtn) endBtn.addEventListener('click', (e) => { e.stopPropagation(); closeVoiceCall(); });
    if (callBtn) callBtn.addEventListener('click', openVoiceCall);
    window.addEventListener('resize', () => { if (voiceActive) resizeCanvas(); });
    window.speechSynthesis?.addEventListener('voiceschanged', () => { });
    window.openVoiceCall = openVoiceCall;
    window.closeVoiceCall = closeVoiceCall;
})();