import asyncio
import subprocess
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import AudioEvent
import aiofiles
import os
import time
import numpy as np  # Added for volume logging

from intent_classifier import classify_intent_and_extract_query
from main_llm import generate_suggestion

PCM_FRAME_SIZE = 9600  # ~300ms for 16-bit 16kHz mono audio
MIN_BUFFER_CHUNKS = 3
MAX_SESSION_DURATION = 300  # 5 minutes


async def convert_webm_to_pcm(webm_bytes: bytes) -> bytes:
    print("🎬 [convert_webm_to_pcm] Converting webm chunk to PCM...")

    process = await asyncio.create_subprocess_exec(
        "ffmpeg",
        "-f", "webm",
        "-i", "pipe:0",
        "-f", "s16le",
        "-acodec", "pcm_s16le",
        "-ac", "1",
        "-ar", "16000",
        "pipe:1",
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    stdout, stderr = await process.communicate(input=webm_bytes)

    if process.returncode != 0:
        print("❌ FFmpeg error:", stderr.decode())
        return b""
    else:
        print(f"✅ [convert_webm_to_pcm] PCM chunk size: {len(stdout)} bytes")
        return stdout


async def audio_stream_generator(audio_queue: asyncio.Queue, input_stream):
    print("🚀 [audio_stream_generator] Started")

    buffer = bytearray()
    chunk_counter = 0
    STARTUP_BUFFER_THRESHOLD = 5  # number of chunks (~1.5-2s)

    startup_chunks = []
    while len(startup_chunks) < STARTUP_BUFFER_THRESHOLD:
        chunk = await audio_queue.get()
        if chunk is None:
            break
        pcm_chunk = await convert_webm_to_pcm(chunk)
        if pcm_chunk:
            startup_chunks.append(pcm_chunk)

    # Preload startup buffer
    for pcm_chunk in startup_chunks:
        buffer.extend(pcm_chunk)

    while True:
        chunk = await audio_queue.get()
        if chunk is None:
            print("🛑 [audio_stream_generator] Received None, ending stream.")
            break

        print(f"🎧 [audio_stream_generator] Received chunk: {len(chunk)} bytes")
        pcm_chunk = await convert_webm_to_pcm(chunk)

        if not pcm_chunk:
            print("⚠️ Skipping empty PCM chunk")
            continue

        buffer.extend(pcm_chunk)

        while len(buffer) >= PCM_FRAME_SIZE:
            frame = buffer[:PCM_FRAME_SIZE]
            buffer = buffer[PCM_FRAME_SIZE:]

            # 🔊 Volume Logging
            pcm_np = np.frombuffer(frame, dtype=np.int16)
            avg_vol = np.abs(pcm_np).mean()
            print(f"📊 [audio_stream_generator] Avg volume: {avg_vol:.2f}")

            # Optional buffering to warm up
            if chunk_counter < MIN_BUFFER_CHUNKS:
                chunk_counter += 1
                print("⏳ [audio_stream_generator] Buffering start-up audio...")
                continue

            await input_stream.send_audio_event(audio_chunk=frame)
            asyncio.sleep(0.1)
            print(f"📤 [audio_stream_generator] Sent {len(frame)} bytes to Transcribe")

    # Flush remaining bytes
    if buffer:
        await input_stream.send_audio_event(audio_chunk=bytes(buffer))
        print(f"📤 [audio_stream_generator] Flushed remaining {len(buffer)} bytes")

    await input_stream.end_stream()
    print("✅ [audio_stream_generator] Ended stream")


class MyTranscriptHandler(TranscriptResultStreamHandler):
    def __init__(self, output_stream, session_id: str):
        super().__init__(output_stream)
        self.session_id = session_id
        self.final_transcripts = []
        self.last_suggestion_time = time.time()
    async def write_suggestion(self, query: str, intent: str, suggestion: str):
        os.makedirs("suggestions", exist_ok=True)
        async with aiofiles.open(f"suggestions/suggestion_{self.session_id}.txt", mode="a", encoding="utf-8") as f:
            await f.write(f"query: {query}\n")
            await f.write(f"intent: {intent}\n")
            await f.write(f"suggestion: {suggestion}\n\n")
            await f.flush()

    async def handle_transcript_event(self, transcript_event):
        print("📡 [handle_transcript_event] Received transcript event")

        results = transcript_event.transcript.results
        if not results:
            print("📭 [handle_transcript_event] No results")
            return

        for result in results:
            transcript = result.alternatives[0].transcript
            print(f"📝 Transcript ({'FINAL' if not result.is_partial else 'partial'}): {transcript}")
            
            if not result.is_partial:
                self.final_transcripts.append(transcript)
                await self.write_transcript(transcript)

        # Trigger suggestions every 3 lines or 10 seconds
        if len(self.final_transcripts) >= 3 or (time.time() - self.last_suggestion_time > 10):
            full_transcript = " ".join(self.final_transcripts)
            intent, cleaned_query = classify_intent_and_extract_query(full_transcript)

            if intent not in ["irrelevant", "other", "error"] and cleaned_query:
                suggestion = generate_suggestion(intent, cleaned_query)
                print("💡 [suggestion] Intent:", intent)
                print("💬 [suggestion] Query:", cleaned_query)
                print("📢 [suggestion] Final Suggestion:\n", suggestion)
            
                await self.write_suggestion(cleaned_query, intent, suggestion)

                # TODO: Emit via WebSocket/UI here

            self.final_transcripts = []
            self.last_suggestion_time = time.time()

    async def write_transcript(self, text: str):
        os.makedirs("transcripts", exist_ok=True)
        async with aiofiles.open(f"transcripts/{self.session_id}.txt", mode="a") as f:
            await f.write(text + "\n")
            await f.flush()


async def stream_to_transcribe(session_id: str, audio_queue: asyncio.Queue):
    print(f"🎙️ [stream_to_transcribe] Starting transcription stream for session {session_id}")

    client = TranscribeStreamingClient(region="us-east-1")

    try:
        stream = await client.start_stream_transcription(
            language_code="en-US",
            media_encoding="pcm",
            media_sample_rate_hz=16000,
            show_speaker_label=False,
            enable_partial_results_stabilization=True,
        )

        print("🔌 [stream_to_transcribe] Connected to Amazon Transcribe")
        handler = MyTranscriptHandler(stream.output_stream, session_id)

        # Add timeout task
        async def timeout_watchdog():
            await asyncio.sleep(MAX_SESSION_DURATION)
            print(f"⏱️ [timeout_watchdog] Max session time reached ({MAX_SESSION_DURATION}s), stopping.")
            await audio_queue.put(None)

        await asyncio.gather(
            audio_stream_generator(audio_queue, stream.input_stream),
            handler.handle_events(),
            timeout_watchdog(),
        )

        print("✅ [stream_to_transcribe] Transcription finished")
    except Exception as e:
        print(f"❌ [stream_to_transcribe] Exception: {e}")
