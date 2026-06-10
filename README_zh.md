# 自动化视觉模型运行平台 (YOLO Auto-Trainer & Labeling Studio)

🌐 [English Version (英文版)](./README.md)

这是一款面向本地局域网团队协作的视觉算法平台。本系统集成了**多用户协作在线标注（支持目标检测与语义分割）**、**YOLO 自动化模型训练**、**模型权重管理**以及**系统资源实时监测**等功能，旨在帮助团队以零配置、全自动化的方式完成从数据采集标注到模型部署输出的闭环。

---

## 🚀 核心功能介绍

### 👥 多人协同标注与角色访问控制 (RBAC)
- **管理员 (Admin) 权限**：
  - 导入原始数据集（ZIP 压缩包格式）并进行格式校验。
  - 在线下载官方 YOLO 预训练权重或上传自定义的 `.pt` 权重文件。
  - 创建标注任务，定义标注类别（Classes），并指派多名不同的员工。
  - 团队成员管理（注册新员工账号、查看标注进度、注销废弃账户）。
  - 创建并开启 YOLO 自动化训练任务，实时中断或删除运行记录。
  - 训练完成后，一键下载导出的最佳权重。
- **标注员 (Labeler) 权限**：
  - 精简版的控制台：只能访问个人仪表盘和指派给自己的标注任务。
  - 数据安全隔离：通过 **Round-Robin（均匀轮询）算法**，在任务创建时将图片均匀且唯一地分配给被指派的员工，标注员只能查看和修改属于自己分配名下的图片。

### 🎨 交互式网页标注工作室
- **目标检测 (Object Detection)**：支持鼠标拖拽绘制 Bounding Box 矩形框，点击选中后可进行整体平移或通过 8 个拉伸控制点进行缩放。
- **语义分割 (Semantic Segmentation)**：支持鼠标连续点击打点以生成多边形，点击起点或按 `Enter` 键闭合，且支持拖拽已有顶点微调多边形边缘。
- **辅助功能板**：支持画布整体拖拽平移、滚轮缩放、一键复位，并配有快捷键（数字键 `0-9` 快速选类别、`Ctrl+S` 保存、`Delete` 删除选中图形、`Esc` 取消绘制）。
- **一键导出数据集**：自动汇总所有员工的标注数据，按 8:2 的比例随机划分训练集/验证集，生成标准 YOLO 目录结构及对应的 `data.yaml` 配置文件。

### ⚡ 自动化 YOLO 训练中心
- **超参可视化配置**：在线调节迭代轮数 (Epochs)、批大小 (Batch Size)、图片输入尺寸 (Imgsz) 以及训练计算设备（CPU 或特定的 CUDA GPU 核心）。
- **子进程训练隔离**：通过独立的 `train_worker.py` 后台进程执行 YOLO 训练，防止 GPU 显存泄漏或长时间阻塞 FastAPI 主接口事件循环。
- **实时监控面板**：使用 WebSocket 实时向网页端推送终端控制台日志，并使用 Recharts 渲染训练损失曲线及各项验证精确度指标（Precision, Recall, mAP50, mAP50-95）。

### 🖥️ 系统状态诊断
- 实时获取主机运行指标，包括：CPU 占用率、物理内存 (RAM) 占用及剩余 GB、NVIDIA GPU 核心识别及显卡驱动名称。

---

## 🛠️ 技术栈构成

- **后端服务**：
  - [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) 提供高并发异步 REST API 及 WebSocket 传输。
  - [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) 提供底层视觉模型训练引擎。
  - PyTorch（在支持 CUDA 的机器上自动启用 GPU 加速）。
  - 本地轻量化 JSON 文件数据持久化（开箱即用，无需配置复杂的外部数据库）。
- **前端界面**：
  - [React](https://react.dev/) + [Vite](https://vite.dev/) 支撑毫秒级热更新开发流。
  - [Recharts](https://recharts.org/) 渲染流畅的损失与精度走势图表。
  - [Lucide Icons](https://lucide.dev/) 支撑精美清爽的 UI 图标。
  - 基于 HSL 变量的 **Vanilla CSS** 样式系统，提供深色玻璃拟物化视觉（Glassmorphism）。

---

## 📦 快速开始与本地部署

### 前置要求
- Python 3.8 或更高版本
- Node.js (v16+) 及其包管理器 npm

### 本地一键启动 (自动化启动脚本)
项目自带 Python 启动器 `run.py`，它会为您打通所有环境依赖：

1. 打开终端（或 PowerShell），定位到项目根目录。
2. 运行一键启动脚本：
   ```bash
   python run.py
   ```
3. 该脚本将全自动执行：
   - 创建 Python 虚拟环境 (`.venv`) 并升级安装 `requirements.txt` 中所有的库。
   - 自动运行 `npm install` 下载前端依赖。
   - 在后台启动 FastAPI 后端服务（端口 `8000`）。
   - 在后台启动 Vite 前端开发服务器（监听端口 **`5500`**，为了防止 Windows 下 Docker/Hyper-V 常见的随机保留端口段冲突，已避开 `5173` 区域）。
   - 自动在默认浏览器中为您打开 **`http://127.0.0.1:5500`** 并渲染平台主页。

### 初始管理员账户
- **用户名**：`admin`
- **密码**：`admin123`

*提示：此管理员账户在首次运行系统时会自动创建。普通员工账号可以由管理员在“团队人员管理”页进行注销，或在登录页面点击“切换注册”来自行注册申请。*

---

## 📂 项目目录结构说明

```
├── backend/                  # FastAPI 后端源码
│   ├── data/                 # 标注数据、用户库 JSON 及任务缓存目录
│   ├── dataset_manager.py    # 数据集 ZIP 上传解压与 YAML 校验模块
│   ├── label_manager.py      # 多人图片轮询分配与 YOLO 标注数据集导出引擎
│   ├── main.py               # API 路由网关、WebSocket 服务器及 Token 安全验证依赖
│   ├── train_worker.py       # 独立 YOLO 训练的后台守护进程
│   ├── user_manager.py       # 加盐密码哈希认证与无状态签名会话 Token 生成器
│   └── yolo_manager.py       # 训练历史队列管理与指标提取器
├── frontend/                 # React 网页前端源码
│   ├── src/
│   │   ├── components/       # 系统各交互模块（标注画布、用户中心、训练监控等）
│   │   ├── App.jsx           # 导航栏骨架与 Token 登录校验拦截
│   │   ├── index.css         # 极光霓虹深色主题样式系统
│   │   └── main.jsx
│   ├── package.json          # Node 脚本及前端依赖库
│   └── vite.config.js        # Vite 端口服务与代理网关配置
├── run.py                    # 跨平台 Python 一键拉起环境脚本
└── requirements.txt          # Python 依赖清单
```

---

## 🔒 接口安全机制
- **无状态签名 Token**：所有接口均受签名 Token 保护，格式为 `username.role.signature`。该 Signature 由加盐散列结合本地持久化私钥 (`secret_key.txt`) 运算得出。
- **媒体流及套接字访问**：静态图片流 `/api/label/tasks/.../image-content/...` 以及 WebSocket 状态接口不支持自定义 Header 传输，系统内部已支持 Query 参数形式传递 `?token=...` 来验证身份，严防资源未经授权流出。
