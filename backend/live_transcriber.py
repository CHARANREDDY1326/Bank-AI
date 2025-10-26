import asyncio
import subprocess
from amazon_transcribe.client import TranscribeStreamingClient
from amazon_transcribe.handlers import TranscriptResultStreamHandler
from amazon_transcribe.model import AudioEvent
import aiofiles
import os
import time
from intent_classifier import classify_intent_and_giveQuery
from main_llm import generate_suggestion

PCM_FRAME_SIZE = 3200  # 100ms for 16-bit 16kHz mono audio

async def convert_webm_to_pcm(webm_bytes: bytes) -> bytes:
    print("🎬 [convert_webm_to_pcm] Converting webm chunk to PCM...")

    if not webm_bytes:
        print("⚠️ [convert_webm_to_pcm] Empty webm bytes received")
        return b""

    try:
        process = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-f", "webm",
            "-i", "pipe:0",
            "-f", "s16le",
            "-acodec", "pcm_s16le",
            "-ac", "1",
            "-ar", "16000",
            "-y",  # Overwrite output
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
            
    except Exception as e:
        print(f"❌ [convert_webm_to_pcm] Exception: {e}")
        return b""

async def audio_stream_generator(audio_queue: asyncio.Queue, input_stream):
    print("🚀 [audio_stream_generator] Started")

    buffer = bytearray()
    total_bytes_sent = 0

    try:
        while True:
            chunk = await audio_queue.get()
            if chunk is None:
                print("🛑 [audio_stream_generator] Received None, ending stream.")
                break

            print(f"🎧 [audio_stream_generator] Received chunk: {len(chunk)} bytes")
            
            if len(chunk) == 0:
                print("⚠️ [audio_stream_generator] Skipping empty chunk")
                continue
                
            pcm_chunk = await convert_webm_to_pcm(chunk)

            if not pcm_chunk:
                print("⚠️ Skipping empty PCM chunk")
                continue

            buffer.extend(pcm_chunk)

            # Send frames in proper sizes
            while len(buffer) >= PCM_FRAME_SIZE:
                frame = buffer[:PCM_FRAME_SIZE]
                buffer = buffer[PCM_FRAME_SIZE:]
                
                try:
                    await input_stream.send_audio_event(audio_chunk=frame)
                    total_bytes_sent += len(frame)
                    print(f"📤 [audio_stream_generator] Sent {len(frame)} bytes to Transcribe (Total: {total_bytes_sent})")
                except Exception as e:
                    print(f"❌ [audio_stream_generator] Error sending audio: {e}")
                    break

        # Flush remaining bytes (if any)
        if buffer and len(buffer) > 0:
            try:
                await input_stream.send_audio_event(audio_chunk=bytes(buffer))
                total_bytes_sent += len(buffer)
                print(f"📤 [audio_stream_generator] Flushed remaining {len(buffer)} bytes (Total sent: {total_bytes_sent})")
            except Exception as e:
                print(f"❌ [audio_stream_generator] Error flushing buffer: {e}")

        await input_stream.end_stream()
        print("✅ [audio_stream_generator] Ended stream")
        
    except Exception as e:
        print(f"❌ [audio_stream_generator] Exception: {e}")

