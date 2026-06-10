import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Database, FileBox, Play, Terminal, HelpCircle, Activity, Tag, Users, LogOut } from 'lucide-react';
import Dashboard from './components/Dashboard';
import DatasetManager from './components/DatasetManager';
import ModelHub from './components/ModelHub';
import TrainingWorkspace from './components/TrainingWorkspace';
import LabelingTaskCenter from './components/LabelingTaskCenter';
import LabelingWorkspace from './components/LabelingWorkspace';
import LoginRegister from './components/LoginRegister';
import UserManager from './components/UserManager';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('authToken') || null);
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('currentUser') || null);
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole') || null);
  const [displayName, setDisplayName] = useState(localStorage.getItem('userDisplayName') || null);
  const [view, setView] = useState('dashboard');
  const [systemStatus, setSystemStatus] = useState(null);
  const [datasets, setDatasets] = useState([]);
  const [models, setModels] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [labelingTasks, setLabelingTasks] = useState([]);
  const [selectedLabelingTask, setSelectedLabelingTask] = useState(null);

  // Initial Fetches
  useEffect(() => {
    if (!token) return;
    fetchSystemStatus();
    if (userRole === 'admin') {
      fetchDatasets();
      fetchRuns();
    }
    fetchModels();
    fetchLabelingTasks();

    // Set up polling intervals
    const statusInterval = setInterval(fetchSystemStatus, 4000);
    const runsInterval = setInterval(() => {
      if (userRole === 'admin') fetchRuns();
    }, 3000);
    const labelingInterval = setInterval(fetchLabelingTasks, 5000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(runsInterval);
      clearInterval(labelingInterval);
    };
  }, [token, userRole]);

  const fetchSystemStatus = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/system/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSystemStatus(data);
    } catch (err) {
      console.error("Failed to fetch system status:", err);
    }
  };

  const fetchDatasets = async () => {
    if (!token || userRole !== 'admin') return;
    try {
      const res = await fetch('/api/datasets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setDatasets(data);
    } catch (err) {
      console.error("Failed to fetch datasets:", err);
    }
  };

  const fetchModels = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/models', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setModels(data);
    } catch (err) {
      console.error("Failed to fetch models:", err);
    }
  };

  const fetchRuns = async () => {
    if (!token || userRole !== 'admin') return;
    try {
      const res = await fetch('/api/runs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setRuns(data);
    } catch (err) {
      console.error("Failed to fetch runs:", err);
    }
  };

  const fetchLabelingTasks = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/label/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setLabelingTasks(data);
    } catch (err) {
      console.error("Failed to fetch labeling tasks:", err);
    }
  };

  // Auth Handlers
  const handleLoginSuccess = (data) => {
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('currentUser', data.username);
    localStorage.setItem('userRole', data.role);
    localStorage.setItem('userDisplayName', data.display_name);
    setToken(data.token);
    setCurrentUser(data.username);
    setUserRole(data.role);
    setDisplayName(data.display_name);
    setView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userDisplayName');
    setToken(null);
    setCurrentUser(null);
    setUserRole(null);
    setDisplayName(null);
    setView('dashboard');
  };

  // Actions
  const handleUploadDataset = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch('/api/datasets/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
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
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchDatasets();
      }
    }
  };

  const handleDownloadModel = async (modelName) => {
    const res = await fetch('/api/models/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
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
      headers: { 'Authorization': `Bearer ${token}` },
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
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
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      fetchRuns();
    }
  };

  const handleDeleteRun = async (runId) => {
    const res = await fetch(`/api/runs/${runId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      if (selectedRunId === runId) {
        setSelectedRunId(null);
      }
      fetchRuns();
    }
  };

  const handleCreateLabelingTask = async (taskData) => {
    const res = await fetch('/api/label/tasks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(taskData)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "创建任务失败");
    }
    fetchLabelingTasks();
  };

  const handleDeleteLabelingTask = async (taskId) => {
    const res = await fetch(`/api/label/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      fetchLabelingTasks();
    }
  };

  const handleExportLabelingTask = async (taskId) => {
    const res = await fetch(`/api/label/tasks/${taskId}/export`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || "导出标注集失败");
    }
    fetchDatasets();
    fetchLabelingTasks();
    return data;
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">Y</div>
          <div className="brand-title">自动化视觉模型运行平台</div>
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

          {userRole === 'admin' && (
            <li
              className={`nav-item ${view === 'datasets' ? 'active' : ''}`}
              onClick={() => setView('datasets')}
              id="nav-datasets"
            >
              <Database size={18} />
              <span>数据集管理</span>
            </li>
          )}

          <li
            className={`nav-item ${['labeling', 'labeling-workspace'].includes(view) ? 'active' : ''}`}
            onClick={() => setView('labeling')}
            id="nav-labeling"
          >
            <Tag size={18} />
            <span>本地数据标注</span>
          </li>

          {userRole === 'admin' && (
            <li
              className={`nav-item ${view === 'models' ? 'active' : ''}`}
              onClick={() => setView('models')}
              id="nav-models"
            >
              <FileBox size={18} />
              <span>模型权重库</span>
            </li>
          )}

          {userRole === 'admin' && (
            <li
              className={`nav-item ${view === 'training' ? 'active' : ''}`}
              onClick={() => { setView('training'); }}
              id="nav-training"
            >
              <Play size={18} />
              <span>模型训练</span>
            </li>
          )}

          {userRole === 'admin' && (
            <li
              className={`nav-item ${view === 'users' ? 'active' : ''}`}
              onClick={() => setView('users')}
              id="nav-users"
            >
              <Users size={18} />
              <span>团队人员管理</span>
            </li>
          )}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {runs.some(r => ['running', 'training', 'starting'].includes(r.status)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)', fontSize: '0.85rem', fontWeight: 500 }}>
              <Activity className="pulse-dots" size={14} />
              <span>正在执行 YOLO 训练...</span>
            </div>
          )}

          {currentUser && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>
                欢迎，<strong>{displayName || currentUser}</strong>
                <span className={`badge ${userRole === 'admin' ? 'badge-danger' : 'badge-success'}`} style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '1px 6px' }}>
                  {userRole === 'admin' ? '管理员' : '标注员'}
                </span>
              </span>
              <button
                className="btn btn-outline"
                style={{ padding: '6px 12px', gap: '4px', fontSize: '0.8rem' }}
                onClick={handleLogout}
              >
                <LogOut size={12} /> 退出
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {!token ? (
          <LoginRegister onLoginSuccess={handleLoginSuccess} />
        ) : (
          <>
            {view === 'dashboard' && (
              <Dashboard
                systemStatus={systemStatus}
                datasets={datasets}
                models={models}
                runs={runs}
                setView={setView}
              />
            )}
            {view === 'datasets' && userRole === 'admin' && (
              <DatasetManager
                datasets={datasets}
                onUploadDataset={handleUploadDataset}
                onDeleteDataset={handleDeleteDataset}
              />
            )}
            {view === 'models' && userRole === 'admin' && (
              <ModelHub
                models={models}
                onDownloadModel={handleDownloadModel}
                onUploadModel={handleUploadModel}
                fetchModels={fetchModels}
              />
            )}
            {view === 'labeling' && (
              <LabelingTaskCenter
                tasks={labelingTasks}
                onCreateTask={handleCreateLabelingTask}
                onDeleteTask={handleDeleteLabelingTask}
                onExportTask={handleExportLabelingTask}
                onEnterWorkspace={(task) => {
                  setSelectedLabelingTask(task);
                  setView('labeling-workspace');
                }}
                userRole={userRole}
                token={token}
              />
            )}
            {view === 'labeling-workspace' && selectedLabelingTask && (
              <LabelingWorkspace
                task={selectedLabelingTask}
                token={token}
                onBack={() => {
                  setSelectedLabelingTask(null);
                  setView('labeling');
                  fetchLabelingTasks();
                }}
              />
            )}
            {view === 'training' && userRole === 'admin' && (
              <TrainingWorkspace
                datasets={datasets}
                models={models}
                runs={runs}
                startTraining={handleStartTraining}
                cancelTraining={handleCancelTraining}
                deleteRun={handleDeleteRun}
                selectedRunId={selectedRunId}
                setSelectedRunId={setSelectedRunId}
                token={token}
              />
            )}
            {view === 'users' && userRole === 'admin' && (
              <UserManager token={token} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
