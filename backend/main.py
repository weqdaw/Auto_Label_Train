import os
import asyncio
import psutil
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from typing import Optional
import json

from backend.dataset_manager import DatasetManager
from backend.yolo_manager import YoloManager
from backend.label_manager import LabelManager
from backend.user_manager import UserManager

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
label_manager = LabelManager()
user_manager = UserManager()

# Authentication Dependencies

async def get_current_user(
    authorization: Optional[str] = Header(None),
    token: Optional[str] = Query(None)
):
    actual_token = None
    if authorization and authorization.startswith("Bearer "):
        actual_token = authorization.split(" ")[1]
    elif token:
        actual_token = token
        
    if not actual_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未登录，请求未授权！"
        )
    user = user_manager.verify_token(actual_token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="会话已过期，请重新登录！"
        )
    return user

async def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅管理员有权执行此操作！"
        )
    return current_user

# --- AUTH ROUTES ---

@app.post("/api/auth/register")
async def register(payload: dict):
    username = payload.get("username")
    password = payload.get("password")
    display_name = payload.get("display_name", "")
    try:
        res = user_manager.register_user(username, password, display_name)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/login")
async def login(payload: dict):
    username = payload.get("username")
    password = payload.get("password")
    try:
        res = user_manager.authenticate_user(username, password)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# --- ADMIN USER MANAGEMENT ROUTES ---

@app.get("/api/admin/users")
async def list_users(current_user: dict = Depends(require_admin)):
    return user_manager.list_users()

@app.delete("/api/admin/users/{username}")
async def delete_user(username: str, current_user: dict = Depends(require_admin)):
    try:
        success = user_manager.delete_user(username)
        if not success:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "deleted"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- SYSTEM ROUTES ---

@app.get("/api/system/status")
async def get_system_status(current_user: dict = Depends(get_current_user)):
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

# --- MODEL HUB ROUTES (Admin Only) ---

@app.get("/api/models")
async def list_models(current_user: dict = Depends(get_current_user)):
    return yolo_manager.list_models()

