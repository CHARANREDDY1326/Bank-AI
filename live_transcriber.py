import asyncio
import subprocess
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import AudioEvent
import aiofiles
import os
import time
from intent_classifier import classify_intent_and_giveQuery  # or your renamed version
from main_llm import generate_suggestion

PCM_FRAME_SIZE = 3200  # 100ms for 16-bit 16kHz mono audio

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
            await input_stream.send_audio_event(audio_chunk=frame)
            print(f"📤 [audio_stream_generator] Sent {len(frame)} bytes to Transcribe")

    # Flush remaining bytes (if any)
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

    async def handle_transcript_event(self, transcript_event):
        print("📡 [handle_transcript_event] Received transcript event")

        results = transcript_event.transcript.results
        if not results:
            print("📭 [handle_transcript_event] No results")
            return

        for result in results:
            if not result.is_partial:
                transcript = result.alternatives[0].transcript
                print(f"📝 [handle_transcript_event] Final transcript: {transcript}")
                self.final_transcripts.append(transcript)

                # Save to file
                await self.write_transcript(transcript)

        # Trigger suggestions every 3 lines or every 10 seconds
        if len(self.final_transcripts) >= 3 or (time.time() - self.last_suggestion_time > 10):
            full_transcript = " ".join(self.final_transcripts)

            # Classify and extract banking-related query
            intent, cleaned_query = classify_intent_and_giveQuery(full_transcript)

            if intent not in ["irrelevant", "other", "error"] and cleaned_query:
                suggestion = generate_suggestion(intent, cleaned_query)
                print("💡 [suggestion] Intent:", intent)
                print("💬 [suggestion] Query:", cleaned_query)
                print("📢 [suggestion] Final Suggestion:\n", suggestion)
                # TODO: Emit via WebSocket or UI here

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

        await asyncio.gather(
            audio_stream_generator(audio_queue, stream.input_stream),
            handler.handle_events()
        )
        print("✅ [stream_to_transcribe] Transcription finished")
    except Exception as e:
        print(f"❌ [stream_to_transcribe] Exception: {e}")
