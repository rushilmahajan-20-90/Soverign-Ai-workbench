# from fastapi import FastAPI

# app = FastAPI(title="Sovereign AI Workbench")


# @app.get("/")
# def root():
#     return {
#         "message": "Sovereign AI Workbench backend is running"
#     }


# @app.get("/health")
# def health():
#     return {
#         "status": "ok"
#     }



from fastapi import FastAPI
from pydantic import BaseModel

from app.llm.qwen2 import ask_qwen


app = FastAPI(title="Sovereign AI Workbench")


class ChatRequest(BaseModel):
    message: str


@app.get("/")
def root():
    return {
        "message": "Sovereign AI Workbench backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok"
    }


@app.post("/chat")
def chat(request: ChatRequest):

    answer = ask_qwen(request.message)

    return {
        "answer": answer
    }