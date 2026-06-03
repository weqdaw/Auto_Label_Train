import React, { useState, useEffect } from 'react';
import { Cpu, Database, Eye, Play, Sparkles } from 'lucide-react';

export default function Dashboard({ systemStatus, datasets, models, runs, setView }) {
  const activeRuns = runs.filter(r => ['running', 'training', 'starting'].includes(r.status));
  const completedRuns = runs.filter(r => r.status === 'completed');

  return (
    <div>
      <div className="flex-between">
        <div>
          <h1 className="view-title" id="dashboard-title">控制中心</h1>
          <p className="view-subtitle">监控系统资源、数据集状态以及 YOLO 训练任务。</p>
        </div>
        <div className="system-stats">
          <div className="stat-chip">
            <span className={`stat-indicator ${systemStatus?.gpu?.cuda_available ? 'green' : 'orange'}`}></span>
            <span>GPU: {systemStatus?.gpu?.cuda_available ? systemStatus.gpu.gpu_name : '未启用 (CPU 模式)'}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-indicator green"></span>
            <span>CPU: {systemStatus?.cpu_percent ?? 0}%</span>
          </div>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid-cols-4 mb-6">
        <div className="card">
          <div className="form-label" style={{ color: 'var(--color-primary)' }}>可用数据集</div>
          <div className="view-title" style={{ fontSize: '2.5rem', margin: '10px 0 0 0' }}>{datasets.length}</div>
          <div className="form-label" style={{ marginTop: '5px', fontSize: '0.75rem' }}>个本地数据集已导入</div>
        </div>
        <div className="card">
          <div className="form-label" style={{ color: 'var(--color-cyan)' }}>已下载模型</div>
          <div className="view-title" style={{ fontSize: '2.5rem', margin: '10px 0 0 0' }}>
            {models.filter(m => m.status === 'downloaded').length}
          </div>
          <div className="form-label" style={{ marginTop: '5px', fontSize: '0.75rem' }}>个 YOLO 权重文件就绪</div>
        </div>
        <div className="card">
          <div className="form-label" style={{ color: 'var(--color-warning)' }}>正在训练</div>
          <div className="view-title" style={{ fontSize: '2.5rem', margin: '10px 0 0 0' }}>{activeRuns.length}</div>
          <div className="form-label" style={{ marginTop: '5px', fontSize: '0.75rem' }}>个进行中的训练任务</div>
        </div>
        <div className="card">
          <div className="form-label" style={{ color: 'var(--color-success)' }}>训练完成</div>
          <div className="view-title" style={{ fontSize: '2.5rem', margin: '10px 0 0 0' }}>{completedRuns.length}</div>
          <div className="form-label" style={{ marginTop: '5px', fontSize: '0.75rem' }}>个已归档的训练结果</div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid-cols-2 mt-6">
        {/* System Health */}
        <div className="card">
          <h2 className="section-title">
            <Cpu size={20} className="pulse-dots" style={{ color: 'var(--color-cyan)' }} />
            系统资源监控
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <div className="flex-between">
                <span className="form-label">CPU 使用率</span>
                <span className="form-label">{systemStatus?.cpu_percent ?? 0}%</span>
              </div>
              <div className="progress-container">
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${systemStatus?.cpu_percent ?? 0}%`,
                    background: 'linear-gradient(90deg, var(--color-cyan), #0284c7)'
                  }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex-between">
                <span className="form-label">内存使用率 ({systemStatus?.ram_used_gb ?? 0} / {systemStatus?.ram_total_gb ?? 0} GB)</span>
                <span className="form-label">{systemStatus?.ram_percent ?? 0}%</span>
              </div>
              <div className="progress-container">
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${systemStatus?.ram_percent ?? 0}%`,
                    background: 'linear-gradient(90deg, var(--color-primary), #4f46e5)'
                  }}
                ></div>
              </div>
            </div>

            {systemStatus?.gpu?.cuda_available && (
              <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                <div className="form-label" style={{ color: 'var(--color-success)', marginBottom: '4px' }}>🔥 CUDA 加速已启用</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  检测到支持的 GPU: <strong>{systemStatus.gpu.gpu_name}</strong>。训练进程将自动使用 GPU 进行加速。
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Launch & Status */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h2 className="section-title">
              <Sparkles size={20} style={{ color: 'var(--color-primary)' }} />
              快速开始
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '20px' }}>
              只需三步即可完成自动化 YOLO 训练：<br />
              1. 在 <strong>模型库</strong> 下载或上传基础 weights。<br />
              2. 在 <strong>数据集管理</strong> 导入含有 <code>data.yaml</code> 的 ZIP 数据集。<br />
              3. 在 <strong>模型训练</strong> 中设置超参数，点击开始并实时观测指标！
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" id="btn-quick-train" onClick={() => setView('training')}>
              <Play size={16} /> 开始训练
            </button>
            <button className="btn btn-outline" onClick={() => setView('datasets')}>
              <Database size={16} /> 管理数据集
            </button>
          </div>
        </div>
      </div>

      {/* Recent Runs Table */}
      <div className="card mt-6">
        <h2 className="section-title">
          <Eye size={20} style={{ color: 'var(--color-warning)' }} />
          最近的训练任务
        </h2>
        {runs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            暂无训练记录，请前往“模型训练”启动新任务。
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>任务 ID</th>
                  <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>基础模型</th>
                  <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>数据集</th>
                  <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>当前 Epoch</th>
                  <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>训练进度</th>
                  <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>状态</th>
                  <th style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 5).map((run) => (
                  <tr key={run.run_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px 8px', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{run.run_id}</td>
                    <td style={{ padding: '12px 8px' }}>{run.model_name || '-'}</td>
                    <td style={{ padding: '12px 8px' }}>{run.dataset_name || '-'}</td>
                    <td style={{ padding: '12px 8px' }}>{run.epoch} / {run.total_epochs}</td>
                    <td style={{ padding: '12px 8px', width: '150px' }}>
                      <div className="progress-container" style={{ margin: 0, height: '6px' }}>
                        <div className="progress-bar" style={{ width: `${run.progress}%` }}></div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span className={`badge ${
                        run.status === 'completed' ? 'badge-success' :
                        run.status === 'failed' ? 'badge-danger' :
                        run.status === 'cancelled' ? 'badge-danger' : 'badge-info'
                      }`}>
                        {run.status === 'completed' ? '已完成' :
                         run.status === 'failed' ? '失败' :
                         run.status === 'cancelled' ? '被取消' :
                         run.status === 'training' ? '训练中' : '启动中'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        onClick={() => setView('training')}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
