from ollama import Client

client = Client(host="http://127.0.0.1:11434")#11434 is ollama is default one 

MODEL_NAME = "qwen3.5:4b"


def ask_qwen(message: str) -> str:
    response = client.chat(
        model=MODEL_NAME,
        messages=[
            {
                "role": "user",
                "content": message
            }
        ]
    )

    return response["message"]["content"]