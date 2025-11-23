# Dockerfile
# Use the official Python 3.11.6 image
FROM python:3.11.6

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Set work directory
WORKDIR /code

# Copy requirements first for better caching
COPY requirements.txt /code/

RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy the whole project
COPY . /code/

# Run the main application
ENTRYPOINT ["python", "-m", "src.main"]
