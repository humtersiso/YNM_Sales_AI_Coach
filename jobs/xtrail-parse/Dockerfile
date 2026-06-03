FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py gemini_qa_extract.py ./
ENV PYTHONUNBUFFERED=1
ENTRYPOINT ["python", "main.py"]
