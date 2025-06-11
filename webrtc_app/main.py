from fastapi import FastAPI,Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from aiortc import RTCPeerConnection,RTCSessionDescription,MediaStreamTrack
import uvicorn

app = FastAPI()
app.mount("/static",StaticFiles(directory="static"),name="static")
templates = Jinja2Templates(directory="templates")
pcs = set()

class AudioTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(self,track):
        super().__init__()
        self.track = track
    async def recv(self):
        frame = await self.track.recv()
        print("🔊 Received audio frame")

        return frame
@app.get("/", response_class=HTMLResponse)

async def get_home(request:Request):
    return templates.TemplateResponse("index.html",{"request":request})

@app.post("/offer")
async def offer(request: Request):
    data = await request.json()
    offer = RTCSessionDescription(sdp = data["sdp"],type=data["type"])
    pc = RTCPeerConnection()
    pcs.add(pc)

    @pc.on("track")
    def on_track(track):
        if track.kind=="audio":
            print("🎤 Audio track received")
            local_audio = AudioTrack(track)
            pc.addTrack(local_audio)
    
    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    return JSONResponse(
        {
            "sdp": pc.localDescription.sdp,
            "type": pc.localDescription.type,
        }
    )

if __name__ == "__main__":
    uvicorn.run("main:app",host = "0.0.0.0",port=8000)