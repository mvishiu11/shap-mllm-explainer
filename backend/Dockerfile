# Use Python 3.12 as specified in pyproject.toml
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Install uv globally
RUN pip install uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install backend dependencies using uv sync (respects lock file)
# REMOVED the --system flag here
RUN uv sync

# Copy the entire backend application code
COPY . .

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application
# Use app.main:app which is the FastAPI instance in your main.py
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]