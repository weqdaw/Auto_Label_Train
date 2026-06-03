import os
import asyncio
import psutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json

from backend.dataset_manager import DatasetManager
from backend.yolo_manager import YoloManager

app = FastAPI(title="YOLO Auto-Trainer API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Managers
dataset_manager = DatasetManager()
yolo_manager = YoloManager()

# API Routes

@app.get("/api/system/status")
async def get_system_status():
    """Get system CPU, RAM, and GPU status."""
    cpu_percent = psutil.cpu_percent(interval=None)
    memory = psutil.virtual_memory()
    
    gpu_info = {
        "cuda_available": False,
        "gpu_count": 0,
        "gpu_name": None
    }
    try:
        import torch
        gpu_info["cuda_available"] = torch.cuda.is_available()
        gpu_info["gpu_count"] = torch.cuda.device_count()
        if gpu_info["cuda_available"]:
            gpu_info["gpu_name"] = torch.cuda.get_device_name(0)
    except Exception:
        pass
        
    return {
        "cpu_percent": cpu_percent,
        "ram_percent": memory.percent,
        "ram_used_gb": round(memory.used / (1024**3), 2),
        "ram_total_gb": round(memory.total / (1024**3), 2),
        "gpu": gpu_info
    }

# Model Endpoints
@app.get("/api/models")
async def list_models():
    return yolo_manager.list_models()

@app.post("/api/models/download")
async def download_model(payload: dict):
    model_name = payload.get("model_name")
    if not model_name:
        raise HTTPException(status_code=400, detail="model_name is required")
    try:
        yolo_manager.download_model(model_name)
        return {"status": "started", "message": f"Downloading {model_name} in background."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/models/upload")
async def upload_model(file: UploadFile = File(...)):
    try:
        content = await file.read()
        res = yolo_manager.save_custom_model(file.filename, content)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Dataset Endpoints
@app.get("/api/datasets")
async def list_datasets():
    return dataset_manager.list_datasets()

@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP format datasets are supported.")
    try:
        content = await file.read()
        info = dataset_manager.save_and_extract_dataset(file.filename, content)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/datasets/{name}")
async def delete_dataset(name: str):
    success = dataset_manager.delete_dataset(name)
    if not success:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"status": "deleted"}

# Training Endpoints
@app.get("/api/runs")
async def list_runs():
    return yolo_manager.list_runs()

@app.post("/api/runs/start")
async def start_training(payload: dict):
    model_name = payload.get("model_name")
    dataset_name = payload.get("dataset_name")
    epochs = int(payload.get("epochs", 10))
    batch_size = int(payload.get("batch_size", 16))
    imgsz = int(payload.get("imgsz", 640))
    device = payload.get("device", "cpu")

    if not model_name or not dataset_name:
        raise HTTPException(status_code=400, detail="model_name and dataset_name are required")

    # Get dataset info to find yaml
    ds_info = dataset_manager.get_dataset_info(dataset_name)
    if not ds_info or not ds_info["is_valid"]:
        raise HTTPException(status_code=400, detail="Invalid dataset folder or data.yaml missing")

    try:
        run_id = yolo_manager.start_training(
            model_name=model_name,
            dataset_name=dataset_name,
            dataset_yaml_path=ds_info["yaml_path"],
            epochs=epochs,
            batch_size=batch_size,
            imgsz=imgsz,
            device=device
        )
        return {"run_id": run_id, "status": "started"}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/runs/{run_id}/cancel")
async def cancel_training(run_id: str):
    success = yolo_manager.cancel_training(run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Active training run not found")
    return {"status": "cancelled"}

@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: str):
    success = yolo_manager.delete_run(run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "deleted"}

@app.get("/api/runs/{run_id}/weights")
async def get_run_weights(run_id: str):
    return yolo_manager.get_run_weights(run_id)

@app.get("/api/runs/{run_id}/weights/download/{filename}")
async def download_run_weight(run_id: str, filename: str):
    weight_path = Path(yolo_manager.RUNS_DIR) / run_id / "weights" / filename
    if not weight_path.exists():
        raise HTTPException(status_code=404, detail=f"Weight file {filename} not found for run {run_id}")
    return FileResponse(
        path=str(weight_path),
        filename=filename,
        media_type="application/octet-stream"
    )

# WebSocket connection for real-time progress updates
@app.websocket("/api/runs/{run_id}/ws")
async def run_websocket(websocket: WebSocket, run_id: str):
    await websocket.accept()
    
    # Send initial data
    try:
        run_data = yolo_manager.get_run_progress(run_id)
        await websocket.send_json(run_data)
        
        # Poll progress file and send updates
        last_epoch = -1
        last_progress = -1.0
        last_status = ""
        
        while True:
            # We fetch full state
            run_data = yolo_manager.get_run_progress(run_id)
            current_status = run_data.get("status")
            current_epoch = run_data.get("epoch")
            current_progress = run_data.get("progress")
            
            # Send updates if anything changed or if it's running
            if (current_status != last_status or 
                current_epoch != last_epoch or 
                current_progress != last_progress or 
                current_status in ["running", "training", "starting"]):
                
                await websocket.send_json(run_data)
                
                last_status = current_status
                last_epoch = current_epoch
                last_progress = current_progress
            
            # Stop polling if finished
            if current_status in ["completed", "failed", "cancelled", "finished"]:
                break
                
            await asyncio.sleep(1.0)
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass

# Serve static frontend files in production if they exist
frontend_build_path = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_build_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_build_path), html=True), name="frontend")
else:
    # Minimal home endpoint if frontend is not built
    @app.get("/")
    async def index():
        return {"message": "YOLO Trainer Backend Running. Build frontend to serve web interface."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
