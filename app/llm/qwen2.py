from ollama import Client

client = Client(host="http://127.0.0.1:11434")#11434 is ollama is default one 

MODEL_NAME = "qwen3.5:4b"


def ask_qwen(message: str, temperature: float = 0.7) -> str:
    temp = max(0.0, min(2.0, float(temperature)))
    response = client.chat(
        model=MODEL_NAME,
        messages=[
            {
                "role": "user",
                "content": message
            }
        ],
        options={"temperature": temp},
    )

    return response["message"]["content"]