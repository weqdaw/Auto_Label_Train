import os
import sys
import shutil
import subprocess
import threading
import time
import json
import urllib.request
import psutil
from pathlib import Path
from typing import List, Dict, Any, Optional

MODELS_DIR = Path(__file__).parent / "data" / "models"
RUNS_DIR = Path(__file__).parent / "data" / "runs"
WORKER_SCRIPT = Path(__file__).parent / "train_worker.py"

MODEL_URLS = {
    # YOLOv8 models
    "yolov8n.pt": "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8n.pt",
    "yolov8s.pt": "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8s.pt",
    "yolov8m.pt": "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8m.pt",
    "yolov8l.pt": "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8l.pt",
    "yolov8x.pt": "https://github.com/ultralytics/assets/releases/download/v8.2.0/yolov8x.pt",
    # YOLO11 models
    "yolo11n.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt",
    "yolo11s.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s.pt",
    "yolo11m.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11m.pt",
    "yolo11l.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11l.pt",
    "yolo11x.pt": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11x.pt",
}

class YoloManager:
    def __init__(self):
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        self.downloads = {}  # model_name -> {progress, status, error}
        self.active_runs = {}  # run_id -> {process, thread, log_path, progress_path, status}
        self._load_past_runs()

    def _load_past_runs(self):
        """Clean up or load previous run configurations if any."""
        pass

    def list_models(self) -> List[Dict[str, Any]]:
        """List all models in the models directory and online models."""
        local_models = []
        if MODELS_DIR.exists():
            for item in MODELS_DIR.iterdir():
                if item.is_file() and item.suffix == ".pt":
                    local_models.append({
                        "name": item.name,
                        "path": str(item.absolute()).replace("\\", "/"),
                        "size": item.stat().st_size,
                        "status": "downloaded"
                    })

        local_names = {m["name"] for m in local_models}
        
        models = list(local_models)
        for name, url in MODEL_URLS.items():
            if name not in local_names:
                download_state = self.downloads.get(name, {"status": "online", "progress": 0})
                models.append({
                    "name": name,
                    "url": url,
                    "status": download_state["status"],
                    "progress": download_state["progress"],
                    "size": None
                })
        return models

    def download_model(self, model_name: str):
        """Start downloading an official model in a background thread."""
        if model_name not in MODEL_URLS:
            raise ValueError(f"Unknown official model: {model_name}")

        url = MODEL_URLS[model_name]
        dest_path = MODELS_DIR / model_name

        if dest_path.exists():
            self.downloads[model_name] = {"status": "downloaded", "progress": 100}
            return

        if model_name in self.downloads and self.downloads[model_name]["status"] == "downloading":
            return

        self.downloads[model_name] = {"status": "downloading", "progress": 0}
        
        thread = threading.Thread(target=self._download_worker, args=(url, dest_path, model_name))
        thread.daemon = True
        thread.start()

    def _download_worker(self, url: str, dest_path: Path, model_name: str):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req) as response:
                total_size = int(response.info().get('Content-Length', 0))
                block_size = 1024 * 64
                downloaded = 0
                
                with open(dest_path, "wb") as f:
                    while True:
                        buffer = response.read(block_size)
                        if not buffer:
                            break
                        f.write(buffer)
                        downloaded += len(buffer)
                        if total_size > 0:
                            percent = int((downloaded / total_size) * 100)
                            self.downloads[model_name]["progress"] = percent

            self.downloads[model_name] = {"status": "downloaded", "progress": 100}
        except Exception as e:
            if dest_path.exists():
                dest_path.unlink()
            self.downloads[model_name] = {"status": "error", "progress": 0, "error": str(e)}

    def save_custom_model(self, file_name: str, file_content: bytes) -> Dict[str, Any]:
        """Save a custom uploaded .pt file."""
        if not file_name.endswith(".pt"):
            raise ValueError("Only .pt weight files are supported.")
        
        dest_path = MODELS_DIR / file_name
        with open(dest_path, "wb") as f:
            f.write(file_content)

        return {
            "name": file_name,
            "path": str(dest_path.absolute()).replace("\\", "/"),
            "size": dest_path.stat().st_size,
            "status": "downloaded"
        }

    def start_training(self, 
                       model_name: str, 
                       dataset_name: str, 
                       dataset_yaml_path: str,
                       epochs: int = 10,
                       batch_size: int = 16,
                       imgsz: int = 640,
                       device: str = "cpu") -> str:
        """Start a training job in a subprocess."""
        # Find model path
        model_path = MODELS_DIR / model_name
        if not model_path.exists():
            # If not in local data/models, check if it's an official model and download it
            if model_name in MODEL_URLS:
                self.download_model(model_name)
                # Wait or raise error. Let's raise error to tell frontend to download first
                raise FileNotFoundError(f"Model {model_name} is not downloaded yet. Please download it first.")
            else:
                raise FileNotFoundError(f"Model file not found: {model_name}")

        run_id = f"train_{int(time.time())}"
        run_dir = RUNS_DIR / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        log_path = run_dir / "console.log"
        progress_path = run_dir / "progress.json"

        # Construct python interpreter path
        python_exe = sys.executable

        # Prepare arguments
        cmd = [
            python_exe,
            str(WORKER_SCRIPT.absolute()),
            "--model", str(model_path.absolute()),
            "--data", str(dataset_yaml_path),
            "--epochs", str(epochs),
            "--batch", str(batch_size),
            "--imgsz", str(imgsz),
            "--device", str(device),
            "--project", str(RUNS_DIR.absolute()),
            "--name", run_id,
            "--progress-file", str(progress_path.absolute())
        ]

        # Start process
        log_file = open(log_path, "w", encoding="utf-8")
        
        # We need to set PYTHONPATH to include the parent of backend so train_worker is importable if needed
        env = os.environ.copy()
        env["PYTHONPATH"] = str(Path(__file__).parent.parent.absolute())

        process = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=str(Path(__file__).parent.absolute()),
            env=env
        )

        self.active_runs[run_id] = {
            "process": process,
            "log_path": log_path,
            "progress_path": progress_path,
            "status": "running",
            "model_name": model_name,
            "dataset_name": dataset_name,
            "epochs": epochs,
            "start_time": time.time()
        }

        # Spawn a watcher thread to close log_file when process finishes
        def watch_process(p, lf, rid):
            p.wait()
            lf.close()
            # Update state in memory if it hasn't been updated
            if rid in self.active_runs:
                # Read final progress JSON
                progress_data = self.get_run_progress(rid)
                if progress_data and progress_data.get("status") == "completed":
                    self.active_runs[rid]["status"] = "completed"
                elif progress_data and progress_data.get("status") == "failed":
                    self.active_runs[rid]["status"] = "failed"
                else:
                    self.active_runs[rid]["status"] = "finished"

        threading.Thread(target=watch_process, args=(process, log_file, run_id), daemon=True).start()

        return run_id

    def get_run_progress(self, run_id: str) -> Dict[str, Any]:
        """Read the progress JSON file for a given training run."""
        run_info = self.active_runs.get(run_id)
        
        # If not active, it might be a finished run from directory
        progress_path = RUNS_DIR / run_id / "progress.json"
        log_path = RUNS_DIR / run_id / "console.log"

        data = {
            "run_id": run_id,
            "status": "unknown",
            "progress": 0.0,
            "epoch": 0,
            "total_epochs": 0,
            "metrics": {},
            "losses": {},
            "logs": ""
        }

        if run_info:
            data.update({
                "model_name": run_info["model_name"],
                "dataset_name": run_info["dataset_name"],
                "epochs": run_info["epochs"],
                "status": run_info["status"]
            })

        if progress_path.exists():
            try:
                with open(progress_path, "r", encoding="utf-8") as f:
                    progress_data = json.load(f)
                    data.update(progress_data)
            except Exception:
                pass

        # Fetch last 50 lines of logs
        if log_path.exists():
            try:
                with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
                    data["logs"] = "".join(lines[-50:])
            except Exception:
                pass

        # Check if results.csv exists and parse it for graphing
        results_csv = RUNS_DIR / run_id / "results.csv"
        metrics_history = []
        if results_csv.exists():
            try:
                with open(results_csv, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                    if len(lines) > 1:
                        headers = [h.strip() for h in lines[0].split(",")]
                        for line in lines[1:]:
                            vals = [v.strip() for v in line.split(",")]
                            if len(vals) == len(headers):
                                row = {}
                                for h, v in zip(headers, vals):
                                    try:
                                        if h == "epoch":
                                            row[h] = int(v)
                                        else:
                                            row[h] = float(v)
                                    except ValueError:
                                        row[h] = v
                                metrics_history.append(row)
            except Exception:
                pass
        data["metrics_history"] = metrics_history

        return data

    def get_run_log_tail(self, run_id: str, last_n: int = 100) -> str:
        """Get the last N lines of logs."""
        log_path = RUNS_DIR / run_id / "console.log"
        if log_path.exists():
            try:
                with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()
                    return "".join(lines[-last_n:])
            except Exception as e:
                return f"Error reading logs: {str(e)}"
        return "Log file not found."

    def cancel_training(self, run_id: str) -> bool:
        """Cancel an active training job by killing the process and its children."""
        run_info = self.active_runs.get(run_id)
        if not run_info:
            return False

        process = run_info.get("process")
        if process and process.poll() is None:
            # Kill subprocess and all its children (which includes PyTorch training spawns)
            try:
                parent = psutil.Process(process.pid)
                for child in parent.children(recursive=True):
                    child.kill()
                parent.kill()
            except Exception:
                # Fallback simple terminate
                try:
                    process.kill()
                except Exception:
                    pass

            run_info["status"] = "cancelled"
            
            # Write cancelled status to progress file
            progress_path = run_info["progress_path"]
            try:
                with open(progress_path, "w", encoding="utf-8") as f:
                    json.dump({
                        "status": "cancelled",
                        "progress": 100.0,
                        "error": "Training was cancelled by the user."
                    }, f)
            except Exception:
                pass
            return True
        return False

    def list_runs(self) -> List[Dict[str, Any]]:
        """List all training runs in the directory."""
        runs = []
        if not RUNS_DIR.exists():
            return runs

        for item in RUNS_DIR.iterdir():
            if item.is_dir() and item.name.startswith("train_"):
                progress_data = self.get_run_progress(item.name)
                runs.append(progress_data)
        
        # Sort by run_id (time desc)
        runs.sort(key=lambda x: x.get("run_id", ""), reverse=True)
        return runs

    def get_run_weights(self, run_id: str) -> Dict[str, Any]:
        """Find the trained weights (.pt files) for a run."""
        run_weights_dir = RUNS_DIR / run_id / "weights"
        weights = []
        if run_weights_dir.exists():
            for f in run_weights_dir.iterdir():
                if f.is_file() and f.suffix == ".pt":
                    weights.append({
                        "name": f.name,
                        "size": f.stat().st_size,
                        "path": str(f.absolute()).replace("\\", "/")
                    })
        return {
            "run_id": run_id,
            "weights": weights
        }
    
    def delete_run(self, run_id: str) -> bool:
        """Delete training run folder."""
        self.cancel_training(run_id)
        run_dir = RUNS_DIR / run_id
        if run_dir.exists():
            shutil.rmtree(run_dir)
            if run_id in self.active_runs:
                del self.active_runs[run_id]
            return True
        return False
