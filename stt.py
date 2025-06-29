import whisper
whisper_model = whisper.load_model("medium")
def transcribe_audio(audio_path: str)-> str:
    return whisper_model.transcribe(audio_path)['text'].strip()