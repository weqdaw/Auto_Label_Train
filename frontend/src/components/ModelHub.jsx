import React, { useState, useRef, useEffect } from 'react';
import { Download, UploadCloud, CheckCircle, Cpu, FileBox } from 'lucide-react';

export default function ModelHub({ models, onDownloadModel, onUploadModel, fetchModels }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // Poll model list if downloading is in progress
  useEffect(() => {
    const hasDownloading = models.some(m => m.status === 'downloading');
    if (hasDownloading) {
      const interval = setInterval(() => {
        fetchModels();
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [models, fetchModels]);

  const handleUpload = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endswith('.pt')) {
        setUploadError("只支持 PyTorch 权重文件 (.pt 格式)");
        return;
      }

      setUploading(true);
      setUploadError(null);
      try {
        await onUploadModel(file);
      } catch (err) {
        setUploadError(err.message || "文件上传失败");
      } finally {
        setUploading(false);
      }
    }
  };

  const getModelFamily = (name) => {
    if (name.startsWith('yolov8')) return 'YOLOv8 (Recommended)';
    if (name.startsWith('yolo11')) return 'YOLO11 (Latest)';
    return '自定义权重';
  };

  const formatSize = (bytes) => {
    if (!bytes) return '-';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <h1 className="view-title">模型管理库</h1>
      <p className="view-subtitle">在线下载官方预训练 YOLOv8 / YOLO11 模型，或者上传自己训练好的 `.pt` 权重文件进行二次微调。</p>

      <div className="grid-cols-3">
        {/* Upload Column */}
        <div className="card" style={{ gridColumn: 'span 1', height: 'fit-content' }}>
          <h2 className="section-title">
            <UploadCloud size={20} style={{ color: 'var(--color-primary)' }} />
            上传自定义权重
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
            如果您有在其他数据集上预训练好的 <code>.pt</code> 格式 YOLO 模型，可以将其上传至本地模型库中，供微调训练使用。
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pt"
            style={{ display: 'none' }}
            onChange={handleUpload}
            id="model-file-input"
          />

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', padding: '14px' }}
            onClick={() => fileInputRef.current.click()}
            disabled={uploading}
          >
            <UploadCloud size={16} /> {uploading ? "正在上传..." : "上传本地权重 (.pt)"}
          </button>

          {uploadError && (
            <div style={{ 
              marginTop: '16px', 
              padding: '12px', 
              borderRadius: 'var(--radius-md)', 
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#fca5a5',
              fontSize: '0.85rem'
            }}>
              <strong>错误：</strong>{uploadError}
            </div>
          )}
        </div>

        {/* List Column */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <h2 className="section-title">
            <FileBox size={20} style={{ color: 'var(--color-cyan)' }} />
            模型列表
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {models.map((model) => (
              <div 
                key={model.name} 
                style={{ 
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'rgba(255,255,255,0.01)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <strong style={{ fontSize: '1.05rem', fontFamily: 'var(--font-mono)' }}>{model.name}</strong>
                    <span 
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        backgroundColor: model.name.startsWith('yolo11') ? 'rgba(6,182,212,0.1)' : 'rgba(124,58,237,0.1)',
                        border: '1px solid var(--border-light)',
                        color: model.name.startsWith('yolo11') ? 'var(--color-cyan)' : 'var(--color-primary)'
                      }}
                    >
                      {getModelFamily(model.name)}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                    大小: {formatSize(model.size)}
                  </div>
                </div>

                <div>
                  {model.status === 'downloaded' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.9rem' }}>
                      <CheckCircle size={16} /> 本地就绪
                    </div>
                  )}

                  {model.status === 'downloading' && (
                    <div style={{ width: '150px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span className="form-label" style={{ fontSize: '0.7rem' }}>正在下载 ({model.progress}%)</span>
                      <div className="progress-container" style={{ margin: 0, height: '4px' }}>
                        <div className="progress-bar" style={{ width: `${model.progress}%` }}></div>
                      </div>
                    </div>
                  )}

                  {model.status === 'online' && (
                    <button 
                      className="btn btn-outline" 
                      style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                      onClick={() => onDownloadModel(model.name)}
                    >
                      <Download size={14} /> 下载模型
                    </button>
                  )}

                  {model.status === 'error' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span style={{ color: 'var(--color-error)', fontSize: '0.8rem' }}>下载失败</span>
                      <button 
                        className="btn btn-outline" 
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        onClick={() => onDownloadModel(model.name)}
                      >
                        重试
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
