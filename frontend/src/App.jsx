import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Database, FileBox, Play, Terminal, HelpCircle, Activity } from 'lucide-react';
import Dashboard from './components/Dashboard';
import DatasetManager from './components/DatasetManager';
import ModelHub from './components/ModelHub';
import TrainingWorkspace from './components/TrainingWorkspace';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [systemStatus, setSystemStatus] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [models, setModels] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);

  // Initial Fetches
  useEffect(() => {
    fetchSystemStatus();
    fetchDatasets();
    fetchModels();
    fetchRuns();

    // Set up polling intervals
    const statusInterval = setInterval(fetchSystemStatus, 4000);
    const runsInterval = setInterval(fetchRuns, 3000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(runsInterval);
    };
  }, []);

  const fetchSystemStatus = async () => {
    try {
      const res = await fetch('/api/system/status');
      const data = await res.json();
      setSystemStatus(data);
    } catch (err) {
      console.error("Failed to fetch system status:", err);
    }
  };

  const fetchDatasets = async () => {
    try {
      const res = await fetch('/api/datasets');
      const data = await res.json();
      setDatasets(data);
    } catch (err) {
      console.error("Failed to fetch datasets:", err);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      setModels(data);
    } catch (err) {
      console.error("Failed to fetch models:", err);
    }
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/runs');
      const data = await res.json();
      setRuns(data);
    } catch (err) {
      console.error("Failed to fetch runs:", err);
    }
  };

  // Actions
  const handleUploadDataset = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch('/api/datasets/upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "导入数据集失败");
    }
    await fetchDatasets();
  };

  const handleDeleteDataset = async (name) => {
    if (window.confirm(`确认删除数据集 "${name}" 吗？此操作将彻底删除本地文件夹。`)) {
      const res = await fetch(`/api/datasets/${name}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchDatasets();
      }
    }
  };

  const handleDownloadModel = async (modelName) => {
    const res = await fetch('/api/models/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model_name: modelName })
    });
    if (res.ok) {
      fetchModels();
    }
  };

  const handleUploadModel = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch('/api/models/upload', {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "上传模型失败");
    }
    await fetchModels();
  };

  const handleStartTraining = async (config) => {
    const res = await fetch('/api/runs/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "启动训练进程失败");
    }
    await fetchRuns();
    return data.run_id;
  };

  const handleCancelTraining = async (runId) => {
    const res = await fetch(`/api/runs/${runId}/cancel`, {
      method: 'POST'
    });
    if (res.ok) {
      fetchRuns();
    }
  };

  const handleDeleteRun = async (runId) => {
    const res = await fetch(`/api/runs/${runId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      if (selectedRunId === runId) {
        setSelectedRunId(null);
      }
      fetchRuns();
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">Y</div>
          <div className="brand-title">YOLO Trainer</div>
        </div>

        <ul className="nav-menu">
          <li 
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
            id="nav-dashboard"
          >
            <LayoutDashboard size={18} />
            <span>控制中心</span>
          </li>
          
          <li 
            className={`nav-item ${view === 'datasets' ? 'active' : ''}`}
            onClick={() => setView('datasets')}
            id="nav-datasets"
          >
            <Database size={18} />
            <span>数据集管理</span>
          </li>

          <li 
            className={`nav-item ${view === 'models' ? 'active' : ''}`}
            onClick={() => setView('models')}
            id="nav-models"
          >
            <FileBox size={18} />
            <span>模型权重库</span>
          </li>

          <li 
            className={`nav-item ${view === 'training' ? 'active' : ''}`}
            onClick={() => { setView('training'); }}
            id="nav-training"
          >
            <Play size={18} />
            <span>模型训练</span>
          </li>
        </ul>

        <div style={{ padding: '20px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '8px', color: 'var(--text-muted)', fontSize: '0.8rem', alignItems: 'center' }}>
          <HelpCircle size={14} />
          <span>v1.0.0 (本地环境)</span>
        </div>
      </aside>

      {/* Header bar for global metrics */}
      <header className="top-bar">
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-success)', display: 'inline-block' }}></span>
            <span>API 服务: 正常</span>
          </div>
        </div>
        
        {runs.some(r => ['running', 'training', 'starting'].includes(r.status)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontSize: '0.85rem', fontWeight: 500 }}>
            <Activity className="pulse-dots" size={14} />
            <span>正在执行 YOLO 训练...</span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {view === 'dashboard' && (
          <Dashboard 
            systemStatus={systemStatus} 
            datasets={datasets} 
            models={models} 
            runs={runs} 
            setView={setView} 
          />
        )}
        {view === 'datasets' && (
          <DatasetManager 
            datasets={datasets} 
            onUploadDataset={handleUploadDataset} 
            onDeleteDataset={handleDeleteDataset} 
          />
        )}
        {view === 'models' && (
          <ModelHub 
            models={models} 
            onDownloadModel={handleDownloadModel} 
            onUploadModel={handleUploadModel}
            fetchModels={fetchModels}
          />
        )}
        {view === 'training' && (
          <TrainingWorkspace 
            datasets={datasets} 
            models={models} 
            runs={runs} 
            startTraining={handleStartTraining} 
            cancelTraining={handleCancelTraining} 
            deleteRun={handleDeleteRun}
            selectedRunId={selectedRunId}
            setSelectedRunId={setSelectedRunId}
          />
        )}
      </main>
    </div>
  );
}
