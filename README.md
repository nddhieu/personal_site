# Personal Site

Welcome to the personal site project repository. This project consists of a frontend web interface and a backend service.

## Project Structure

- **Frontend**: Located in this directory ([personal_site](file:///D:/github/personal_site)). A vanilla HTML/CSS/JS application served by a lightweight Node.js server.
- **Backend**: Located in the adjacent directory ([personal_site_backend](file:///D:/github/personal_site_backend)). A FastAPI service that handles database integration and LLM (Ollama) operations.

---

## How to Start the Services

### 1. Frontend

The frontend is served using a vanilla Node.js script. It does not require any `npm` dependencies.

To start the frontend server:
1. Open a terminal in this directory.
2. Run the following command:
   ```bash
   node server.js
   ```
3. Open [http://localhost:4000](http://localhost:4000) in your browser.

### 2. Backend

The backend is built with Python and FastAPI.

To start the backend server:
1. Open a terminal in the `personal_site_backend` directory:
   ```bash
   cd ../personal_site_backend
   ```
2. Run the server using the virtual environment:
   ```powershell
   .venv\Scripts\python.exe main.py
   ```
3. The API will be available at [http://localhost:8001](http://localhost:8001).
