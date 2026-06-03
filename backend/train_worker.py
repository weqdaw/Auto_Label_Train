import os
import sys
import argparse
import json
import logging
from pathlib import Path
from ultralytics import YOLO

# Configure logging
logging.basicConfig(level=logging.INFO, format="[YOLO-WORKER] %(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("yolo_worker")

def main():
    parser = argparse.ArgumentParser(description="YOLO Training Subprocess Worker")
    parser.add_argument("--model", type=str, required=True, help="Path to initial weights file")
    parser.add_argument("--data", type=str, required=True, help="Path to data.yaml")
    parser.add_argument("--epochs", type=int, default=10, help="Number of training epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--device", type=str, default="cpu", help="Device (cpu, 0, cuda, etc.)")
    parser.add_argument("--project", type=str, required=True, help="Output project directory")
    parser.add_argument("--name", type=str, required=True, help="Run name")
    parser.add_argument("--progress-file", type=str, required=True, help="Path to write progress JSON")
    
    args = parser.parse_args()

    progress_path = Path(args.progress_file)
    progress_path.parent.mkdir(parents=True, exist_ok=True)

    # Initial state
    write_progress(progress_path, {
        "status": "starting",
        "epoch": 0,
        "total_epochs": args.epochs,
        "metrics": {},
        "losses": {},
        "progress": 0.0
    })

    try:
        # Load model
        logger.info(f"Loading model: {args.model}")
        model = YOLO(args.model)

        # Register callbacks to track progress
        def on_fit_epoch_end(trainer):
            # trainer.epoch is 0-indexed current epoch
            epoch = trainer.epoch + 1
            total_epochs = trainer.epochs
            
            # Extract metrics
            # trainer.metrics contains standard evaluation metrics
            metrics = {}
            for k, v in trainer.metrics.items():
                # Clean up metric names for frontend consumption
                clean_key = k.replace("metrics/", "")
                metrics[clean_key] = float(v)
            
            # Extract losses
            losses = {}
            if hasattr(trainer, "loss_items") and trainer.loss_items is not None:
                # YOLOv8 losses: box, cls, dfl
                loss_names = trainer.loss_names
                for i, name in enumerate(loss_names):
                    if i < len(trainer.loss_items):
                        losses[name] = float(trainer.loss_items[i])
            
            progress = round((epoch / total_epochs) * 100, 2)
            
            status_data = {
                "status": "training",
                "epoch": epoch,
                "total_epochs": total_epochs,
                "metrics": metrics,
                "losses": losses,
                "progress": progress
            }
            
            logger.info(f"Epoch {epoch}/{total_epochs} completed. Progress: {progress}%. Loss: {losses}")
            write_progress(progress_path, status_data)

        # Register callback
        model.add_callback("on_fit_epoch_end", on_fit_epoch_end)

        logger.info(f"Starting training on data: {args.data} for {args.epochs} epochs")
        # Run training
        results = model.train(
            data=args.data,
            epochs=args.epochs,
            batch=args.batch,
            imgsz=args.imgsz,
            device=args.device,
            project=args.project,
            name=args.name,
            exist_ok=True,
            verbose=True
        )

        logger.info("Training completed successfully")
        write_progress(progress_path, {
            "status": "completed",
            "epoch": args.epochs,
            "total_epochs": args.epochs,
            "progress": 100.0,
            "save_dir": str(results.save_dir) if hasattr(results, "save_dir") else os.path.join(args.project, args.name)
        })

    except Exception as e:
        logger.error(f"Training failed: {str(e)}", exc_info=True)
        write_progress(progress_path, {
            "status": "failed",
            "error": str(e),
            "progress": 100.0
        })
        sys.exit(1)

def write_progress(path: Path, data: dict):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to write progress: {str(e)}")

if __name__ == "__main__":
    main()
