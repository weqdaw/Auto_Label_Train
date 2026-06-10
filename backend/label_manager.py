import os
import json
import time
import shutil
import random
from pathlib import Path
from typing import List, Dict, Any, Optional

DATA_DIR = Path(__file__).parent / "data"
TASKS_FILE = DATA_DIR / "labeling_tasks.json"
ANNOTATIONS_DIR = DATA_DIR / "annotations"
EXPORT_DATASETS_DIR = DATA_DIR / "datasets"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".JPG", ".JPEG", ".PNG", ".BMP"}

class LabelManager:
    def __init__(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
        EXPORT_DATASETS_DIR.mkdir(parents=True, exist_ok=True)
        if not TASKS_FILE.exists():
            self._save_tasks([])

    def _load_tasks(self) -> List[Dict[str, Any]]:
        if not TASKS_FILE.exists():
            return []
        try:
            with open(TASKS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _save_tasks(self, tasks: List[Dict[str, Any]]):
        with open(TASKS_FILE, "w", encoding="utf-8") as f:
            json.dump(tasks, f, indent=2, ensure_ascii=False)

    def _distribute_images(self, images: List[str], users: List[str]) -> Dict[str, List[str]]:
        if not users:
            return {}
        assignments = {u: [] for u in users}
        sorted_images = sorted(images)
        for idx, img in enumerate(sorted_images):
            # Round-robin distribution
            user = users[idx % len(users)]
            assignments[user].append(img)
        return assignments

    def list_tasks(self, username: str, role: str) -> List[Dict[str, Any]]:
        """List tasks. Admin sees all tasks. Regular users see only their assigned tasks with personal progress."""
        all_tasks = self._load_tasks()
        visible_tasks = []

        for task in all_tasks:
            task_id = task["task_id"]
            assigned_users = task.get("assigned_users", [])
            assignments = task.get("assignments", {})

            # Access Control
            if role != "admin" and username not in assigned_users:
                continue

            img_dir = Path(task["image_folder_path"])
            
            # Count total images and labeled images based on role
            task_ann_dir = ANNOTATIONS_DIR / task_id

            if role == "admin":
                # Admin: See global stats
                images = []
                if img_dir.exists() and img_dir.is_dir():
                    images = [f.name for f in img_dir.iterdir() if f.is_file() and f.suffix in IMAGE_EXTENSIONS]
                task["total_images"] = len(images)
                
                # Count global labeled images
                labeled_count = 0
                if task_ann_dir.exists():
                    for ann_file in task_ann_dir.glob("*.json"):
                        try:
                            with open(ann_file, "r", encoding="utf-8") as f:
                                ann_data = json.load(f)
                                if ann_data.get("shapes") and len(ann_data["shapes"]) > 0:
                                    labeled_count += 1
                        except Exception:
                            pass
                task["labeled_images"] = labeled_count
            else:
                # Regular User: See only personal stats
                user_images = assignments.get(username, [])
                task["total_images"] = len(user_images)

                # Count personal labeled images
                labeled_count = 0
                for filename in user_images:
                    ann_file = task_ann_dir / f"{filename}.json"
                    if ann_file.exists():
                        try:
                            with open(ann_file, "r", encoding="utf-8") as f:
                                ann_data = json.load(f)
                                if ann_data.get("shapes") and len(ann_data["shapes"]) > 0:
                                    labeled_count += 1
                        except Exception:
                            pass
                task["labeled_images"] = labeled_count

            visible_tasks.append(task)
            
        return visible_tasks

    def create_task(self, name: str, task_type: str, image_folder_path: str, classes: List[str], assigned_users: List[str]) -> Dict[str, Any]:
        """Create a new labeling task and distribute images round-robin among assigned users."""
        if not assigned_users:
            raise ValueError("必须指派至少一名标注人员！")

        img_dir = Path(image_folder_path)
        if not img_dir.exists() or not img_dir.is_dir():
            raise FileNotFoundError(f"指定的图片目录不存在或不是文件夹: {image_folder_path}")

        images = [f.name for f in img_dir.iterdir() if f.is_file() and f.suffix in IMAGE_EXTENSIONS]
        if len(images) == 0:
            raise ValueError(f"指定的目录中未找到任何支持的图片格式 (.jpg, .png, etc.): {image_folder_path}")

        task_id = f"task_{int(time.time())}"
        
        # Ensure annotation directory for this task exists
        (ANNOTATIONS_DIR / task_id).mkdir(parents=True, exist_ok=True)

        # Distribute images
        assignments = self._distribute_images(images, assigned_users)

        new_task = {
            "task_id": task_id,
            "name": name.strip(),
            "type": task_type,  # "detection" or "segmentation"
            "image_folder_path": str(img_dir.absolute()).replace("\\", "/"),
            "classes": [c.strip() for c in classes if c.strip()],
            "created_at": time.time(),
            "assigned_users": assigned_users,
            "assignments": assignments,
            "total_images": len(images),
            "labeled_images": 0
        }

        tasks = self._load_tasks()
        tasks.append(new_task)
        self._save_tasks(tasks)
        return new_task

    def delete_task(self, task_id: str) -> bool:
        """Delete a labeling task and its local annotations."""
        tasks = self._load_tasks()
        task_found = False
        new_tasks = []
        for t in tasks:
            if t["task_id"] == task_id:
                task_found = True
                # Remove annotation folder
                task_ann_dir = ANNOTATIONS_DIR / task_id
                if task_ann_dir.exists():
                    shutil.rmtree(task_ann_dir)
            else:
                new_tasks.append(t)
        
        if task_found:
            self._save_tasks(new_tasks)
            return True
        return False

    def get_task_images(self, task_id: str, username: str, role: str) -> List[Dict[str, Any]]:
        """Get list of images. Filtered by assignment for regular users."""
        tasks = self._load_tasks()
        task = next((t for t in tasks if t["task_id"] == task_id), None)
        if not task:
            raise KeyError("Task not found")

        img_dir = Path(task["image_folder_path"])
        if not img_dir.exists() or not img_dir.is_dir():
            return []

        # Access Control: Get assigned images
        assignments = task.get("assignments", {})
        if role == "admin":
            target_filenames = [f.name for f in img_dir.iterdir() if f.is_file() and f.suffix in IMAGE_EXTENSIONS]
        else:
            target_filenames = assignments.get(username, [])

        images = []
        task_ann_dir = ANNOTATIONS_DIR / task_id
        
        for filename in target_filenames:
            img_file = img_dir / filename
            if img_file.exists() and img_file.is_file():
                # Check if it has annotations
                ann_file = task_ann_dir / f"{filename}.json"
                is_labeled = False
                shapes_count = 0
                if ann_file.exists():
                    try:
                        with open(ann_file, "r", encoding="utf-8") as af:
                            ann_data = json.load(af)
                            shapes_count = len(ann_data.get("shapes", []))
                            is_labeled = shapes_count > 0
                    except Exception:
                        pass
                
                images.append({
                    "filename": filename,
                    "is_labeled": is_labeled,
                    "shapes_count": shapes_count,
                    "size": img_file.stat().st_size
                })
        
        # Sort images by filename
        images.sort(key=lambda x: x["filename"])
        return images

    def get_image_path(self, task_id: str, filename: str, username: str, role: str) -> str:
        """Get the absolute path to an image. Checked for user assignment permission."""
        tasks = self._load_tasks()
        task = next((t for t in tasks if t["task_id"] == task_id), None)
        if not task:
            raise KeyError("Task not found")
        
        # Access control check
        if role != "admin":
            assigned_images = task.get("assignments", {}).get(username, [])
            if filename not in assigned_images:
                raise PermissionError("您没有被指派此图片的标注任务！")
                
        img_path = Path(task["image_folder_path"]) / filename
        if not img_path.exists():
            raise FileNotFoundError(f"Image not found: {filename}")
        return str(img_path.absolute())

    def get_image_annotations(self, task_id: str, filename: str, username: str, role: str) -> Dict[str, Any]:
        """Load annotations. Validated for user assignment permission."""
        tasks = self._load_tasks()
        task = next((t for t in tasks if t["task_id"] == task_id), None)
        if not task:
            raise KeyError("Task not found")

        # Access control check
        if role != "admin":
            assigned_images = task.get("assignments", {}).get(username, [])
            if filename not in assigned_images:
                raise PermissionError("您没有被指派此图片的标注任务！")

        ann_file = ANNOTATIONS_DIR / task_id / f"{filename}.json"
        if ann_file.exists():
            try:
                with open(ann_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        
        return {
            "filename": filename,
            "shapes": []
        }

    def save_image_annotations(self, task_id: str, filename: str, payload: Dict[str, Any], username: str, role: str) -> bool:
        """Save annotations. Validated for user assignment permission."""
        tasks = self._load_tasks()
        task = next((t for t in tasks if t["task_id"] == task_id), None)
        if not task:
            raise KeyError("Task not found")

        # Access control check
        if role != "admin":
            assigned_images = task.get("assignments", {}).get(username, [])
            if filename not in assigned_images:
                raise PermissionError("您没有被指派此图片的标注任务！")

        task_ann_dir = ANNOTATIONS_DIR / task_id
        task_ann_dir.mkdir(parents=True, exist_ok=True)
        
        ann_file = task_ann_dir / f"{filename}.json"
        try:
            with open(ann_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            return True
        except Exception:
            return False

    def export_task_to_dataset(self, task_id: str, val_split: float = 0.2) -> Dict[str, Any]:
        """Export labeled images as a standard YOLO dataset (combining all users' annotations)."""
        tasks = self._load_tasks()
        task = next((t for t in tasks if t["task_id"] == task_id), None)
        if not task:
            raise KeyError("Task not found")

        # Gather labeled images (admin only, grabs all annotations)
        img_dir = Path(task["image_folder_path"])
        task_ann_dir = ANNOTATIONS_DIR / task_id
        
        labeled_files = []
        if task_ann_dir.exists():
            for ann_file in task_ann_dir.glob("*.json"):
                img_name = ann_file.stem  # e.g., image.jpg (since filename is image.jpg.json)
                img_path = img_dir / img_name
                if img_path.exists():
                    try:
                        with open(ann_file, "r", encoding="utf-8") as f:
                            ann_data = json.load(f)
                            if ann_data.get("shapes") and len(ann_data["shapes"]) > 0:
                                labeled_files.append((img_path, ann_data))
                    except Exception:
                        pass

        if len(labeled_files) == 0:
            raise ValueError("没有已标注的图片！请至少标注 1 张图片后再导出。")

        # Shuffle and Split
        random.shuffle(labeled_files)
        val_count = int(len(labeled_files) * val_split)
        val_set = labeled_files[:val_count]
        train_set = labeled_files[val_count:]

        # Export directory structure under data/datasets/
        safe_name = "".join([c if c.isalnum() or c in ("-", "_") else "_" for c in task["name"]])
        export_dir = EXPORT_DATASETS_DIR / f"label_{safe_name}"
        
        # Clean up existing export if any
        if export_dir.exists():
            shutil.rmtree(export_dir)

        # Create directories
        for split in ["train", "val"]:
            (export_dir / split / "images").mkdir(parents=True, exist_ok=True)
            (export_dir / split / "labels").mkdir(parents=True, exist_ok=True)

        classes = task["classes"]
        class_to_idx = {name: idx for idx, name in enumerate(classes)}

        def write_yolo_labels(items, split):
            for img_path, ann in items:
                # Copy image
                dest_img_path = export_dir / split / "images" / img_path.name
                shutil.copy(img_path, dest_img_path)
                
                # Write label text file
                label_path = export_dir / split / "labels" / f"{img_path.stem}.txt"
                with open(label_path, "w", encoding="utf-8") as lf:
                    for shape in ann.get("shapes", []):
                        label_name = shape.get("label")
                        if label_name not in class_to_idx:
                            continue
                        
                        class_id = class_to_idx[label_name]
                        points = shape.get("points", [])
                        
                        if not points:
                            continue

                        if task["type"] == "detection":
                            if len(points) >= 2:
                                p1, p2 = points[0], points[1]
                                x_min, y_min = min(p1[0], p2[0]), min(p1[1], p2[1])
                                x_max, y_max = max(p1[0], p2[0]), max(p1[1], p2[1])
                                
                                x_center = (x_min + x_max) / 2.0
                                y_center = (y_min + y_max) / 2.0
                                w = x_max - x_min
                                h = y_max - y_min
                                
                                x_center = max(0.0, min(1.0, x_center))
                                y_center = max(0.0, min(1.0, y_center))
                                w = max(0.0, min(1.0, w))
                                h = max(0.0, min(1.0, h))
                                
                                lf.write(f"{class_id} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}\n")
                        else:
                            flat_pts = []
                            for pt in points:
                                flat_pts.append(max(0.0, min(1.0, pt[0])))
                                flat_pts.append(max(0.0, min(1.0, pt[1])))
                            
                            if len(flat_pts) >= 6:
                                pts_str = " ".join([f"{val:.6f}" for val in flat_pts])
                                lf.write(f"{class_id} {pts_str}\n")

        write_yolo_labels(train_set, "train")
        write_yolo_labels(val_set, "val")

        # Generate data.yaml
        yaml_content = {
            "path": str(export_dir.absolute()).replace("\\", "/"),
            "train": "train/images",
            "val": "val/images",
            "nc": len(classes),
            "names": classes
        }

        yaml_path = export_dir / "data.yaml"
        with open(yaml_path, "w", encoding="utf-8") as yf:
            import yaml
            yaml.safe_dump(yaml_content, yf, sort_keys=False)

        return {
            "dataset_name": f"label_{safe_name}",
            "path": str(export_dir.absolute()).replace("\\", "/"),
            "yaml_path": str(yaml_path.absolute()).replace("\\", "/"),
            "train_count": len(train_set),
            "val_count": len(val_set)
        }
