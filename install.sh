#!/bin/bash

# A one-shot installation script for the Pandoc Web Converter.
# This script downloads the necessary files and starts the application via Docker.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
# GitHub repository details (uses the 'main' branch)
REPO_USER="clayauld"
REPO_NAME="pandoc-md2pdf-web"
DEFAULT_BRANCH="main"
RAW_CONTENT_URL="https://raw.githubusercontent.com/${REPO_USER}/${REPO_NAME}/${DEFAULT_BRANCH}"

# Installation directory in the user's home
INSTALL_DIR="${HOME}/pandoc-md2pdf-web"
SERVER_DIR="${INSTALL_DIR}/server"
COMPOSE_FILE="${INSTALL_DIR}/docker-compose.yml"
ENV_FILE_SAMPLE="${SERVER_DIR}/.env.sample"
ENV_FILE="${SERVER_DIR}/.env"

# --- Functions ---

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# --- Main Script ---

echo "🚀 Starting Pandoc Web Converter Installation..."
echo "This will install the application in: ${INSTALL_DIR}"

# 1. Check for prerequisites: Docker, Docker Compose, and curl
if ! command_exists docker; then
  echo "❌ Error: Docker is not installed. Please install Docker before running."
  echo "Installation guide: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ Error: 'docker compose' is not available. Please ensure a modern version of Docker is installed."
  exit 1
fi

if ! command_exists curl; then
  echo "❌ Error: curl is not installed. Please install it to continue."
  exit 1
fi

echo "✅ Prerequisites met."

# 2. Create installation directories
echo "📁 Creating installation directory at ${INSTALL_DIR}..."
mkdir -p "${SERVER_DIR}"

# 3. Create the docker-compose.yml file using the pre-built image
echo "📦 Creating docker-compose.yml..."
cat > "${COMPOSE_FILE}" << EOL
services:
  web:
    image: ghcr.io/${REPO_USER}/${REPO_NAME}:latest
    ports:
      - "8080:8080"
    env_file:
      - ./server/.env
    restart: unless-stopped
EOL

# 4. Download the .env.sample file
echo "📋 Downloading configuration file..."
curl -sSL "${RAW_CONTENT_URL}/server/.env.sample" -o "${ENV_FILE_SAMPLE}"

if [ ! -f "${ENV_FILE_SAMPLE}" ]; then
    echo "❌ Error: Failed to download .env.sample. Please check the repository URL and your connection."
    exit 1
fi

# 5. Create .env from sample
if [ -f "${ENV_FILE}" ]; then
  echo "ℹ️ ${ENV_FILE} already exists. Skipping creation."
else
  echo "✅ Copying .env.sample to .env."
  cp "${ENV_FILE_SAMPLE}" "${ENV_FILE}"
fi

# 6. Start the application
echo "🐳 Starting the application with Docker Compose..."
# Navigate to the directory to ensure docker-compose finds the file
cd "${INSTALL_DIR}"
docker compose up -d

echo ""
echo "🎉 Installation complete!"
echo "➡️ Application is running at http://localhost:8080"
echo "➡️ Files are located in ${INSTALL_DIR}"
echo "➡️ To stop the application, run: cd ${INSTALL_DIR} && docker compose down"
