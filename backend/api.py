import logging
import os
import threading
from collections import OrderedDict
from uuid import UUID
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from utlt_brain import Assistant, parse_readings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("utlt-ai-api")

app = FastAPI(title="UTLT.ai Assistant API", version="1.0.0")

# Configure FRONTEND_ORIGINS in Render as a comma-separated list of exact
# origins, e.g. https://utltaihackathon-dotcom.github.io
allowed_origins = [
    item.strip()
    for item in os.getenv("FRONTEND_ORIGINS", "*").split(",")
    if item.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

MAX_SESSIONS = 1000
sessions: OrderedDict[str, Assistant] = OrderedDict()
sessions_lock = threading.RLock()


class ChatRequest(BaseModel):
    session_id: UUID
    message: str = Field(min_length=1, max_length=2000)
    readings: list[dict[str, Any]] = Field(default_factory=list, max_length=5000)
    goal: float = Field(default=350, gt=0, le=100000)


@app.get("/")
def root():
    return {"status": "online", "service": "UTLT.ai Assistant API"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/chat")
def chat(request: ChatRequest):
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=422, detail="Message cannot be empty.")

    try:
        parsed_readings = parse_readings(request.readings)
        session_key = str(request.session_id)

        # The assistant object stores its own short-lived conversation state
        # (e.g. follow-up prompts). Keep the cache bounded.
        with sessions_lock:
            assistant = sessions.get(session_key)
            if assistant is None:
                assistant = Assistant(
                    readings=parsed_readings or None,
                    goal=request.goal
                )
                sessions[session_key] = assistant
            else:
                sessions.move_to_end(session_key)
                if parsed_readings:
                    assistant.readings = parsed_readings
                    assistant.source = "file"
                elif assistant.source == "file":
                    # The app switched back to demo/empty data.
                    assistant = Assistant(readings=None, goal=request.goal)
                    sessions[session_key] = assistant

            assistant.goal = request.goal
            assistant.refresh()
            reply = assistant.reply(message)
            source = assistant.source

            while len(sessions) > MAX_SESSIONS:
                sessions.popitem(last=False)

        return {"reply": reply, "source": source}

    except HTTPException:
        raise
    except Exception as error:
        logger.exception("UTLT.ai request failed")
        raise HTTPException(
            status_code=500,
            detail="UTLT.ai could not process that message."
        ) from error