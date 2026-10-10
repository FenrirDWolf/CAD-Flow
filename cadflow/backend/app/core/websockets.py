from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Set

# In a real app, this integrates with the APIRouter. Doing it here for brevity.
app = FastAPI(title="CADFlow Enterprise Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections mapping User Email -> WebSocket
active_connections: Dict[str, WebSocket] = {}

class ConnectionManager:
    async def connect(self, websocket: WebSocket, user_email: str):
        await websocket.accept()
        active_connections[user_email] = websocket
        print(f"🔗 User {user_email} connected to Realtime WebSockets")

    def disconnect(self, user_email: str):
        if user_email in active_connections:
            del active_connections[user_email]
            print(f"❌ User {user_email} disconnected")

    async def broadcast_lock(self, file_name: str, locked_by: str):
        """ Instantly broadcasts to all connected CADFlow desktop apps that a file is locked """
        message = {
            "event": "FILE_LOCKED",
            "file_name": file_name,
            "locked_by": locked_by
        }
        for email, connection in active_connections.items():
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Failed to send to {email}: {e}")

manager = ConnectionManager()

@app.websocket("/ws/realtime/{user_email}")
async def websocket_endpoint(websocket: WebSocket, user_email: str):
    await manager.connect(websocket, user_email)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming WebSocket messages if needed
    except WebSocketDisconnect:
        manager.disconnect(user_email)