class MyTranscriptHandler(TranscriptResultStreamHandler):
    def __init__(self, output_stream, session_id: str, broadcast_callback):
        super().__init__(output_stream)
        self.session_id = session_id
        self.broadcast_callback = broadcast_callback # <-- Store the callback
        self.final_transcripts = []
        self.partial_transcripts = []
        self.last_suggestion_time = time.time()
        self.last_transcript_time = time.time()
        self.event_count = 0
        self.accumulated_text = ""  # Track all text for suggestions
        
        # Create suggestions directory
        os.makedirs("suggestions", exist_ok=True)

    async def handle_transcript_event(self, transcript_event):
        self.event_count += 1
        print(f"📡 [handle_transcript_event] Received transcript event #{self.event_count}")

        try:
            if hasattr(transcript_event, 'transcript'):
                transcript = transcript_event.transcript
                
                if hasattr(transcript, 'results') and transcript.results:
                    results = transcript.results
                    
                    for i, result in enumerate(results):
                        is_partial = getattr(result, 'is_partial', True)
                        
                        if hasattr(result, 'alternatives') and result.alternatives:
                            for alt in result.alternatives:
                                transcript_text = getattr(alt, 'transcript', '').strip()
                                
                                if transcript_text:  # Only process non-empty transcripts
                                    if not is_partial:  # Final result
                                        print(f"📝 [handle_transcript_event] Final transcript: {transcript_text}")
                                        self.final_transcripts.append(transcript_text)
                                        self.accumulated_text += f" {transcript_text}"
                                        self.last_transcript_time = time.time()
                                        await self.write_transcript(transcript_text)
                                        
                                        # Try to generate suggestion immediately after final transcript
                                        await self.try_generate_suggestion()
                                        
                                    else:  # Partial result
                                        print(f"🔄 [handle_transcript_event] Partial transcript: {transcript_text}")
                else:
                    print("📭 [handle_transcript_event] No results in transcript")
                    
                    # Even if no results, check if we should generate suggestions based on time
                    if time.time() - self.last_suggestion_time > 10:
                        await self.try_generate_suggestion()
                        
        except Exception as e:
            print(f"❌ [handle_transcript_event] Error processing event: {e}")
            import traceback
            traceback.print_exc()

    async def try_generate_suggestion(self):
        """Try to generate suggestion based on current state"""
        try:
            current_time = time.time()
            time_since_last_suggestion = current_time - self.last_suggestion_time
            time_since_last_transcript = current_time - self.last_transcript_time
            
            should_generate = (
                len(self.final_transcripts) >= 2 or 
                (time_since_last_suggestion > 10 and self.accumulated_text.strip()) or
                (time_since_last_transcript > 5 and self.accumulated_text.strip())
            )
            
            if should_generate:
                full_transcript = self.accumulated_text.strip()
                
                if not full_transcript:
                    full_transcript = await self.read_transcript_file()
                
                if full_transcript:
                    print(f"🧠 [suggestion] Processing transcript: {full_transcript}")
                    
                    intent, cleaned_query = classify_intent_and_giveQuery(full_transcript)
                    
                    if intent not in ["irrelevant", "other", "error"] and cleaned_query:
                        suggestion = generate_suggestion(intent, cleaned_query)
                        print("💡 [suggestion] Intent:", intent)
                        print("💬 [suggestion] Query:", cleaned_query)
                        print("📢 [suggestion] Final Suggestion:\n", suggestion)
                        
                        await self.write_suggestion(intent, cleaned_query, suggestion)
                    else:
                        print(f"⚠️ [suggestion] No actionable intent found: {intent}")
                        if intent == "error":
                            print(f"❌ [suggestion] Error in classification: {cleaned_query}")
                    
                    # Reset for next round
                    self.final_transcripts = []
                    self.accumulated_text = ""
                    self.last_suggestion_time = current_time
                else:
                    print("⚠️ [suggestion] No transcript text available")
                    
        except Exception as e:
            print(f"❌ [try_generate_suggestion] Error in suggestion generation: {e}")
            import traceback
            traceback.print_exc()

    async def read_transcript_file(self):
        """Read existing transcript file as fallback"""
        try:
            transcript_path = f"transcripts/{self.session_id}.txt"
            if os.path.exists(transcript_path):
                async with aiofiles.open(transcript_path, mode="r") as f:
                    content = await f.read()
                    lines = content.strip().split('\n')
                    text_parts = []
                    for line in lines:
                        if '] ' in line:
                            text_part = line.split('] ', 1)[1] if '] ' in line else line
                            text_parts.append(text_part)
                    return ' '.join(text_parts)
        except Exception as e:
            print(f"❌ [read_transcript_file] Error reading transcript file: {e}")
        return ""

    async def write_transcript(self, text: str):
        """Write transcript to file"""
        try:
            os.makedirs("transcripts", exist_ok=True)
            async with aiofiles.open(f"transcripts/{self.session_id}.txt", mode="a") as f:
                timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                await f.write(f"[{timestamp}] {text}\n")
                await f.flush()
        except Exception as e:
            print(f"❌ [write_transcript] Error writing to file: {e}")

    async def write_suggestion(self, intent: str, query: str, suggestion: str):
        """Write suggestion to file and broadcast via WebSocket"""
        try:
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            suggestion_data = f"""
=== SUGGESTION GENERATED ===
Timestamp: {timestamp}
Session ID: {self.session_id}
Intent: {intent}
Query: {query}
Suggestion:
{suggestion}
================================

"""
            
            async with aiofiles.open(f"suggestions/{self.session_id}_suggestions.txt", mode="a") as f:
                await f.write(suggestion_data)
                await f.flush()
                
            print(f"✅ [write_suggestion] Suggestion saved to suggestions/{self.session_id}_suggestions.txt")
            
            # Broadcast suggestion via WebSocket to connected agents
            try:
                # <-- REMOVED: from main import broadcast_suggestion
                # USE the callback function passed during initialization
                if self.broadcast_callback:
                    await self.broadcast_callback(suggestion)
                    print(f"📢 [write_suggestion] Suggestion broadcasted via callback")
            except Exception as ws_error:
                print(f"⚠️ [write_suggestion] WebSocket broadcast failed: {ws_error}")
            
        except Exception as e:
            print(f"❌ [write_suggestion] Error writing suggestion: {e}")

async def stream_to_transcribe(session_id: str, audio_queue: asyncio.Queue, broadcast_callback):
    print(f"🎙️ [stream_to_transcribe] Starting transcription stream for session {session_id}")

    try:
        client = TranscribeStreamingClient(region="us-east-1")

        stream = await client.start_stream_transcription(
            language_code="en-US",
            media_encoding="pcm",
            media_sample_rate_hz=16000,
            show_speaker_label=False,
            enable_partial_results_stabilization=True,
            partial_results_stability="medium"
        )

        print("🔌 [stream_to_transcribe] Connected to Amazon Transcribe")

        # Pass the callback down to the handler
        handler = MyTranscriptHandler(stream.output_stream, session_id, broadcast_callback)

        await asyncio.gather(
            audio_stream_generator(audio_queue, stream.input_stream),
            handler.handle_events(),
            return_exceptions=True
        )
        
        # Final attempt to generate suggestion when stream ends
        await handler.try_generate_suggestion()
        
        print("✅ [stream_to_transcribe] Transcription finished")
        
    except Exception as e:
        print(f"❌ [stream_to_transcribe] Exception: {e}")
        import traceback
        traceback.print_exc()

# Test function to debug audio processing
async def test_audio_conversion():
    """Test WebM to PCM conversion with a sample"""
    print("🧪 Testing audio conversion...")
    
    test_file = "test.webm" 
    if os.path.exists(test_file):
        with open(test_file, "rb") as f:
            webm_data = f.read()
            pcm_data = await convert_webm_to_pcm(webm_data)
            print(f"Original: {len(webm_data)} bytes, Converted: {len(pcm_data)} bytes")
    else:
        print("No test file found")

if __name__ == "__main__":
    asyncio.run(test_audio_conversion())