import React, { useState } from 'react';
import { Plus, FolderOpen, Tag, Trash2, CheckCircle, Play, Download, BookOpen, Layers } from 'lucide-react';

export default function LabelingTaskCenter({ 
  tasks, 
  onCreateTask, 
  onDeleteTask, 
  onExportTask,
  onEnterWorkspace 
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('detection');
  const [folderPath, setFolderPath] = useState('');
  const [classInput, setClassInput] = useState('');
  const [classes, setClasses] = useState(['car', 'person', 'dog']); // default classes
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [exportingStates, setExportingStates] = useState({}); // task_id -> boolean

  const handleAddClass = (e) => {
    e.preventDefault();
    const trimmed = classInput.trim().toLowerCase();
    if (trimmed && !classes.includes(trimmed)) {
      setClasses([...classes, trimmed]);
      setClassInput('');
    }
  };

  const handleRemoveClass = (index) => {
    setClasses(classes.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("任务名称不能为空！");
      return;
    }
    if (!folderPath.trim()) {
      setError("图片目录路径不能为空！");
      return;
    }
    if (classes.length === 0) {
      setError("请至少定义一个类别标签！");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      await onCreateTask({
        name,
        type,
        image_folder_path: folderPath,
        classes
      });
      // Clear form
      setName('');
      setFolderPath('');
      // Keep classes as is, or reset
    } catch (err) {
      setError(err.message || "创建任务失败");
    } finally {
      setCreating(false);
    }
  };

  const handleExport = async (taskId) => {
    setExportingStates(prev => ({ ...prev, [taskId]: true }));
    try {
      const res = await onExportTask(taskId);
      alert(`🎉 导出成功！\n数据集已保存为: "${res.dataset_name}"\n已成功划分: 训练集 ${res.train_count} 张, 验证集 ${res.val_count} 张。\n您现在可以在“模型训练”中直接使用该数据集。`);
    } catch (err) {
      alert(`❌ 导出失败: ${err.message}`);
    } finally {
      setExportingStates(prev => ({ ...prev, [taskId]: false }));
    }
  };

  return (
    <div>
      <h1 className="view-title">本地标注中心</h1>
      <p className="view-subtitle">导入本地图片目录，创建目标检测（矩形框）或语义分割（多边形）标注任务，并一键生成 YOLO 训练集。</p>

      <div className="grid-cols-3">
        {/* Create Task Form */}
        <div className="card" style={{ gridColumn: 'span 1', height: 'fit-content' }}>
          <h2 className="section-title">
            <Plus size={20} style={{ color: 'var(--color-primary)' }} />
            新建标注任务
          </h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="task-name-input">任务名称</label>
              <input 
                id="task-name-input"
                type="text" 
                className="form-control"
                placeholder="例如: 自动驾驶道路检测"
                value={name} 
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="task-type-select">标注类型</label>
              <select 
                id="task-type-select"
                value={type} 
                onChange={(e) => setType(e.target.value)}
              >
                <option value="detection">目标识别 (矩形 Bounding Box)</option>
                <option value="segmentation">语义分割 (多边形 Polygon)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="image-folder-input">本地图片文件夹绝对路径</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <input 
                  id="image-folder-input"
                  type="text" 
                  className="form-control"
                  placeholder="例如: D:/datasets/road_pics"
                  value={folderPath} 
                  onChange={(e) => setFolderPath(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  ⚠️ 请使用正斜杠 <code>/</code>。该文件夹应直接包含 <code>.jpg</code> 或 <code>.png</code> 图片。
                </span>
              </div>
            </div>

            {/* Class Definitions */}
            <div className="form-group">
              <label className="form-label" htmlFor="class-tag-input">类别定义 (Classes)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  id="class-tag-input"
                  type="text" 
                  className="form-control" 
                  placeholder="输入类别英文名 (例如: car)"
                  value={classInput}
                  onChange={(e) => setClassInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddClass(e)}
                />
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  style={{ padding: '0 16px' }}
                  onClick={handleAddClass}
                >
                  添加
                </button>
              </div>

              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '6px', 
                marginTop: '10px', 
                minHeight: '40px',
                padding: '8px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--border-light)'
              }}>
                {classes.length === 0 ? (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>暂无类别，请在上方添加。</span>
                ) : (
                  classes.map((cls, idx) => (
                    <span 
                      key={idx} 
                      style={{ 
                        fontSize: '0.8rem', 
                        backgroundColor: 'var(--color-primary-glow)', 
                        border: '1px solid var(--border-active)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        color: 'var(--text-main)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      {cls}
                      <Trash2 
                        size={12} 
                        style={{ cursor: 'pointer', opacity: 0.7 }} 
                        onClick={() => handleRemoveClass(idx)}
                      />
                    </span>
                  ))
                )}
              </div>
            </div>

            <button 
              type="submit" 
              className="btn btn-primary" 
              id="btn-create-task"
              style={{ width: '100%', marginTop: '10px' }}
              disabled={creating}
            >
              <Plus size={16} /> {creating ? "正在扫描文件夹..." : "创建标注任务"}
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

        {/* Task Grid */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h2 className="section-title">
            <Layers size={20} style={{ color: 'var(--color-cyan)' }} />
            任务列表 ({tasks.length})
          </h2>

          {tasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
              暂无已创建的任务。请在左侧指定图片目录来创建第一个标注任务。
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
              {tasks.map((task) => {
                const pct = task.total_images > 0 
                  ? Math.round((task.labeled_images / task.total_images) * 100) 
                  : 0;

                return (
                  <div 
                    key={task.task_id} 
                    style={{ 
                      border: '1px solid var(--border-light)',
                      borderRadius: 'var(--radius-md)',
                      padding: '20px',
                      backgroundColor: 'rgba(255,255,255,0.01)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}
                  >
                    {/* Header */}
                    <div className="flex-between">
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <strong style={{ fontSize: '1.2rem' }}>{task.name}</strong>
                          <span className={`badge ${task.type === 'detection' ? 'badge-info' : 'badge-success'}`}>
                            {task.type === 'detection' ? '目标识别' : '语义分割'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <FolderOpen size={12} />
                          <span>路径: <code style={{ fontFamily: 'var(--font-mono)' }}>{task.image_folder_path}</code></span>
                        </div>
                      </div>

                      <button 
                        className="btn btn-danger" 
                        style={{ padding: '6px', borderRadius: 'var(--radius-sm)' }}
                        onClick={() => {
                          if (window.confirm(`确定要删除标注任务 "${task.name}" 吗？此操作不可逆，将彻底清除该任务的所有标注文件！`)) {
                            onDeleteTask(task.task_id);
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ marginTop: '4px' }}>
                      <div className="flex-between" style={{ fontSize: '0.85rem', marginBottom: '6px' }}>
                        <span>进度: {task.labeled_images} / {task.total_images} 张图片已标注</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-cyan)' }}>{pct}%</span>
                      </div>
                      <div className="progress-container" style={{ margin: 0, height: '8px' }}>
                        <div className="progress-bar" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>

                    {/* Footer Details & Action Buttons */}
                    <div className="flex-between" style={{ borderTop: '1px solid var(--border-light)', paddingTop: '14px', marginTop: '4px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {task.classes.map((cls, index) => (
                          <span key={index} style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-light)' }}>
                            {cls}
                          </span>
                        ))}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          className="btn btn-outline"
                          style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                          disabled={task.labeled_images === 0 || exportingStates[task.task_id]}
                          onClick={() => handleExport(task.task_id)}
                        >
                          <Download size={14} /> {exportingStates[task.task_id] ? "正在导出..." : "导出为训练集"}
                        </button>
                        <button 
                          className="btn btn-primary"
                          style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                          onClick={() => onEnterWorkspace(task)}
                        >
                          <Play size={14} /> 进入标注空间
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
