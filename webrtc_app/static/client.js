let pc;
let localStream;

document.getElementById("startBtn").onclick = async () => {
  pc = new RTCPeerConnection();
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const res = await fetch("/offer", {
    method: "POST",
    body: JSON.stringify(pc.localDescription),
    headers: { "Content-Type": "application/json" }
  });

  const answer = await res.json();
  await pc.setRemoteDescription(answer);
  console.log("📞 Call started");
};

document.getElementById("endBtn").onclick = () => {
  if (pc) {
    pc.getSenders().forEach(sender => sender.track.stop());
    pc.close();
    pc = null;
    console.log("🔚 Call ended");
  }
};
