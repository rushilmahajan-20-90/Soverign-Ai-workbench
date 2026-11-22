FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /worker

RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 10001 worker

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY worker.py .

RUN mkdir -p /input /output && chown -R worker:worker /input /output /worker

USER 10001:10001

ENTRYPOINT ["python", "-I", "/worker/worker.py"]
