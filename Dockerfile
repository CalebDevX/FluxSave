FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system appgroup \
    && adduser --system --group appgroup appuser

# Create downloads dir with correct permissions
RUN mkdir -p /app/static/downloads \
    && chown -R appuser:appgroup /app

COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir --upgrade --force-reinstall yt-dlp && \
    chmod 755 $(which yt-dlp)

# Switch to app user for security
USER appuser

COPY . .

EXPOSE 5000

# Allow Render to provide PORT via environment variable. Use shell form so $PORT expands.
ENV PORT=5000
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT} --workers 4 --timeout 180 --worker-class sync app:app"]
