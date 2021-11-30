const _getFile = async (audioCtx, filepath) => {
    const response = await fetch(filepath);
    const arrayBuffer = await response.arrayBuffer();
    let audioBuffer;
    try {
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } catch (e){
        console.error(e)
    }

    return audioBuffer;
}

const addAudioBuffer = async (audioCtx, filepath) => {
    const buffer = await _getFile(audioCtx, filepath);
    return buffer;
}


async function createConvolution(audioCtx, impulseFile) {
    const convolver = audioCtx.createConvolver();
    const response     = await fetch(impulseFile);
    const arraybuffer  = await response.arrayBuffer();
    convolver.buffer = await audioCtx.decodeAudioData(arraybuffer);

    return convolver;
}

const prepareAudioSource = async (audioCtx, masterGainNode, buffer=null) => {
    let source;

    if (buffer){
        const stemAudioSource = audioCtx.createBufferSource();
        stemAudioSource.buffer = buffer;
        stemAudioSource.loop = true;

        source = stemAudioSource;
    } else {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
        });

        const micSource = audioCtx.createMediaStreamSource(stream);
        source = micSource;
    }

    const inputGainNode = audioCtx.createGain();
    inputGainNode.gain.setValueAtTime(1, audioCtx.currentTime);

    const outputGainNode = audioCtx.createGain();
    outputGainNode.gain.setValueAtTime(0.7, audioCtx.currentTime);

    // FXs
    const panNode = audioCtx.createStereoPanner();
    panNode.pan.setValueAtTime(0, audioCtx.currentTime);

    // TODO: Work out delay with feedback
    const delayNode = audioCtx.createDelay(160);
    const feedback = audioCtx.createGain(0);

    const crossSynthesisNode = await createConvolution(audioCtx, 'assets/sound1.wav');
    const crossSynthesisLevelNode = audioCtx.createGain();

    const reverbNode = await createConvolution(audioCtx, 'assets/impulse-response.wav')
    const reverbLevelNode = audioCtx.createGain();

    const distortionNode = audioCtx.createWaveShaper();

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    source.connect(inputGainNode);

    // Singal chain
    inputGainNode.connect(analyser);
    analyser.connect(panNode);
    panNode.connect(delayNode);

    // Feedback delay
    delayNode.connect(feedback);
    feedback.connect(delayNode);

    // panNode.connect(distortionNode);
    delayNode.connect(distortionNode);

    distortionNode.connect(outputGainNode);

    //Reverb sends
    distortionNode.connect(reverbNode);
    reverbNode.connect(reverbLevelNode);
    reverbLevelNode.connect(outputGainNode);

    distortionNode.connect(crossSynthesisNode);
    crossSynthesisNode.connect(crossSynthesisLevelNode);
    crossSynthesisLevelNode.connect(outputGainNode);

    outputGainNode.connect(masterGainNode);

    // Return gain and panning controls so that the UI can manipulate them
    return [
        panNode,
        outputGainNode,
        delayNode,
        feedback,
        reverbLevelNode,
        crossSynthesisLevelNode,
        distortionNode,
        analyser,
        source,
    ];
}

export const initAudio = async () => {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const masterGainNode = context.createGain();
    masterGainNode.connect(context.destination);
    masterGainNode.gain.setValueAtTime(1, context.currentTime);

    const files = [
        'assets/sound2.wav',
    ]

    const allSounds = [];

    for (const file of files) {
        await addAudioBuffer(context, file).then(buffer => {
            allSounds.push({
                panNode: undefined,
                gainNode: undefined,
                delayNode: undefined,
                feedback: undefined,
                distortionNode: undefined,
                reverbLevelNode: undefined,
                crossSynthesisNode: undefined,
                analyser: undefined,
                audioBuffer: buffer,
                source: undefined,
            })
        })
    }
    for (const [idx, sound] of allSounds.entries()) {
        const [
            panNode,
            gainNode,
            delayNode,
            feedback,
            reverbLevelNode,
            crossSynthesisNode,
            distortionNode,
            analyser,
            source,
        ] = await prepareAudioSource(
            context,
            masterGainNode,
            sound.audioBuffer,
        );

        allSounds[idx].panNode = panNode;
        allSounds[idx].gainNode = gainNode;
        allSounds[idx].delayNode = delayNode;
        allSounds[idx].feedback = feedback;
        allSounds[idx].distortionNode = distortionNode;
        allSounds[idx].reverbLevelNode = reverbLevelNode;
        allSounds[idx].crossSynthesisNode = crossSynthesisNode;
        allSounds[idx].analyser = analyser;
        allSounds[idx].source = source;
    }

    // Play all stems at time 0
    const playAll = () => {
        for (const s of allSounds) {
            s.source.start(0);
        }
    }

    return [context, allSounds, playAll];
}

export const initMicAudio = async () => {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const masterGainNode = context.createGain();
    masterGainNode.connect(context.destination);
    masterGainNode.gain.setValueAtTime(1, context.currentTime);

    const micStream = {};
    const [
        panNode,
        gainNode,
        delayNode,
        feedback,
        reverbLevelNode,
        crossSynthesisNode,
        distortionNode,
        analyser,
        source,
    ] = await prepareAudioSource(
        context,
        masterGainNode,
        null,
    );

        micStream.panNode = panNode;
        micStream.gainNode = gainNode;
        micStream.delayNode = delayNode;
        micStream.feedback = feedback;
        micStream.distortionNode = distortionNode;
        micStream.reverbLevelNode = reverbLevelNode;
        micStream.crossSynthesisNode = crossSynthesisNode;
        micStream.analyser = analyser;
        micStream.source = source;

    return [context, [micStream]];
}