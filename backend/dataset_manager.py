import os
import shutil
import zipfile
import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional

DATASETS_DIR = Path(__file__).parent / "data" / "datasets"

class DatasetManager:
    def __init__(self):
        DATASETS_DIR.mkdir(parents=True, exist_ok=True)

    def list_datasets(self) -> List[Dict[str, Any]]:
        """List all available datasets and their metadata."""
        datasets = []
        if not DATASETS_DIR.exists():
            return datasets

        for item in DATASETS_DIR.iterdir():
            if item.is_dir():
                meta = self.get_dataset_info(item.name)
                if meta:
                    datasets.append(meta)
        return datasets

    def get_dataset_info(self, dataset_name: str) -> Optional[Dict[str, Any]]:
        """Get details about a specific dataset."""
        dataset_path = DATASETS_DIR / dataset_name
        if not dataset_path.exists() or not dataset_path.is_dir():
            return None

        # Look for data.yaml or any yaml file in the root
        yaml_files = list(dataset_path.glob("*.yaml"))
        if not yaml_files:
            # Check if it's nested (sometimes zip extraction creates a nested folder)
            subfolders = [d for d in dataset_path.iterdir() if d.is_dir()]
            if len(subfolders) == 1:
                yaml_files = list(subfolders[0].glob("*.yaml"))
                if yaml_files:
                    # Move files up one level to flatten
                    for f in subfolders[0].iterdir():
                        shutil.move(str(f), str(dataset_path))
                    subfolders[0].rmdir()
                    yaml_files = list(dataset_path.glob("*.yaml"))

        if not yaml_files:
            return {
                "name": dataset_name,
                "path": str(dataset_path),
                "is_valid": False,
                "error": "No data.yaml file found in the root of the dataset.",
                "classes": [],
                "num_classes": 0
            }

        yaml_path = yaml_files[0]
        try:
            with open(yaml_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            
            classes = data.get("names", [])
            if isinstance(classes, dict):
                classes = list(classes.values())
            
            # Auto-fix path in yaml to point to absolute path
            # This is crucial for YOLO training to locate files correctly
            updated = False
            if "path" not in data or data["path"] != str(dataset_path.absolute()):
                data["path"] = str(dataset_path.absolute()).replace("\\", "/")
                updated = True
            
            # Ensure train/val paths are correct
            for key in ["train", "val", "test"]:
                if key in data:
                    # If paths are absolute, leave them or make them relative
                    pass

            if updated:
                with open(yaml_path, "w", encoding="utf-8") as f:
                    yaml.safe_dump(data, f, sort_keys=False)

            return {
                "name": dataset_name,
                "path": str(dataset_path.absolute()).replace("\\", "/"),
                "yaml_file": yaml_path.name,
                "yaml_path": str(yaml_path.absolute()).replace("\\", "/"),
                "is_valid": True,
                "classes": classes,
                "num_classes": len(classes),
                "train_path": data.get("train", "train"),
                "val_path": data.get("val", "val")
            }
        except Exception as e:
            return {
                "name": dataset_name,
                "path": str(dataset_path),
                "is_valid": False,
                "error": f"Failed to parse YAML: {str(e)}",
                "classes": [],
                "num_classes": 0
            }

    def save_and_extract_dataset(self, file_name: str, file_content: bytes) -> Dict[str, Any]:
        """Save a ZIP dataset, extract it, validate, and return info."""
        # Create a temp name or sanitize file name
        dataset_name = Path(file_name).stem
        # Ensure name is unique
        counter = 1
        original_name = dataset_name
        while (DATASETS_DIR / dataset_name).exists():
            dataset_name = f"{original_name}_{counter}"
            counter += 1

        target_dir = DATASETS_DIR / dataset_name
        target_dir.mkdir(parents=True, exist_ok=True)

        zip_path = target_dir / file_name
        try:
            # Write zip file
            with open(zip_path, "wb") as f:
                f.write(file_content)

            # Extract zip file
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(target_dir)

            # Delete the zip file after extraction
            os.remove(zip_path)

            # Validate and fetch info
            info = self.get_dataset_info(dataset_name)
            return info
        except Exception as e:
            # Clean up on failure
            if target_dir.exists():
                shutil.rmtree(target_dir)
            return {
                "name": dataset_name,
                "is_valid": False,
                "error": f"Failed to extract zip: {str(e)}"
            }

    def delete_dataset(self, dataset_name: str) -> bool:
        """Delete a dataset from local storage."""
        dataset_path = DATASETS_DIR / dataset_name
        if dataset_path.exists() and dataset_path.is_dir():
            shutil.rmtree(dataset_path)
            return True
        return False
