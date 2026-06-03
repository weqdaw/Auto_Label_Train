import React, { useState, useRef } from 'react';
import { UploadCloud, Trash2, FileWarning, CheckCircle, Database } from 'lucide-react';

export default function DatasetManager({ datasets, onUploadDataset, onDeleteDataset }) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await handleUpload(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  const handleUpload = async (file) => {
    if (!file.name.endsWith('.zip')) {
      setUploadError("只支持 ZIP 格式压缩的数据集文件。");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await onUploadDataset(file);
    } catch (err) {
      setUploadError(err.message || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <h1 className="view-title">数据集管理</h1>
      <p className="view-subtitle">上传结构化 YOLO 格式数据集（包含 data.yaml 和 images/labels 子目录）。</p>

      <div className="grid-cols-3">
        {/* Upload Column */}
        <div className="card" style={{ gridColumn: 'span 1' }}>
          <h2 className="section-title">
            <UploadCloud size={20} style={{ color: 'var(--color-primary)' }} />
            导入数据集
          </h2>
          
          <form 
            onDragEnter={handleDrag} 
            onDragOver={handleDrag} 
            onDragLeave={handleDrag} 
            onDrop={handleDrop}
            onSubmit={(e) => e.preventDefault()}
            className="upload-dropzone"
            style={{ 
              borderColor: dragActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.15)',
              padding: '50px 20px'
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              accept=".zip"
              onChange={handleFileChange}
              id="dataset-file-input"
            />
            <UploadCloud className="upload-icon" />
            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 500 }}>
              拖拽 ZIP 文件到此处
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              或者
            </p>
            <button 
              type="button" 
              className="btn btn-outline" 
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              onClick={onButtonClick}
              disabled={uploading}
            >
              浏览本地文件
            </button>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px' }}>
              请确保 ZIP 根目录下包含 <code>data.yaml</code>
            </p>
          </form>

          {uploading && (
            <div style={{ marginTop: '16px', textAlign: 'center' }}>
              <div className="form-label pulse-dots" style={{ color: 'var(--color-cyan)' }}>
                ⏳ 正在解压并校验数据集...
              </div>
            </div>
          )}

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
            <Database size={20} style={{ color: 'var(--color-cyan)' }} />
            已导入的数据集 ({datasets.length})
          </h2>

          {datasets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
              暂无已导入的数据集。请在左侧上传您的第一个 YOLO 数据集。
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {datasets.map((dataset) => (
                <div 
                  key={dataset.name} 
                  style={{ 
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    backgroundColor: 'rgba(255,255,255,0.01)'
                  }}
                >
                  <div className="flex-between">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '1.05rem' }}>{dataset.name}</strong>
                      {dataset.is_valid ? (
                        <span className="badge badge-success" style={{ gap: '4px' }}>
                          <CheckCircle size={10} /> 有效
                        </span>
                      ) : (
                        <span className="badge badge-danger" style={{ gap: '4px' }}>
                          <FileWarning size={10} /> 无效
                        </span>
                      )}
                    </div>
                    <button 
                      className="btn btn-danger" 
                      style={{ padding: '6px', borderRadius: 'var(--radius-sm)' }}
                      onClick={() => onDeleteDataset(dataset.name)}
                      title="删除数据集"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {!dataset.is_valid ? (
                    <div style={{ color: '#fca5a5', fontSize: '0.85rem' }}>
                      ⚠️ {dataset.error}
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <div><strong>路径:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{dataset.path}</span></div>
                        <div><strong>类别数:</strong> <span className="badge badge-info">{dataset.num_classes}</span></div>
                        <div><strong>训练集图像目录:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{dataset.train_path}</span></div>
                        <div><strong>验证集图像目录:</strong> <span style={{ fontFamily: 'var(--font-mono)' }}>{dataset.val_path}</span></div>
                      </div>
                      <div style={{ marginTop: '12px' }}>
                        <div className="form-label" style={{ fontSize: '0.75rem', marginBottom: '6px' }}>类别列表：</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {dataset.classes.map((cls, idx) => (
                            <span 
                              key={idx} 
                              style={{ 
                                fontSize: '0.75rem', 
                                backgroundColor: 'rgba(255,255,255,0.05)', 
                                border: '1px solid var(--border-light)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                color: 'var(--text-main)'
                              }}
                            >
                              {idx}: {cls}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
