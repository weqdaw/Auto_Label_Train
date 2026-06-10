import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Trash2, LineChart as ChartIcon, Terminal, Download, Cpu, Activity } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export default function TrainingWorkspace({ 
  datasets, 
  models, 
  runs, 
  startTraining, 
  cancelTraining, 
  deleteRun,
  selectedRunId,
  setSelectedRunId,
  token
}) {
  const [modelName, setModelName] = useState('');
  const [datasetName, setDatasetName] = useState('');
  const [epochs, setEpochs] = useState(10);
  const [batchSize, setBatchSize] = useState(16);
  const [imgsz, setImgsz] = useState(640);
  const [device, setDevice] = useState('cpu');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const [activeTab, setActiveTab] = useState('charts'); // 'charts' or 'logs'
  const [selectedRunDetails, setSelectedRunDetails] = useState(null);
  const [weights, setWeights] = useState([]);
  const terminalEndRef = useRef(null);

  // Set default form values
  useEffect(() => {
    const downloadedModels = models.filter(m => m.status === 'downloaded');
    if (downloadedModels.length > 0 && !modelName) {
      setModelName(downloadedModels[0].name);
    }
    const validDatasets = datasets.filter(d => d.is_valid);
    if (validDatasets.length > 0 && !datasetName) {
      setDatasetName(validDatasets[0].name);
    }
  }, [models, datasets]);

  // Fetch weights when run changes
  useEffect(() => {
    if (selectedRunId) {
      fetchWeights(selectedRunId);
    } else {
      setWeights([]);
      setSelectedRunDetails(null);
    }
  }, [selectedRunId]);

  // WebSocket / polling for selected run
  useEffect(() => {
    if (!selectedRunId) return;

    // Retrieve initial data
    fetchRunDetails(selectedRunId);

    // Set up WebSocket connection for real-time logs
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/runs/${selectedRunId}/ws?token=${token}`;
    
    let ws;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setSelectedRunDetails(data);
        if (data.status === 'completed') {
          fetchWeights(selectedRunId);
        }
      };
      ws.onerror = () => {
        // Fallback to polling if WS fails
        startPolling();
      };
    } catch (e) {
      startPolling();
    }

    let interval;
    function startPolling() {
      interval = setInterval(() => {
        fetchRunDetails(selectedRunId);
      }, 2000);
    }

    return () => {
      if (ws) ws.close();
      if (interval) clearInterval(interval);
    };
  }, [selectedRunId, token]);

  // Scroll to bottom of logs when logs update
  useEffect(() => {
    if (activeTab === 'logs' && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedRunDetails?.logs, activeTab]);

  const fetchRunDetails = async (rid) => {
    try {
      const res = await fetch(`/api/runs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const allRuns = await res.json();
      const current = allRuns.find(r => r.run_id === rid);
      if (current) {
        setSelectedRunDetails(current);
        if (current.status === 'completed') {
          fetchWeights(rid);
        }
      }
    } catch (err) {}
  };

  const fetchWeights = async (rid) => {
    try {
      const res = await fetch(`/api/runs/${rid}/weights`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setWeights(data.weights || []);
    } catch (err) {}
  };

  const handleStart = async (e) => {
    e.preventDefault();
    if (!modelName || !datasetName) {
      setError("请先选择模型和数据集！");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const runId = await startTraining({
        model_name: modelName,
        dataset_name: datasetName,
        epochs,
        batch_size: batchSize,
        imgsz,
        device
      });
      setSelectedRunId(runId);
    } catch (err) {
      setError(err.message || "启动训练失败");
    } finally {
      setStarting(false);
    }
  };

  // Normalize YOLO results.csv metrics for graphing
  const getChartData = () => {
    const history = selectedRunDetails?.metrics_history || [];
    return history.map(row => {
      const normalized = { epoch: row.epoch };
      Object.keys(row).forEach(k => {
        const val = row[k];
        if (k.includes('train/box_loss') || k.includes('train/box')) normalized.trainBoxLoss = val;
        if (k.includes('train/cls_loss') || k.includes('train/cls')) normalized.trainClsLoss = val;
        if (k.includes('val/box_loss') || k.includes('val/box')) normalized.valBoxLoss = val;
        if (k.includes('val/cls_loss') || k.includes('val/cls')) normalized.valClsLoss = val;
        if (k.includes('mAP50(B)') || k.includes('mAP50')) normalized.mAP50 = val;
        if (k.includes('mAP50-95') || k.includes('mAP50-95(B)')) normalized.mAP50_95 = val;
      });
      return normalized;
    });
  };

  const chartData = getChartData();
  const downloadedModels = models.filter(m => m.status === 'downloaded');
  const validDatasets = datasets.filter(d => d.is_valid);
  const activeRuns = runs.filter(r => ['running', 'training', 'starting'].includes(r.status));

  return (
    <div>
      <h1 className="view-title">模型训练中心</h1>
      <p className="view-subtitle">配置超参数并开启 YOLO 自动化训练。实时监测损失曲线和 mAP 精确度指标。</p>

      <div className="grid-cols-3">
        {/* Left Form: Configure & Runs List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Configure Panel */}
          <div className="card">
            <h2 className="section-title">
              <Play size={20} style={{ color: 'var(--color-primary)' }} />
              新建训练任务
            </h2>

            {activeRuns.length > 0 && (
              <div style={{ 
                padding: '12px', 
                borderRadius: 'var(--radius-md)', 
                backgroundColor: 'rgba(245, 158, 11, 0.05)', 
                border: '1px solid rgba(245, 158, 11, 0.15)',
                fontSize: '0.85rem',
                color: '#fde047',
                marginBottom: '16px'
              }}>
                ⚠️ <strong>注意：</strong>当前已有正在运行的训练任务。启动多任务可能会导致 GPU/CPU 资源不足或 Out of Memory (OOM) 错误。
              </div>
            )}

            <form onSubmit={handleStart}>
              <div className="form-group">
                <label className="form-label" htmlFor="select-model">基础权重模型</label>
                <select 
                  id="select-model"
                  value={modelName} 
                  onChange={(e) => setModelName(e.target.value)}
                  disabled={downloadedModels.length === 0}
                >
                  {downloadedModels.length === 0 && <option>-- 请先下载或上传模型权重 --</option>}
                  {downloadedModels.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="select-dataset">训练数据集</label>
                <select 
                  id="select-dataset"
                  value={datasetName} 
                  onChange={(e) => setDatasetName(e.target.value)}
                  disabled={validDatasets.length === 0}
                >
                  {validDatasets.length === 0 && <option>-- 请先导入有效数据集 --</option>}
                  {validDatasets.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>

              <div className="grid-cols-2" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="input-epochs">训练周期 (Epochs)</label>
                  <input 
                    id="input-epochs"
                    type="number" 
                    className="form-control"
                    min="1" 
                    max="1000"
                    value={epochs} 
                    onChange={(e) => setEpochs(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="input-batch">批大小 (Batch)</label>
                  <select 
                    id="input-batch"
                    value={batchSize} 
                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                  >
                    <option value="-1">Auto (自动)</option>
                    <option value="4">4</option>
                    <option value="8">8</option>
                    <option value="16">16</option>
                    <option value="32">32</option>
                    <option value="64">64</option>
                  </select>
                </div>
              </div>

              <div className="grid-cols-2" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="input-imgsz">图片尺寸 (Imgsz)</label>
                  <select 
                    id="input-imgsz"
                    value={imgsz} 
                    onChange={(e) => setImgsz(parseInt(e.target.value))}
                  >
                    <option value="320">320</option>
                    <option value="416">416</option>
                    <option value="512">512</option>
                    <option value="640">640 (默认)</option>
                    <option value="800">800</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="input-device">训练计算核心</label>
                  <select 
                    id="input-device"
                    value={device} 
                    onChange={(e) => setDevice(e.target.value)}
                  >
                    <option value="cpu">CPU 模式</option>
                    <option value="0">GPU 核心 0</option>
                    <option value="1">GPU 核心 1</option>
                  </select>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                id="btn-start-train"
                style={{ width: '100%', marginTop: '10px' }}
                disabled={starting || downloadedModels.length === 0 || validDatasets.length === 0}
              >
                <Play size={16} /> {starting ? "正在启动..." : "开始 YOLO 训练"}
              </button>

              {error && (
                <div style={{ 
                  marginTop: '12px', 
                  padding: '10px', 
                  borderRadius: 'var(--radius-sm)', 
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#fca5a5',
                  fontSize: '0.8rem'
                }}>
                  {error}
                </div>
              )}
            </form>
          </div>

          {/* Runs Queue */}
          <div className="card" style={{ flex: 1 }}>
            <h2 className="section-title">
              <Activity size={20} style={{ color: 'var(--color-cyan)' }} />
              训练历史队列
            </h2>

            {runs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                暂无训练任务。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }}>
                {runs.map((run) => (
                  <div 
                    key={run.run_id}
                    onClick={() => setSelectedRunId(run.run_id)}
                    style={{ 
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: `1px solid ${selectedRunId === run.run_id ? 'var(--color-primary)' : 'var(--border-light)'}`,
                      backgroundColor: selectedRunId === run.run_id ? 'rgba(124, 58, 237, 0.06)' : 'rgba(255,255,255,0.01)',
                      cursor: 'pointer',
                      transition: 'var(--transition-base)'
                    }}
                  >
                    <div className="flex-between">
                      <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                        {run.run_id}
                      </span>
                      <span className={`badge ${
                        run.status === 'completed' ? 'badge-success' :
                        run.status === 'failed' ? 'badge-danger' :
                        run.status === 'cancelled' ? 'badge-danger' : 'badge-info'
                      }`} style={{ fontSize: '0.65rem', padding: '2px 6px' }}>
                        {run.status === 'completed' ? '已完成' :
                         run.status === 'failed' ? '失败' :
                         run.status === 'cancelled' ? '取消' :
                         run.status === 'training' ? '训练中' : '就绪'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      模型: {run.model_name} | 数据: {run.dataset_name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Selected Run Details & charts / logs */}
        <div className="card" style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {!selectedRunId ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: '80px' }}>
              <ChartIcon size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <h4>选择或新建一个训练任务以查看实时状态</h4>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
              {/* Head Details */}
              <div className="flex-between" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-mono)', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {selectedRunDetails?.run_id}
                    <span className={`badge ${
                      selectedRunDetails?.status === 'completed' ? 'badge-success' :
                      selectedRunDetails?.status === 'failed' ? 'badge-danger' :
                      selectedRunDetails?.status === 'cancelled' ? 'badge-danger' : 'badge-info'
                    }`}>
                      {selectedRunDetails?.status}
                    </span>
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    基础权重: {selectedRunDetails?.model_name} | 数据集: {selectedRunDetails?.dataset_name}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  {['running', 'training', 'starting'].includes(selectedRunDetails?.status) && (
                    <button 
                      className="btn btn-danger" 
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                      onClick={() => cancelTraining(selectedRunDetails.run_id)}
                    >
                      <Square size={14} /> 停止训练
                    </button>
                  )}
                  <button 
                    className="btn btn-outline" 
                    style={{ padding: '8px', borderRadius: 'var(--radius-sm)' }}
                    onClick={() => {
                      if(window.confirm('确认删除此训练运行的所有文件夹及文件吗？')) {
                        deleteRun(selectedRunDetails.run_id);
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Progress metrics */}
              {selectedRunDetails && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div className="flex-between" style={{ fontSize: '0.85rem' }}>
                    <span>Epoch {selectedRunDetails.epoch} / {selectedRunDetails.total_epochs || selectedRunDetails.epochs}</span>
                    <span>整体进度: {selectedRunDetails.progress}%</span>
                  </div>
                  <div className="progress-container" style={{ margin: 0 }}>
                    <div className="progress-bar" style={{ width: `${selectedRunDetails.progress}%` }}></div>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', gap: '4px' }}>
                <button 
                  className="btn" 
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                    backgroundColor: activeTab === 'charts' ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderColor: activeTab === 'charts' ? 'var(--border-light)' : 'transparent',
                    borderBottomColor: activeTab === 'charts' ? 'transparent' : 'var(--border-light)',
                    color: activeTab === 'charts' ? 'var(--text-main)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'charts' ? 600 : 400
                  }}
                  onClick={() => setActiveTab('charts')}
                >
                  <ChartIcon size={14} /> 性能指标图表
                </button>
                <button 
                  className="btn" 
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                    backgroundColor: activeTab === 'logs' ? 'rgba(255,255,255,0.04)' : 'transparent',
                    borderColor: activeTab === 'logs' ? 'var(--border-light)' : 'transparent',
                    borderBottomColor: activeTab === 'logs' ? 'transparent' : 'var(--border-light)',
                    color: activeTab === 'logs' ? 'var(--text-main)' : 'var(--text-secondary)',
                    fontWeight: activeTab === 'logs' ? 600 : 400
                  }}
                  onClick={() => setActiveTab('logs')}
                >
                  <Terminal size={14} /> 终端实时日志
                </button>
              </div>

              {/* Tab Contents */}
              <div style={{ flex: 1, minHeight: '300px' }}>
                {activeTab === 'charts' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {chartData.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        ⏳ 第一个 Epoch 结束后将开始渲染训练损失与 mAP 性能曲线。
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* Box and Cls Loss Chart */}
                        <div className="card" style={{ padding: '14px', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <div className="form-label" style={{ fontSize: '0.75rem', marginBottom: '8px' }}>损失曲线 (Loss Curves)</div>
                          <div style={{ width: '100%', height: '180px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="epoch" stroke="var(--text-muted)" fontSize={10} />
                                <YAxis stroke="var(--text-muted)" fontSize={10} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-light)', color: '#fff', fontSize: '11px' }} />
                                <Legend fontSize={10} />
                                <Line type="monotone" dataKey="trainBoxLoss" name="Train Box" stroke="var(--color-cyan)" strokeWidth={1.5} dot={false} />
                                <Line type="monotone" dataKey="trainClsLoss" name="Train Cls" stroke="var(--color-primary)" strokeWidth={1.5} dot={false} />
                                <Line type="monotone" dataKey="valBoxLoss" name="Val Box" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* mAP Chart */}
                        <div className="card" style={{ padding: '14px', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <div className="form-label" style={{ fontSize: '0.75rem', marginBottom: '8px' }}>精确度曲线 (mAP Metrics)</div>
                          <div style={{ width: '100%', height: '180px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="epoch" stroke="var(--text-muted)" fontSize={10} />
                                <YAxis stroke="var(--text-muted)" fontSize={10} domain={[0, 1]} />
                                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-light)', color: '#fff', fontSize: '11px' }} />
                                <Legend fontSize={10} />
                                <Line type="monotone" dataKey="mAP50" name="mAP@0.5" stroke="var(--color-success)" strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="mAP50_95" name="mAP@0.5:0.95" stroke="#a78bfa" strokeWidth={1.5} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Live metrics widgets */}
                    {selectedRunDetails?.metrics && (
                      <div className="metric-grid">
                        <div className="metric-item">
                          <div className="form-label" style={{ fontSize: '0.7rem' }}>Precision</div>
                          <div className="metric-val">{(selectedRunDetails.metrics['precision(B)'] || 0).toFixed(4)}</div>
                        </div>
                        <div className="metric-item">
                          <div className="form-label" style={{ fontSize: '0.7rem' }}>Recall</div>
                          <div className="metric-val">{(selectedRunDetails.metrics['recall(B)'] || 0).toFixed(4)}</div>
                        </div>
                        <div className="metric-item">
                          <div className="form-label" style={{ fontSize: '0.7rem' }}>mAP@0.5</div>
                          <div className="metric-val" style={{ color: 'var(--color-success)', background: 'none', WebkitTextFillColor: 'initial' }}>
                            {(selectedRunDetails.metrics['mAP50(B)'] || 0).toFixed(4)}
                          </div>
                        </div>
                        <div className="metric-item">
                          <div className="form-label" style={{ fontSize: '0.7rem' }}>mAP@0.5:0.95</div>
                          <div className="metric-val">{(selectedRunDetails.metrics['mAP50-95(B)'] || 0).toFixed(4)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'logs' && (
                  <div>
                    <div className="terminal-header">
                      <span className="terminal-dot red"></span>
                      <span className="terminal-dot yellow"></span>
                      <span className="terminal-dot green"></span>
                      <span style={{ marginLeft: '10px' }}>console log - {selectedRunDetails.run_id}</span>
                    </div>
                    <div className="terminal-window">
                      {selectedRunDetails.logs || "等待终端日志加载..."}
                      <div ref={terminalEndRef} />
                    </div>
                  </div>
                )}
              </div>

              {/* Exports / Downloads Section */}
              {selectedRunDetails.status === 'completed' && (
                <div className="card" style={{ padding: '16px', backgroundColor: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.25)' }}>
                  <div className="flex-between">
                    <div>
                      <strong style={{ color: '#6ee7b7', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        🎉 训练已成功完成！
                      </strong>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        生成的权重文件已保存在本地，您可以点击下载导出。
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      {weights.length === 0 ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>正在扫描权重...</span>
                      ) : (
                        weights.map(w => (
                          <a 
                            key={w.name}
                            href={`/api/runs/${selectedRunId}/weights/download/${w.name}?token=${token}`}
                            className="btn btn-cyan"
                            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                          >
                            <Download size={14} /> 导出 {w.name} ({ (w.size / (1024*1024)).toFixed(1) } MB)
                          </a>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
