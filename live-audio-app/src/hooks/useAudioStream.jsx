const useAudioStream = (role) => {
    let mediaRecorder;
    const startStreaming = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio : true });
        const ws = new WebSocket('ws://localhost:8000/ws/audio');
        ws.onopen = () => {
            mediaRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm'});
            mediaRecorder.ondataavailable = (event) => {
                if(event.data.size > 0 && ws.readyState === WebSocket.OPEN){
                    ws.send(event.data);
                }
            };
            mediaRecorder.start(1000);
        };
    };
    return { startStreaming };
};

export default useAudioStream;