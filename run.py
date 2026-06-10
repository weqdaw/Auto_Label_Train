import os
import sys
import subprocess
import threading
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).parent.absolute()
VENV_DIR = ROOT_DIR / ".venv"
FRONTEND_DIR = ROOT_DIR / "frontend"

def log(msg):
    print(f"\n====== [LAUNCHER] {msg} ======")

def run_command(cmd, cwd=None, shell=True, check=True):
    return subprocess.run(cmd, cwd=cwd, shell=shell, check=check)

def get_venv_python():
    if sys.platform == "win32":
        return str(VENV_DIR / "Scripts" / "python.exe")
    return str(VENV_DIR / "bin" / "python")

def get_venv_pip():
    if sys.platform == "win32":
        return str(VENV_DIR / "Scripts" / "pip.exe")
    return str(VENV_DIR / "bin" / "pip")

def setup_python_venv():
    """Sets up Python Virtual Environment and installs requirements."""
    if not VENV_DIR.exists():
        log("创建 Python 虚拟环境 (.venv)...")
        run_command(f'"{sys.executable}" -m venv "{VENV_DIR}"')
    
    venv_python = get_venv_python()
    log("更新 pip 并安装 Python 依赖项...")
    # First upgrade pip
    run_command(f'"{venv_python}" -m pip install --upgrade pip')
    # Install requirements
    req_file = ROOT_DIR / "requirements.txt"
    run_command(f'"{venv_python}" -m pip install -r "{req_file}"')

def setup_frontend():
    """Installs node packages in the frontend folder."""
    if not (FRONTEND_DIR / "node_modules").exists():
        log("安装前端依赖项 (npm install)...")
        run_command("npm install --cache .npm-cache", cwd=str(FRONTEND_DIR))

def run_process_and_log(cmd, cwd, prefix):
    """Run process and stream its output with a prefix."""
    process = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    def log_stream():
        for line in iter(process.stdout.readline, ''):
            print(f"[{prefix}] {line.strip()}")
        process.stdout.close()
        
    thread = threading.Thread(target=log_stream, daemon=True)
    thread.start()
    return process

def main():
    try:
        # Step 1: Python environment setup
        setup_python_venv()
        
        # Step 2: Node environment setup
        setup_frontend()
        
        # Step 3: Start FastAPI Backend
        log("正在启动 FastAPI 后端服务 (端口 8000)...")
        venv_python = get_venv_python()
        # Set PYTHONPATH to root so backend module can be resolved
        env = os.environ.copy()
        env["PYTHONPATH"] = str(ROOT_DIR)
        
        # We start backend using uvicorn directly via python -m uvicorn
        backend_cmd = f'"{venv_python}" -m uvicorn backend.main:app --port 8000'
        backend_proc = run_process_and_log(backend_cmd, ROOT_DIR, "BACKEND")
        
        # Step 4: Start React Frontend
        log("正在启动 React 前端服务 (端口 5500)...")
        frontend_cmd = "npm run dev"
        frontend_proc = run_process_and_log(frontend_cmd, FRONTEND_DIR, "FRONTEND")
        
        # Step 5: Wait and open browser
        time.sleep(2)
        log("打开浏览器访问 YOLO 训练控制台...")
        webbrowser.open("http://127.0.0.1:5500")
        
        log("控制台已启动。按 Ctrl+C 终止所有服务。")
        while True:
            # Check if any process terminated
            if backend_proc.poll() is not None:
                log("后端服务异常退出，终止。")
                break
            if frontend_proc.poll() is not None:
                log("前端服务异常退出，终止。")
                break
            time.sleep(1)
            
    except KeyboardInterrupt:
        log("正在终止服务...")
    except Exception as e:
        log(f"启动失败: {str(e)}")
    finally:
        # Clean shutdown
        try:
            backend_proc.terminate()
            backend_proc.wait(timeout=2)
        except Exception:
            pass
        try:
            frontend_proc.terminate()
            frontend_proc.wait(timeout=2)
        except Exception:
            pass
        log("所有服务已成功关闭。")

if __name__ == "__main__":
    main()
