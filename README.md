# 🏦 Bank-AI

> **Real-time AI suggestions for bank customer service calls**

Live AI-powered assistant that helps bank agents respond to customer queries during calls using real-time transcription, intent classification, and contextual suggestions.

---

## ⚡ What It Does

🎤 **Customer calls** → 🧠 **AI analyzes** → 💡 **Agent gets suggestions**

- Real-time speech-to-text transcription
- Smart intent classification (18+ banking categories)
- Instant contextual suggestions for agents
- WebRTC audio communication
- Secure authentication

---

## 🚀 Key Features

| Feature | Description |
|---------|-------------|
| 🎙️ **Live Transcription** | AWS Transcribe converts speech to text in real-time |
| 🧠 **Intent Classification** | Claude AI identifies customer query intent |
| 💡 **AI Suggestions** | RAG-powered contextual suggestions using AWS Bedrock |
| 📞 **WebRTC Calls** | Peer-to-peer audio between customers and agents |
| 🔒 **Secure Auth** | Supabase-based authentication with JWT |
| 📊 **Session Tracking** | Complete call history with transcripts & suggestions |

---

## 🛠️ Tech Stack

**Frontend:** React • Vite • Tailwind CSS • WebRTC

**Backend:** FastAPI • WebSocket • Supabase • FFmpeg

**AI/ML:** AWS Transcribe • AWS Bedrock (Mistral) • Claude AI • ChromaDB • LangChain

**Infrastructure:** Docker • Nginx • Redis • AWS Services

---

## 🏗️ How It Works

```
Customer Audio → Backend → AWS Transcribe → Intent Classification → RAG Search → Suggestions → Agent
```

1. Customer speaks during call
2. Audio transcribed in real-time
3. AI classifies intent (balance inquiry, card issue, etc.)
4. System retrieves relevant banking knowledge
5. Agent receives contextual suggestions instantly

---

## 📋 Supported Banking Intents

Account Operations • Card Services • Fund Transfers • Loans • Banking Help • Transactions • KYC • ATMs • Investments • Fraud Reporting • and more

---

## 🎯 Use Cases

- **Customer Service** - Real-time assistance for agents
- **Training** - Help new agents learn responses
- **Quality Assurance** - Monitor service quality
- **Analytics** - Track common queries

---

## 📁 Project Structure

```
Bank-AI/
├── frontend/          # React app (Customer/Agent UI)
├── backend/           # FastAPI server
│   ├── auth/         # Authentication
│   ├── websocket/    # WebRTC signaling
│   ├── live_transcriber.py
│   ├── intent_classifier.py
│   └── main_llm.py
├── nginx/            # Reverse proxy
└── docker-compose.yml
```

---

## 🔌 API Quick Reference

**Auth:** `/auth/customer/signup`, `/auth/agent/signup`, `/auth/login`

**Audio:** `/audio-stream/start/{session_id}`, `/audio-stream/upload/{session_id}`

**WebSocket:** `/ws/signaling/{token}` - WebRTC signaling

**Health:** `/health` - Health check

---

## 🤖 AI Models

- **Claude 3.5 Haiku** - Intent classification
- **Mistral Large** (AWS Bedrock) - Suggestion generation
- **AWS Titan Embeddings** - Vector search
- **AWS Transcribe** - Speech-to-text

---

## ✨ Highlights

✅ Real-time transcription  
✅ AI-powered intent detection  
✅ Contextual suggestions  
✅ Secure WebRTC communication  
✅ Production-ready architecture  

---

**Bank-AI** - Transforming customer service with AI 🚀

Built for the DevPost Hackathon
