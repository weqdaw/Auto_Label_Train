# Automated Vision Model Execution Platform (YOLO Auto-Trainer & Labeling Studio)

🌐 [中文版 (Chinese Version)](./README_zh.md)

A modern, local-first web application designed for collaborative dataset annotation and automated YOLO model training. The platform features role-based access controls, automatic image partitioning, a professional interactive web labeling studio (supporting bounding boxes and polygons), real-time training telemetry, and system resource diagnostics.

---

## 🚀 Key Features

### 👥 Multi-User Collaboration & RBAC (Role-Based Access Control)
- **Admin Role**:
  - Import raw datasets (ZIP format) and validate structure.
  - Download official YOLO weights or upload custom models.
  - Create labeling tasks, set classes, and assign specific labelers.
  - Manage team accounts (register users, audit progress, delete accounts).
  - Configure, start, stop, and audit YOLO training runs.
  - Download trained custom weights directly from the web interface.
- **Labeler (Regular User) Role**:
  - Simplified view: Access only the Dashboard and assigned tasks.
  - Restricted image boundaries: Users can only see and edit images partitioned to them.
- **Even Image Partitioning**: Automatic **Round-Robin partitioning** distributes images evenly among assigned labelers upon task creation.

### 🎨 Interactive Web Labeling Studio
- **Object Detection (Bounding Boxes)**: Click-and-drag box drawing, drag repositioning, and 8-point handle resizing.
- **Semantic Segmentation (Polygons)**: Continuous click vertex placement, automatic closure, and draggable vertex points for boundary refinement.
- **Control Deck**: View navigation, image zoom (in/out/reset), hotkeys (numeric keys for classes, `Ctrl+S` to save, `Delete` to remove, `Esc` to cancel), and canvas scale mapping.
- **Dataset Export**: One-click consolidation and validation that exports annotations directly into train/val split YOLO structures with automatic `data.yaml` generation.

### ⚡ Automated YOLO Training Workshop
- **Hyperparameter Tweaking**: Configure epochs, batch sizes, image sizes, and computing devices (CPU or CUDA GPUs).
- **Subprocess Training Isolation**: Training runs are offloaded to independent background workers (`train_worker.py`) to prevent server blocks or memory leaks.
- **Real-Time Telemetry**: Real-time streaming logs via WebSockets and live validation graphs (losses, precision, recall, mAP50, and mAP50-95) rendered with Recharts.

### 🖥️ Diagnostics Dashboard
- Live tracking of system performance: CPU percentage, RAM load (GB used vs. total), and CUDA GPU status (detection, count, and model name).

---

## 🛠️ Technology Stack

- **Backend**:
  - [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) for async REST API & WebSockets.
  - [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) for the training engine.
  - PyTorch (with CUDA support if available).
  - Persistent storage in JSON files (no heavy database setup required).
- **Frontend**:
  - [React](https://react.dev/) + [Vite](https://vite.dev/) for an ultra-fast HMR workflow.
  - [Recharts](https://recharts.org/) for responsive training charts.
  - [Lucide Icons](https://lucide.dev/) for crisp modern iconography.
  - Styled with HSL variable-based **Vanilla CSS** supporting dark-mode glassmorphism.

---

## 📦 Getting Started & Installation

### Prerequisites
- Python 3.8 or higher
- Node.js (v16+) and npm

### Local Launch (One-Click Bootstrapper)
The project includes a Python launcher (`run.py`) that fully automates the environment setup:

1. Open your terminal in the repository root folder.
2. Run the bootstrapper:
   ```bash
   python run.py
   ```
3. The script will automatically:
   - Create a Python virtual environment (`.venv`) and install all required pip packages.
   - Run `npm install` for frontend node packages.
   - Launch the FastAPI Backend on port `8000`.
   - Launch the React Frontend on port `5500` (port `5500` is selected to bypass default Windows Hyper-V port exclusion conflicts).
   - Launch your default web browser to **`http://127.0.0.1:5500`**.

### Default Credentials
- **Username**: `admin`
- **Password**: `admin123`

*Note: The admin account is pre-seeded on first run. Regular labelers can be created by clicking the register toggle on the login screen or via the Admin interface.*

---

## 📂 Project Structure

```
├── backend/                  # FastAPI Application
│   ├── data/                 # SQLite/JSON file databases & annotations storage
│   ├── dataset_manager.py    # Dataset ZIP handlers & YAML validation
│   ├── label_manager.py      # Task configurations & YOLO dataset export engine
│   ├── main.py               # API endpoints, WebSocket connection & token auth guards
│   ├── train_worker.py       # Independent YOLO training subprocess
│   ├── user_manager.py       # Hashing, salt auth & stateless token generator
│   └── yolo_manager.py       # Active training queue & telemetry scraper
├── frontend/                 # React SPA (Vite)
│   ├── src/
│   │   ├── components/       # Workspace widgets (Labeling, UserManager, Training, etc.)
│   │   ├── App.jsx           # Application shell & token session validation
│   │   ├── index.css         # Dark theme CSS variables & layout utilities
│   │   └── main.jsx
│   ├── package.json          # Node scripts and dev dependencies
│   └── vite.config.js        # Server configurations & proxy settings
├── run.py                    # Multi-platform Python bootsrapper launcher
└── requirements.txt          # Python dependencies
```

---

## 🔒 Security & API Access Control
- **Stateless Tokens**: User sessions are validated via signed signature tokens (`username.role.signature`) generated with SHA-256 and a persistent secret key.
- **Media Security**: Static files (raw task images) and real-time WebSockets are secured via token query string overrides (`?token=...`), ensuring no unauthorized users can stream images or intercept training console logs.