@app.post("/api/models/download")
async def download_model(payload: dict, current_user: dict = Depends(require_admin)):
    model_name = payload.get("model_name")
    if not model_name:
        raise HTTPException(status_code=400, detail="model_name is required")
    try:
        yolo_manager.download_model(model_name)
        return {"status": "started", "message": f"Downloading {model_name} in background."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/models/upload")
async def upload_model(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    try:
        content = await file.read()
        res = yolo_manager.save_custom_model(file.filename, content)
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- DATASET ROUTES (Admin Only) ---

@app.get("/api/datasets")
async def list_datasets(current_user: dict = Depends(require_admin)):
    return dataset_manager.list_datasets()

@app.post("/api/datasets/upload")
async def upload_dataset(file: UploadFile = File(...), current_user: dict = Depends(require_admin)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only ZIP format datasets are supported.")
    try:
        content = await file.read()
        info = dataset_manager.save_and_extract_dataset(file.filename, content)
        return info
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/datasets/{name}")
async def delete_dataset(name: str, current_user: dict = Depends(require_admin)):
    success = dataset_manager.delete_dataset(name)
    if not success:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"status": "deleted"}

# --- TRAINING RUN ROUTES (Admin Only) ---

@app.get("/api/runs")
async def list_runs(current_user: dict = Depends(require_admin)):
    return yolo_manager.list_runs()

@app.post("/api/runs/start")
async def start_training(payload: dict, current_user: dict = Depends(require_admin)):
    model_name = payload.get("model_name")
    dataset_name = payload.get("dataset_name")
    epochs = int(payload.get("epochs", 10))
    batch_size = int(payload.get("batch_size", 16))
    imgsz = int(payload.get("imgsz", 640))
    device = payload.get("device", "cpu")

    if not model_name or not dataset_name:
        raise HTTPException(status_code=400, detail="model_name and dataset_name are required")

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
async def cancel_training(run_id: str, current_user: dict = Depends(require_admin)):
    success = yolo_manager.cancel_training(run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Active training run not found")
    return {"status": "cancelled"}

@app.delete("/api/runs/{run_id}")
async def delete_run(run_id: str, current_user: dict = Depends(require_admin)):
    success = yolo_manager.delete_run(run_id)
    if not success:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"status": "deleted"}

@app.get("/api/runs/{run_id}/weights")
async def get_run_weights(run_id: str, current_user: dict = Depends(require_admin)):
    return yolo_manager.get_run_weights(run_id)

@app.get("/api/runs/{run_id}/weights/download/{filename}")
async def download_run_weight(run_id: str, filename: str, current_user: dict = Depends(require_admin)):
    weight_path = Path(yolo_manager.RUNS_DIR) / run_id / "weights" / filename
    if not weight_path.exists():
        raise HTTPException(status_code=404, detail=f"Weight file {filename} not found for run {run_id}")
    return FileResponse(
        path=str(weight_path),
        filename=filename,
        media_type="application/octet-stream"
    )

# --- LABELING TASKS ROUTES ---

@app.get("/api/label/tasks")
async def list_label_tasks(current_user: dict = Depends(get_current_user)):
    return label_manager.list_tasks(username=current_user["username"], role=current_user["role"])

@app.post("/api/label/tasks")
async def create_label_task(payload: dict, current_user: dict = Depends(require_admin)):
    name = payload.get("name")
    task_type = payload.get("type")
    image_folder_path = payload.get("image_folder_path")
    classes = payload.get("classes", [])
    assigned_users = payload.get("assigned_users", [])

    if not name or not task_type or not image_folder_path:
        raise HTTPException(status_code=400, detail="name, type, and image_folder_path are required")
    if task_type not in ["detection", "segmentation"]:
        raise HTTPException(status_code=400, detail="type must be detection or segmentation")
    if not assigned_users:
        raise HTTPException(status_code=400, detail="请至少指派一名标注人员")

    try:
        return label_manager.create_task(name, task_type, image_folder_path, classes, assigned_users)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/label/tasks/{task_id}")
async def delete_label_task(task_id: str, current_user: dict = Depends(require_admin)):
    success = label_manager.delete_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Labeling task not found")
    return {"status": "deleted"}

@app.get("/api/label/tasks/{task_id}/images")
async def get_label_task_images(task_id: str, current_user: dict = Depends(get_current_user)):
    try:
        return label_manager.get_task_images(task_id, username=current_user["username"], role=current_user["role"])
    except KeyError:
        raise HTTPException(status_code=404, detail="Task not found")

@app.get("/api/label/tasks/{task_id}/image-content/{filename}")
async def get_label_image_content(task_id: str, filename: str, current_user: dict = Depends(get_current_user)):
    try:
        img_path = label_manager.get_image_path(task_id, filename, username=current_user["username"], role=current_user["role"])
        return FileResponse(img_path)
    except KeyError:
        raise HTTPException(status_code=404, detail="Task not found")
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image file not found")

@app.get("/api/label/tasks/{task_id}/annotations/{filename}")
async def get_image_annotations(task_id: str, filename: str, current_user: dict = Depends(get_current_user)):
    try:
        return label_manager.get_image_annotations(task_id, filename, username=current_user["username"], role=current_user["role"])
    except KeyError:
        raise HTTPException(status_code=404, detail="Task not found")
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

@app.post("/api/label/tasks/{task_id}/annotations/{filename}")
async def save_image_annotations(task_id: str, filename: str, payload: dict, current_user: dict = Depends(get_current_user)):
    try:
        success = label_manager.save_image_annotations(task_id, filename, payload, username=current_user["username"], role=current_user["role"])
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save annotations")
        return {"status": "saved"}
    except KeyError:
        raise HTTPException(status_code=404, detail="Task not found")
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

@app.post("/api/label/tasks/{task_id}/export")
async def export_label_task(task_id: str, payload: dict = None, current_user: dict = Depends(require_admin)):
    val_split = 0.2
    if payload:
        val_split = float(payload.get("val_split", 0.2))

    try:
        res = label_manager.export_task_to_dataset(task_id, val_split)
        return res
    except KeyError:
        raise HTTPException(status_code=404, detail="Task not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- WEBSOCKETS ---

@app.websocket("/api/runs/{run_id}/ws")
async def run_websocket(websocket: WebSocket, run_id: str):
    # Authenticate WebSocket connection via token in query parameters
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
        
    user = user_manager.verify_token(token)
    if not user or user["role"] != "admin":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    
    try:
        run_data = yolo_manager.get_run_progress(run_id)
        await websocket.send_json(run_data)
        
        last_epoch = -1
        last_progress = -1.0
        last_status = ""
        
        while True:
            run_data = yolo_manager.get_run_progress(run_id)
            current_status = run_data.get("status")
            current_epoch = run_data.get("epoch")
            current_progress = run_data.get("progress")
            
            if (current_status != last_status or 
                current_epoch != last_epoch or 
                current_progress != last_progress or 
                current_status in ["running", "training", "starting"]):
                
                await websocket.send_json(run_data)
                
                last_status = current_status
                last_epoch = current_epoch
                last_progress = current_progress
            
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

# --- FRONTEND ASSETS ---

frontend_build_path = Path(__file__).parent.parent / "frontend" / "dist"
if frontend_build_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_build_path), html=True), name="frontend")
else:
    @app.get("/")
    async def index():
        return {"message": "YOLO Trainer Backend Running. Build frontend to serve web interface."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
