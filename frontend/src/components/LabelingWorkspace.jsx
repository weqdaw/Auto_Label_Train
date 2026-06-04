import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Save, ZoomIn, ZoomOut, RotateCcw, Trash2, HelpCircle, AlertCircle, ChevronLeft, ChevronRight, Check } from 'lucide-react';

export default function LabelingWorkspace({ 
  task, 
  onBack, 
  onSaveAnnotations,
  fetchTaskImages 
}) {
  const [images, setImages] = useState([]);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [annotations, setAnnotations] = useState({ filename: '', shapes: [] });
  const [activeCategory, setActiveCategory] = useState(task.classes[0] || '');
  const [selectedShapeIdx, setSelectedShapeIdx] = useState(null);
  
  // Canvas states
  const [naturalWidth, setNaturalWidth] = useState(800);
  const [naturalHeight, setNaturalHeight] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [tempRect, setTempRect] = useState(null); // { x1, y1, x2, y2 }
  const [tempPolygonPoints, setTempPolygonPoints] = useState([]); // [[x,y], ...]
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [draggingPoint, setDraggingPoint] = useState(null); // { shapeIdx, pointIdx }
  const [draggingRect, setDraggingRect] = useState(null); // { shapeIdx, startX, startY, origPoints }
  const [showHelp, setShowHelp] = useState(false);
  const [saving, setSaving] = useState(false);

  const svgRef = useRef(null);
  const imageRef = useRef(null);

  const activeImage = images[activeImageIdx];

  // Fetch images for this task
  useEffect(() => {
    loadTaskImages();
  }, [task.task_id]);

  const loadTaskImages = async () => {
    try {
      const res = await fetch(`/api/label/tasks/${task.task_id}/images`);
      const data = await res.json();
      setImages(data);
      if (data.length > 0) {
        setActiveImageIdx(0);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Load annotations when active image changes
  useEffect(() => {
    if (activeImage) {
      loadAnnotations(activeImage.filename);
      // Reset canvas interactions
      setSelectedShapeIdx(null);
      setIsDrawing(false);
      setTempRect(null);
      setTempPolygonPoints([]);
      setZoom(1);
    }
  }, [activeImageIdx, images]);

  const loadAnnotations = async (filename) => {
    try {
      const res = await fetch(`/api/label/tasks/${task.task_id}/annotations/${filename}`);
      const data = await res.json();
      setAnnotations(data);
    } catch (e) {
      console.error(e);
    }
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Hotkeys for numbers 0-9 to select classes
      if (e.key >= '0' && e.key <= '9') {
        const idx = parseInt(e.key);
        if (idx < task.classes.length) {
          setActiveCategory(task.classes[idx]);
        }
      }
      
      // Delete key to remove selected shape
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeIdx !== null) {
        handleDeleteShape(selectedShapeIdx);
      }

      // Esc to cancel current drawing
      if (e.key === 'Escape') {
        setIsDrawing(false);
        setTempRect(null);
        setTempPolygonPoints([]);
        setSelectedShapeIdx(null);
      }

      // Enter to close polygon in segmentation mode
      if (e.key === 'Enter' && tempPolygonPoints.length >= 3) {
        finishPolygonDrawing();
      }

      // Save shortcut Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveCurrentAnnotations();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedShapeIdx, tempPolygonPoints, activeCategory, annotations]);

  // Load natural dimensions of current image
  const handleImageLoad = (e) => {
    if (e.target) {
      setNaturalWidth(e.target.naturalWidth || 800);
      setNaturalHeight(e.target.naturalHeight || 600);
    }
  };

  // Helper: map client coordinate to SVG space
  const getSVGCoords = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * naturalWidth;
    const y = ((e.clientY - rect.top) / rect.height) * naturalHeight;
    return { x, y };
  };

  // SVG Mouse Down handler
  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Left click only
    const coords = getSVGCoords(e);

    // If click on point handle, start dragging it
    if (draggingPoint) return;

    // Detection (Rect) mode
    if (task.type === 'detection') {
      // Check if we clicked on an existing rectangle to select it
      const clickedIdx = findClickedShapeIndex(coords);
      if (clickedIdx !== null) {
        setSelectedShapeIdx(clickedIdx);
        // Start dragging rectangle
        const shape = annotations.shapes[clickedIdx];
        setDraggingRect({
          shapeIdx: clickedIdx,
          startX: coords.x,
          startY: coords.y,
          origPoints: JSON.parse(JSON.stringify(shape.points))
        });
        return;
      }

      // If clicked empty space, start drawing new rectangle
      setSelectedShapeIdx(null);
      setIsDrawing(true);
      setDrawStart(coords);
      setTempRect({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
    }
    // Segmentation (Polygon) mode
    else {
      // Check if we clicked on an existing polygon to select it
      const clickedIdx = findClickedShapeIndex(coords);
      if (clickedIdx !== null && !isDrawing) {
        setSelectedShapeIdx(clickedIdx);
        return;
      }

      // Drawing state: Add vertex to polygon
      if (!isDrawing) {
        setIsDrawing(true);
        setTempPolygonPoints([[coords.x, coords.y]]);
      } else {
        // Check if clicked near the first point to close it
        const firstPt = tempPolygonPoints[0];
        const dist = Math.hypot(coords.x - firstPt[0], coords.y - firstPt[1]);
        const closeThreshold = (15 / svgRef.current.clientWidth) * naturalWidth; // 15px threshold
        
        if (dist < closeThreshold && tempPolygonPoints.length >= 3) {
          finishPolygonDrawing();
        } else {
          setTempPolygonPoints([...tempPolygonPoints, [coords.x, coords.y]]);
        }
      }
    }
  };

  // SVG Mouse Move handler
  const handleMouseMove = (e) => {
    const coords = getSVGCoords(e);
    setCursorPos(coords);

    // Dragging vertex point
    if (draggingPoint) {
      const { shapeIdx, pointIdx } = draggingPoint;
      const updatedShapes = [...annotations.shapes];
      
      // Clamp coordinates to image dimensions
      const px = Math.max(0, Math.min(naturalWidth, coords.x));
      const py = Math.max(0, Math.min(naturalHeight, coords.y));
      
      // Convert to normalized coordinates (0 to 1)
      updatedShapes[shapeIdx].points[pointIdx] = [px / naturalWidth, py / naturalHeight];
      setAnnotations({ ...annotations, shapes: updatedShapes });
      return;
    }

    // Dragging entire rectangle body
    if (draggingRect) {
      const { shapeIdx, startX, startY, origPoints } = draggingRect;
      const dx = coords.x - startX;
      const dy = coords.y - startY;
      
      // Map back from normalized coordinates to pixels
      const p1_x = origPoints[0][0] * naturalWidth + dx;
      const p1_y = origPoints[0][1] * naturalHeight + dy;
      const p2_x = origPoints[1][0] * naturalWidth + dx;
      const p2_y = origPoints[1][1] * naturalHeight + dy;
      
      const updatedShapes = [...annotations.shapes];
      updatedShapes[shapeIdx].points = [
        [Math.max(0, Math.min(naturalWidth, p1_x)) / naturalWidth, Math.max(0, Math.min(naturalHeight, p1_y)) / naturalHeight],
        [Math.max(0, Math.min(naturalWidth, p2_x)) / naturalWidth, Math.max(0, Math.min(naturalHeight, p2_y)) / naturalHeight]
      ];
      setAnnotations({ ...annotations, shapes: updatedShapes });
      return;
    }

    // Drawing rectangle
    if (isDrawing && task.type === 'detection' && tempRect) {
      setTempRect(prev => ({ ...prev, x2: coords.x, y2: coords.y }));
    }
  };

  // SVG Mouse Up handler
  const handleMouseUp = () => {
    if (draggingPoint) {
      setDraggingPoint(null);
    }
    if (draggingRect) {
      setDraggingRect(null);
    }

    // Finish drawing rectangle
    if (isDrawing && task.type === 'detection' && tempRect) {
      setIsDrawing(false);
      
      const w = Math.abs(tempRect.x2 - tempRect.x1);
      const h = Math.abs(tempRect.y2 - tempRect.y1);
      const minDrawSize = (5 / svgRef.current.clientWidth) * naturalWidth; // 5px threshold
      
      if (w > minDrawSize && h > minDrawSize) {
        // Save normalized coordinates
        const x_min = Math.min(tempRect.x1, tempRect.x2) / naturalWidth;
        const y_min = Math.min(tempRect.y1, tempRect.y2) / naturalHeight;
        const x_max = Math.max(tempRect.x1, tempRect.x2) / naturalWidth;
        const y_max = Math.max(tempRect.y1, tempRect.y2) / naturalHeight;
        
        const newShape = {
          type: 'rect',
          label: activeCategory,
          points: [
            [x_min, y_min],
            [x_max, y_max]
          ]
        };
        
        const updatedShapes = [...annotations.shapes, newShape];
        setAnnotations({ ...annotations, shapes: updatedShapes });
        setSelectedShapeIdx(updatedShapes.length - 1);
      }
      setTempRect(null);
    }
  };

  // Finish polygon drawing
  const finishPolygonDrawing = () => {
    setIsDrawing(false);
    if (tempPolygonPoints.length >= 3) {
      // Normalize points
      const normPoints = tempPolygonPoints.map(p => [p[0] / naturalWidth, p[1] / naturalHeight]);
      
      const newShape = {
        type: 'polygon',
        label: activeCategory,
        points: normPoints
      };
      
      const updatedShapes = [...annotations.shapes, newShape];
      setAnnotations({ ...annotations, shapes: updatedShapes });
      setSelectedShapeIdx(updatedShapes.length - 1);
    }
    setTempPolygonPoints([]);
  };

  // Find shape index under coordinates
  const findClickedShapeIndex = (coords) => {
    // Traverse in reverse order to select top shapes first
    for (let i = annotations.shapes.length - 1; i >= 0; i--) {
      const shape = annotations.shapes[i];
      const pts = shape.points;
      
      if (shape.type === 'rect') {
        const x_min = Math.min(pts[0][0], pts[1][0]) * naturalWidth;
        const y_min = Math.min(pts[0][1], pts[1][1]) * naturalHeight;
        const x_max = Math.max(pts[0][0], pts[1][0]) * naturalWidth;
        const y_max = Math.max(pts[0][1], pts[1][1]) * naturalHeight;
        
        // Add 5px padding for easy click select
        if (coords.x >= x_min - 5 && coords.x <= x_max + 5 &&
            coords.y >= y_min - 5 && coords.y <= y_max + 5) {
          return i;
        }
      } else {
        // Check if click is inside polygon boundaries (ray casting algorithm)
        if (isPointInPolygon(coords, pts)) {
          return i;
        }
      }
    }
    return null;
  };

  // Ray Casting Algorithm to detect click inside polygon
  const isPointInPolygon = (point, polygon) => {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      let xi = polygon[i][0] * naturalWidth, yi = polygon[i][1] * naturalHeight;
      let xj = polygon[j][0] * naturalWidth, yj = polygon[j][1] * naturalHeight;
      
      let intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleDeleteShape = (idx) => {
    const updated = annotations.shapes.filter((_, i) => i !== idx);
    setAnnotations({ ...annotations, shapes: updated });
    setSelectedShapeIdx(null);
  };

  const handleSaveAndNavigate = async (indexDir) => {
    // Auto-save before changing image
    await saveCurrentAnnotations();
    const nextIdx = activeImageIdx + indexDir;
    if (nextIdx >= 0 && nextIdx < images.length) {
      setActiveImageIdx(nextIdx);
    }
  };

  const saveCurrentAnnotations = async () => {
    if (!activeImage) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/label/tasks/${task.task_id}/annotations/${activeImage.filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: activeImage.filename,
          width: naturalWidth,
          height: naturalHeight,
          shapes: annotations.shapes
        })
      });
      if (res.ok) {
        // Update local images list labeled state
        const updatedImages = [...images];
        updatedImages[activeImageIdx].is_labeled = annotations.shapes.length > 0;
        updatedImages[activeImageIdx].shapes_count = annotations.shapes.length;
        setImages(updatedImages);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = async () => {
    await saveCurrentAnnotations();
    onBack();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height) - 40px)', margin: '-10px -20px 0 -20px' }}>
      
      {/* Workspace Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '12px 24px', 
        backgroundColor: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border-light)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={handleFinish}>
            <ArrowLeft size={16} /> 返回列表
          </button>
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{task.name} ({task.type === 'detection' ? '目标识别' : '语义分割'})</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              当前图像: <code style={{ color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>{activeImage?.filename}</code> ({activeImageIdx + 1} / {images.length})
            </span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '4px', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button className="btn btn-outline" style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} title="缩小">
              <ZoomOut size={14} />
            </button>
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRight: '1px solid var(--border-light)', borderLeft: '1px solid var(--border-light)', minWidth: '55px', justifyContent: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button className="btn btn-outline" style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setZoom(Math.min(3, zoom + 0.25))} title="放大">
              <ZoomIn size={14} />
            </button>
            <button className="btn btn-outline" style={{ border: 'none', padding: '6px 10px', borderRadius: 0 }} onClick={() => setZoom(1)} title="重置">
              <RotateCcw size={14} />
            </button>
          </div>

          <button className="btn btn-primary" onClick={saveCurrentAnnotations} disabled={saving}>
            <Save size={14} /> {saving ? "正在保存..." : "保存标签 (Ctrl+S)"}
          </button>
          
          <button className="btn btn-outline" style={{ padding: '6px' }} onClick={() => setShowHelp(!showHelp)}>
            <HelpCircle size={18} />
          </button>
        </div>
      </div>

      {/* Main Workspace Workspace */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Left Side: Images Checklist */}
        <div style={{ 
          width: '240px', 
          backgroundColor: 'rgba(10, 12, 28, 0.4)', 
          borderRight: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div className="form-label" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-light)', fontSize: '0.75rem' }}>
            图片列表 ({images.length})
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {images.map((img, idx) => (
              <div 
                key={img.filename}
                onClick={() => {
                  saveCurrentAnnotations();
                  setActiveImageIdx(idx);
                }}
                style={{ 
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: activeImageIdx === idx ? 'var(--color-primary-glow)' : 'transparent',
                  border: `1px solid ${activeImageIdx === idx ? 'var(--border-active)' : 'transparent'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'var(--transition-base)',
                  marginBottom: '2px'
                }}
              >
                <span style={{ 
                  fontSize: '0.8rem', 
                  fontFamily: 'var(--font-mono)',
                  color: activeImageIdx === idx ? 'var(--text-main)' : 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1
                }}>
                  {img.filename}
                </span>

                {img.is_labeled && (
                  <span className="badge badge-success" style={{ padding: '2px 4px', fontSize: '0.65rem' }}>
                    {img.shapes_count}个
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: Canvas Workspace */}
        <div style={{ 
          flex: 1, 
          backgroundColor: '#030408', 
          position: 'relative', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          overflow: 'auto',
          padding: '20px'
        }}>
          {activeImage ? (
            <div style={{ 
              position: 'relative',
              width: `${naturalWidth * zoom}px`,
              height: `${naturalHeight * zoom}px`,
              boxShadow: '0 10px 40px rgba(0,0,0,0.8)',
              transition: 'width 0.1s, height 0.1s'
            }}>
              {/* Invisible Image to capture natural size */}
              <img 
                ref={imageRef}
                src={`/api/label/tasks/${task.task_id}/image-content/${activeImage.filename}`}
                style={{ display: 'none' }}
                onLoad={handleImageLoad}
                alt="source-loader"
              />

              {/* Annotation SVG Canvas */}
              <svg
                ref={svgRef}
                viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
                width="100%"
                height="100%"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  cursor: isDrawing ? 'crosshair' : 'default',
                  userSelect: 'none'
                }}
              >
                {/* Image underlay */}
                <image
                  href={`/api/label/tasks/${task.task_id}/image-content/${activeImage.filename}`}
                  width={naturalWidth}
                  height={naturalHeight}
                />

                {/* Render Existing Shapes */}
                {annotations.shapes.map((shape, shapeIdx) => {
                  const pts = shape.points;
                  const isSelected = selectedShapeIdx === shapeIdx;
                  
                  if (shape.type === 'rect') {
                    const x_min = Math.min(pts[0][0], pts[1][0]) * naturalWidth;
                    const y_min = Math.min(pts[0][1], pts[1][1]) * naturalHeight;
                    const x_max = Math.max(pts[0][0], pts[1][0]) * naturalWidth;
                    const y_max = Math.max(pts[0][1], pts[1][1]) * naturalHeight;
                    const w = x_max - x_min;
                    const h = y_max - y_min;

                    return (
                      <g key={shapeIdx}>
                        <rect
                          x={x_min}
                          y={y_min}
                          width={w}
                          height={h}
                          fill="rgba(124, 58, 237, 0.1)"
                          stroke={isSelected ? 'var(--color-cyan)' : 'var(--color-primary)'}
                          strokeWidth={isSelected ? 3 / zoom : 2 / zoom}
                          style={{ cursor: isSelected ? 'move' : 'pointer' }}
                        />
                        {/* Text Label Tag */}
                        <rect
                          x={x_min}
                          y={y_min - 20 / zoom}
                          width={60 / zoom}
                          height={20 / zoom}
                          fill={isSelected ? 'var(--color-cyan)' : 'var(--color-primary)'}
                        />
                        <text
                          x={x_min + 4 / zoom}
                          y={y_min - 5 / zoom}
                          fill="white"
                          fontSize={`${12 / zoom}px`}
                          fontWeight="bold"
                        >
                          {shape.label}
                        </text>

                        {/* Corner Resize Handles if selected */}
                        {isSelected && [
                          { x: x_min, y: y_min, ptIdx: 0 },
                          { x: x_max, y: y_max, ptIdx: 1 }
                        ].map((handle, hIdx) => (
                          <rect
                            key={hIdx}
                            x={handle.x - 4 / zoom}
                            y={handle.y - 4 / zoom}
                            width={8 / zoom}
                            height={8 / zoom}
                            fill="white"
                            stroke="black"
                            strokeWidth={1 / zoom}
                            style={{ cursor: 'nwse-resize' }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setDraggingPoint({ shapeIdx, pointIdx: handle.ptIdx });
                            }}
                          />
                        ))}
                      </g>
                    );
                  } else {
                    // Polygon Segmentation
                    const pointsStr = pts.map(p => `${p[0] * naturalWidth},${p[1] * naturalHeight}`).join(' ');

                    return (
                      <g key={shapeIdx}>
                        <polygon
                          points={pointsStr}
                          fill="rgba(16, 185, 129, 0.12)"
                          stroke={isSelected ? 'var(--color-cyan)' : 'var(--color-success)'}
                          strokeWidth={isSelected ? 3 / zoom : 2 / zoom}
                          style={{ cursor: 'pointer' }}
                        />
                        {/* Label Tag */}
                        <rect
                          x={pts[0][0] * naturalWidth}
                          y={pts[0][1] * naturalHeight - 20 / zoom}
                          width={60 / zoom}
                          height={20 / zoom}
                          fill={isSelected ? 'var(--color-cyan)' : 'var(--color-success)'}
                        />
                        <text
                          x={pts[0][0] * naturalWidth + 4 / zoom}
                          y={pts[0][1] * naturalHeight - 5 / zoom}
                          fill="white"
                          fontSize={`${12 / zoom}px`}
                          fontWeight="bold"
                        >
                          {shape.label}
                        </text>

                        {/* Polygon Point Handles if selected */}
                        {isSelected && pts.map((pt, ptIdx) => (
                          <circle
                            key={ptIdx}
                            cx={pt[0] * naturalWidth}
                            cy={pt[1] * naturalHeight}
                            r={5 / zoom}
                            fill="white"
                            stroke="black"
                            strokeWidth={1 / zoom}
                            style={{ cursor: 'move' }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setDraggingPoint({ shapeIdx, pointIdx });
                            }}
                          />
                        ))}
                      </g>
                    );
                  }
                })}

                {/* Render Temporary Rect being drawn */}
                {isDrawing && task.type === 'detection' && tempRect && (
                  <rect
                    x={Math.min(tempRect.x1, tempRect.x2)}
                    y={Math.min(tempRect.y1, tempRect.y2)}
                    width={Math.abs(tempRect.x2 - tempRect.x1)}
                    height={Math.abs(tempRect.y2 - tempRect.y1)}
                    fill="rgba(124, 58, 237, 0.15)"
                    stroke="var(--color-primary)"
                    strokeWidth={2 / zoom}
                    strokeDasharray="4 4"
                  />
                )}

                {/* Render Temporary Polygon points being drawn */}
                {isDrawing && task.type === 'segmentation' && tempPolygonPoints.length > 0 && (
                  <g>
                    {/* Closed Lines */}
                    {tempPolygonPoints.map((pt, idx) => {
                      if (idx === 0) return null;
                      const prevPt = tempPolygonPoints[idx - 1];
                      return (
                        <line
                          key={idx}
                          x1={prevPt[0]}
                          y1={prevPt[1]}
                          x2={pt[0]}
                          y2={pt[1]}
                          stroke="var(--color-success)"
                          strokeWidth={2 / zoom}
                        />
                      );
                    })}
                    {/* Dotted connector to cursor */}
                    <line
                      x1={tempPolygonPoints[tempPolygonPoints.length - 1][0]}
                      y1={tempPolygonPoints[tempPolygonPoints.length - 1][1]}
                      x2={cursorPos.x}
                      y2={cursorPos.y}
                      stroke="var(--color-success)"
                      strokeWidth={1.5 / zoom}
                      strokeDasharray="3 3"
                    />
                    {/* Vertex handle dots */}
                    {tempPolygonPoints.map((pt, idx) => (
                      <circle
                        key={idx}
                        cx={pt[0]}
                        cy={pt[1]}
                        r={idx === 0 ? 7 / zoom : 4 / zoom}
                        fill={idx === 0 ? 'var(--color-cyan)' : 'white'}
                        stroke="black"
                        strokeWidth={1 / zoom}
                        style={{ cursor: idx === 0 ? 'pointer' : 'default' }}
                        onClick={(e) => {
                          if (idx === 0 && tempPolygonPoints.length >= 3) {
                            e.stopPropagation();
                            finishPolygonDrawing();
                          }
                        }}
                      />
                    ))}
                  </g>
                )}
              </svg>
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)' }}>暂无可用图片</div>
          )}

          {/* Navigation Overlay */}
          <div style={{ 
            position: 'absolute', 
            bottom: '20px', 
            display: 'flex', 
            gap: '8px', 
            backgroundColor: 'var(--bg-sidebar)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
          }}>
            <button className="btn btn-outline" style={{ padding: '6px 12px' }} disabled={activeImageIdx === 0} onClick={() => handleSaveAndNavigate(-1)}>
              <ChevronLeft size={16} /> 上一张
            </button>
            <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-main)', padding: '0 8px' }}>
              {activeImageIdx + 1} / {images.length}
            </span>
            <button className="btn btn-outline" style={{ padding: '6px 12px' }} disabled={activeImageIdx === images.length - 1} onClick={() => handleSaveAndNavigate(1)}>
              下一张 <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Right Side: Category Selection & Annotation List */}
        <div style={{ 
          width: '260px', 
          backgroundColor: 'rgba(10, 12, 28, 0.4)', 
          borderLeft: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
          gap: '20px'
        }}>
          {/* Category selection */}
          <div>
            <div className="form-label" style={{ marginBottom: '8px', fontSize: '0.75rem' }}>类别标签库</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {task.classes.map((cls, idx) => (
                <button
                  key={cls}
                  className="btn"
                  style={{ 
                    justifyContent: 'flex-start',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    border: `1.5px solid ${activeCategory === cls ? 'var(--color-primary)' : 'var(--border-light)'}`,
                    backgroundColor: activeCategory === cls ? 'var(--color-primary-glow)' : 'transparent',
                    color: 'var(--text-main)'
                  }}
                  onClick={() => setActiveCategory(cls)}
                >
                  <span style={{ 
                    width: '18px', 
                    height: '18px', 
                    borderRadius: '4px', 
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    marginRight: '8px',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text-secondary)'
                  }}>
                    {idx}
                  </span>
                  {cls}
                </button>
              ))}
            </div>
          </div>

          {/* Active shapes list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="form-label" style={{ marginBottom: '8px', fontSize: '0.75rem' }}>当前图片标注列表 ({annotations.shapes.length})</div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {annotations.shapes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  暂无标注。请在左侧图像上绘制。
                </div>
              ) : (
                annotations.shapes.map((shape, idx) => (
                  <div
                    key={idx}
                    onClick={() => setSelectedShapeIdx(idx)}
                    style={{ 
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1.5px solid ${selectedShapeIdx === idx ? 'var(--color-cyan)' : 'var(--border-light)'}`,
                      backgroundColor: selectedShapeIdx === idx ? 'rgba(6,182,212,0.06)' : 'rgba(255,255,255,0.01)',
                      cursor: 'pointer',
                      fontSize: '0.85rem'
                    }}
                  >
                    <div>
                      <strong style={{ color: shape.type === 'rect' ? 'var(--color-primary)' : 'var(--color-success)' }}>
                        {shape.type === 'rect' ? '检测' : '分割'}
                      </strong>
                      <span style={{ marginLeft: '8px', color: 'var(--text-main)', fontWeight: 500 }}>{shape.label}</span>
                    </div>
                    <button 
                      className="btn" 
                      style={{ padding: '4px', border: 'none', backgroundColor: 'transparent', color: 'var(--text-muted)' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteShape(idx);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Help Modal Overlay */}
      {showHelp && (
        <div style={{ 
          position: 'absolute', 
          top: 'var(--header-height)', 
          right: '24px', 
          width: '320px', 
          zIndex: 200, 
          backgroundColor: 'var(--bg-sidebar)',
          border: '1px solid var(--border-light)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.8)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <AlertCircle size={16} style={{ color: 'var(--color-cyan)' }} />
            <strong style={{ fontSize: '0.9rem' }}>标注快捷键 & 操作说明</strong>
          </div>
          <ul style={{ listStyle: 'none', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li><strong>数字键 0-9</strong>: 快速选择前 10 个类别标签。</li>
            <li><strong>Ctrl + S</strong>: 保存当前图片的标注。</li>
            <li><strong>Esc</strong>: 取消当前绘制或清空选中。</li>
            <li><strong>Delete / Backspace</strong>: 删除选中的图形。</li>
            <li>
              <strong>目标识别绘制</strong>: 
              <br />在图像上直接按住鼠标左键并拖拽，即可绘制矩形检测框。点击选中后可拖拽边角大小。
            </li>
            <li>
              <strong>语义分割绘制</strong>:
              <br />在图像上点击添加多边形顶点，点击第一个起始点或按 <strong>Enter</strong> 键可以闭合图形。选中后可以拖拽任意顶点调整形状。
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
