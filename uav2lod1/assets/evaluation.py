"""
Stage 6 - Accuracy Assessment
Dagster asset: accuracy_report

This asset evaluates the pipeline results against ground truth data
and generates accuracy metrics and reports.
"""

import json
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime

import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Polygon
from dagster import asset, AssetExecutionContext, AssetIn

logger = logging.getLogger(__name__)


def compute_iou(poly1: Polygon, poly2: Polygon) -> float:
    """
    Compute Intersection over Union between two polygons.
    
    Args:
        poly1: First polygon
        poly2: Second polygon
        
    Returns:
        IoU value (0-1)
    """
    if not poly1.is_valid or not poly2.is_valid:
        return 0.0
    
    try:
        intersection = poly1.intersection(poly2).area
        union = poly1.union(poly2).area
        
        if union == 0:
            return 0.0
        
        return intersection / union
    except Exception:
        return 0.0


def match_footprints(
    pred_gdf: gpd.GeoDataFrame,
    truth_gdf: gpd.GeoDataFrame,
    iou_threshold: float = 0.5,
) -> tuple[list[tuple], list[int], list[int]]:
    """
    Match predicted footprints to ground truth using Hungarian algorithm.
    
    Args:
        pred_gdf: Predicted footprints
        truth_gdf: Ground truth footprints
        iou_threshold: Minimum IoU for a valid match
        
    Returns:
        Tuple of (matches, unmatched_pred_indices, unmatched_truth_indices)
    """
    logger.info("Matching predicted footprints to ground truth")
    
    n_pred = len(pred_gdf)
    n_truth = len(truth_gdf)
    
    if n_pred == 0 or n_truth == 0:
        return [], list(range(n_pred)), list(range(n_truth))
    
    # Build IoU matrix
    iou_matrix = np.zeros((n_pred, n_truth))
    
    for i, pred_row in pred_gdf.iterrows():
        for j, truth_row in truth_gdf.iterrows():
            iou_matrix[i, j] = compute_iou(pred_row.geometry, truth_row.geometry)
    
    # Apply Hungarian algorithm
    try:
        from scipy.optimize import linear_sum_assignment
        
        # Maximize IoU = minimize negative IoU
        cost_matrix = -iou_matrix
        row_ind, col_ind = linear_sum_assignment(cost_matrix)
        
        # Filter matches by threshold
        matches = []
        matched_pred = set()
        matched_truth = set()
        
        for pred_idx, truth_idx in zip(row_ind, col_ind):
            iou = iou_matrix[pred_idx, truth_idx]
            if iou >= iou_threshold:
                matches.append((pred_idx, truth_idx, iou))
                matched_pred.add(pred_idx)
                matched_truth.add(truth_idx)
        
        unmatched_pred = [i for i in range(n_pred) if i not in matched_pred]
        unmatched_truth = [i for i in range(n_truth) if i not in matched_truth]
        
        logger.info(f"Matched {len(matches)} footprints")
        return matches, unmatched_pred, unmatched_truth
        
    except ImportError:
        # Fallback: greedy matching
        logger.warning("scipy not available, using greedy matching")
        
        matches = []
        matched_pred = set()
        matched_truth = set()
        
        # Sort by IoU descending
        iou_pairs = []
        for i in range(n_pred):
            for j in range(n_truth):
                if iou_matrix[i, j] >= iou_threshold:
                    iou_pairs.append((i, j, iou_matrix[i, j]))
        
        iou_pairs.sort(key=lambda x: x[2], reverse=True)
        
        for pred_idx, truth_idx, iou in iou_pairs:
            if pred_idx not in matched_pred and truth_idx not in matched_truth:
                matches.append((pred_idx, truth_idx, iou))
                matched_pred.add(pred_idx)
                matched_truth.add(truth_idx)
        
        unmatched_pred = [i for i in range(n_pred) if i not in matched_pred]
        unmatched_truth = [i for i in range(n_truth) if i not in matched_truth]
        
        return matches, unmatched_pred, unmatched_truth


def compute_footprint_metrics(
    matches: list[tuple],
    n_pred: int,
    n_truth: int,
) -> dict:
    """
    Compute footprint detection metrics.
    
    Args:
        matches: List of (pred_idx, truth_idx, iou) tuples
        n_pred: Total predicted footprints
        n_truth: Total ground truth footprints
        
    Returns:
        Dictionary of metrics
    """
    tp = len(matches)
    fp = n_pred - tp
    fn = n_truth - tp
    
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    
    # Mean IoU of matched footprints
    mean_iou = np.mean([m[2] for m in matches]) if matches else 0
    
    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "completeness": recall,  # Alternative name
        "correctness": precision,  # Alternative name
        "mean_iou": mean_iou,
    }


def compute_height_metrics(
    pred_gdf: gpd.GeoDataFrame,
    truth_df: pd.DataFrame,
    matches: list[tuple],
) -> dict:
    """
    Compute height estimation metrics.
    
    Args:
        pred_gdf: Predicted footprints with heights
        truth_df: Ground truth heights (building_id, true_height)
        matches: List of matched footprint pairs
        
    Returns:
        Dictionary of height metrics
    """
    if "mean_height" not in pred_gdf.columns:
        return {"error": "No height predictions available"}
    
    if truth_df is None or len(truth_df) == 0:
        return {"error": "No ground truth heights available"}
    
    # Get matched heights
    pred_heights = []
    true_heights = []
    
    for pred_idx, truth_idx, _ in matches:
        pred_h = pred_gdf.iloc[pred_idx].get("mean_height", np.nan)
        
        # Try to get truth height by index or building_id
        if "true_height" in truth_df.columns:
            if truth_idx < len(truth_df):
                true_h = truth_df.iloc[truth_idx]["true_height"]
            else:
                continue
        else:
            continue
        
        if not np.isnan(pred_h) and not np.isnan(true_h):
            pred_heights.append(pred_h)
            true_heights.append(true_h)
    
    if len(pred_heights) == 0:
        return {"error": "No height comparisons available"}
    
    pred_heights = np.array(pred_heights)
    true_heights = np.array(true_heights)
    
    # Compute metrics
    errors = pred_heights - true_heights
    abs_errors = np.abs(errors)
    
    rmse = np.sqrt(np.mean(errors**2))
    mae = np.mean(abs_errors)
    mean_bias = np.mean(errors)
    std_error = np.std(errors)
    
    # Correlation
    if len(pred_heights) > 1:
        correlation = np.corrcoef(pred_heights, true_heights)[0, 1]
    else:
        correlation = np.nan
    
    return {
        "n_samples": len(pred_heights),
        "rmse_m": float(rmse),
        "mae_m": float(mae),
        "mean_bias_m": float(mean_bias),
        "std_error_m": float(std_error),
        "correlation": float(correlation) if not np.isnan(correlation) else None,
        "min_error_m": float(np.min(errors)),
        "max_error_m": float(np.max(errors)),
    }


def create_evaluation_plots(
    pred_heights: np.ndarray,
    true_heights: np.ndarray,
    footprint_metrics: dict,
    output_dir: Path,
) -> list[Path]:
    """
    Create evaluation plots (scatter plot, bar chart).
    
    Args:
        pred_heights: Predicted heights
        true_heights: True heights
        footprint_metrics: Footprint detection metrics
        output_dir: Output directory
        
    Returns:
        List of plot paths
    """
    try:
        import matplotlib.pyplot as plt
        
        plot_paths = []
        
        # Scatter plot: predicted vs true heights
        if len(pred_heights) > 0:
            fig, ax = plt.subplots(figsize=(8, 8))
            ax.scatter(true_heights, pred_heights, alpha=0.5, s=10)
            
            # Perfect prediction line
            min_val = min(true_heights.min(), pred_heights.min())
            max_val = max(true_heights.max(), pred_heights.max())
            ax.plot([min_val, max_val], [min_val, max_val], 'r--', label='Perfect prediction')
            
            ax.set_xlabel('True Height (m)')
            ax.set_ylabel('Predicted Height (m)')
            ax.set_title('Predicted vs True Building Heights')
            ax.legend()
            ax.grid(True, alpha=0.3)
            
            scatter_path = output_dir / "height_scatter.png"
            fig.savefig(scatter_path, dpi=150, bbox_inches='tight')
            plt.close(fig)
            plot_paths.append(scatter_path)
        
        # Bar chart: footprint metrics
        fig, ax = plt.subplots(figsize=(10, 6))
        metrics = ['Precision', 'Recall', 'F1 Score', 'Mean IoU']
        values = [
            footprint_metrics['precision'],
            footprint_metrics['recall'],
            footprint_metrics['f1_score'],
            footprint_metrics['mean_iou'],
        ]
        
        bars = ax.bar(metrics, values, color=['#2ecc71', '#3498db', '#9b59b6', '#f39c12'])
        ax.set_ylim(0, 1)
        ax.set_ylabel('Score')
        ax.set_title('Footprint Detection Metrics')
        
        # Add value labels
        for bar, val in zip(bars, values):
            ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.02,
                   f'{val:.3f}', ha='center', va='bottom')
        
        metrics_path = output_dir / "metrics_bar.png"
        fig.savefig(metrics_path, dpi=150, bbox_inches='tight')
        plt.close(fig)
        plot_paths.append(metrics_path)
        
        return plot_paths
        
    except ImportError:
        logger.warning("matplotlib not available, skipping plots")
        return []


def create_pdf_report(
    output_path: Path,
    project_name: str,
    footprint_metrics: dict,
    height_metrics: dict,
    plot_paths: list[Path],
) -> Path:
    """
    Create PDF summary report.
    
    Args:
        output_path: Path for PDF output
        project_name: Project name
        footprint_metrics: Footprint detection metrics
        height_metrics: Height estimation metrics
        plot_paths: Paths to plots to include
        
    Returns:
        Path to PDF report
    """
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, Image
        from reportlab.lib.units import inch
        
        doc = SimpleDocTemplate(str(output_path), pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        
        # Title
        story.append(Paragraph(f"UAV2LoD1 Accuracy Report", styles['Title']))
        story.append(Paragraph(f"Project: {project_name}", styles['Heading2']))
        story.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
        story.append(Spacer(1, 0.5*inch))
        
        # Footprint Metrics
        story.append(Paragraph("Footprint Detection Metrics", styles['Heading2']))
        footprint_data = [
            ['Metric', 'Value'],
            ['True Positives', str(footprint_metrics.get('true_positives', 'N/A'))],
            ['False Positives', str(footprint_metrics.get('false_positives', 'N/A'))],
            ['False Negatives', str(footprint_metrics.get('false_negatives', 'N/A'))],
            ['Precision', f"{footprint_metrics.get('precision', 0):.3f}"],
            ['Recall', f"{footprint_metrics.get('recall', 0):.3f}"],
            ['F1 Score', f"{footprint_metrics.get('f1_score', 0):.3f}"],
            ['Mean IoU', f"{footprint_metrics.get('mean_iou', 0):.3f}"],
        ]
        story.append(Table(footprint_data))
        story.append(Spacer(1, 0.25*inch))
        
        # Height Metrics
        story.append(Paragraph("Height Estimation Metrics", styles['Heading2']))
        if 'error' not in height_metrics:
            height_data = [
                ['Metric', 'Value'],
                ['Samples', str(height_metrics.get('n_samples', 'N/A'))],
                ['RMSE (m)', f"{height_metrics.get('rmse_m', 0):.3f}"],
                ['MAE (m)', f"{height_metrics.get('mae_m', 0):.3f}"],
                ['Mean Bias (m)', f"{height_metrics.get('mean_bias_m', 0):.3f}"],
                ['Correlation', f"{height_metrics.get('correlation', 0):.3f}" if height_metrics.get('correlation') else 'N/A'],
            ]
        else:
            height_data = [['Status', height_metrics['error']]]
        story.append(Table(height_data))
        story.append(Spacer(1, 0.5*inch))
        
        # Add plots
        for plot_path in plot_paths:
            if plot_path.exists():
                story.append(Image(str(plot_path), width=5*inch, height=4*inch))
                story.append(Spacer(1, 0.25*inch))
        
        doc.build(story)
        logger.info(f"PDF report saved to {output_path}")
        return output_path
        
    except ImportError:
        logger.warning("reportlab not available, creating markdown report instead")
        return create_markdown_report(
            output_path.with_suffix('.md'),
            project_name,
            footprint_metrics,
            height_metrics,
        )


def create_markdown_report(
    output_path: Path,
    project_name: str,
    footprint_metrics: dict,
    height_metrics: dict,
) -> Path:
    """
    Create markdown report as fallback.
    """
    content = f"""# UAV2LoD1 Accuracy Report

## Project: {project_name}
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}

## Footprint Detection Metrics

| Metric | Value |
|--------|-------|
| True Positives | {footprint_metrics.get('true_positives', 'N/A')} |
| False Positives | {footprint_metrics.get('false_positives', 'N/A')} |
| False Negatives | {footprint_metrics.get('false_negatives', 'N/A')} |
| Precision | {footprint_metrics.get('precision', 0):.3f} |
| Recall | {footprint_metrics.get('recall', 0):.3f} |
| F1 Score | {footprint_metrics.get('f1_score', 0):.3f} |
| Mean IoU | {footprint_metrics.get('mean_iou', 0):.3f} |

## Height Estimation Metrics

"""
    
    if 'error' not in height_metrics:
        content += f"""| Metric | Value |
|--------|-------|
| Samples | {height_metrics.get('n_samples', 'N/A')} |
| RMSE (m) | {height_metrics.get('rmse_m', 0):.3f} |
| MAE (m) | {height_metrics.get('mae_m', 0):.3f} |
| Mean Bias (m) | {height_metrics.get('mean_bias_m', 0):.3f} |
| Correlation | {height_metrics.get('correlation', 'N/A')} |
"""
    else:
        content += f"No height evaluation: {height_metrics['error']}\n"
    
    with open(output_path, 'w') as f:
        f.write(content)
    
    logger.info(f"Markdown report saved to {output_path}")
    return output_path


@asset(
    description="Evaluate pipeline results against ground truth and generate accuracy report",
    ins={
        "project_config": AssetIn(),
        "attributed_footprints": AssetIn(),
    },
    compute_kind="evaluation",
    group_name="evaluation",
)
def accuracy_report(
    context: AssetExecutionContext,
    project_config: dict,
    attributed_footprints: dict,
) -> dict:
    """
    Dagster asset that evaluates pipeline accuracy against ground truth.
    
    Evaluates:
    - Footprint detection: IoU, precision, recall, F1
    - Height estimation: RMSE, MAE, bias, correlation
    
    Generates:
    - PDF/Markdown report
    - Scatter plot of predicted vs true heights
    - Metrics bar chart
    - JSON metrics file
    
    Args:
        context: Dagster execution context
        project_config: Configuration from project_config asset
        attributed_footprints: Outputs from attributed_footprints asset
        
    Returns:
        Dictionary containing metrics and report paths
    """
    config = project_config["config"]
    output_dir = Path(project_config["directories"]["outputs"])
    project_name = config["project_name"]
    
    footprints_path = Path(attributed_footprints["footprints_path"])
    
    validation_config = config.get("validation", {})
    truth_footprints_path = validation_config.get("truth_footprints_path")
    truth_heights_path = validation_config.get("truth_heights_path")
    iou_threshold = validation_config.get("iou_threshold", 0.5)
    
    context.log.info("Starting accuracy evaluation")
    
    # Load predictions
    pred_gdf = gpd.read_file(footprints_path)
    context.log.info(f"Loaded {len(pred_gdf)} predicted footprints")
    
    # Initialize metrics
    footprint_metrics = {
        "true_positives": 0,
        "false_positives": len(pred_gdf),
        "false_negatives": 0,
        "precision": 0,
        "recall": 0,
        "f1_score": 0,
        "mean_iou": 0,
    }
    height_metrics = {"error": "No ground truth available"}
    matches = []
    
    # Load ground truth footprints if available
    if truth_footprints_path and Path(truth_footprints_path).exists():
        truth_gdf = gpd.read_file(truth_footprints_path)
        context.log.info(f"Loaded {len(truth_gdf)} ground truth footprints")
        
        # Match footprints
        matches, unmatched_pred, unmatched_truth = match_footprints(
            pred_gdf, truth_gdf, iou_threshold
        )
        
        # Compute metrics
        footprint_metrics = compute_footprint_metrics(
            matches, len(pred_gdf), len(truth_gdf)
        )
        
        context.log.info(f"Footprint metrics: F1={footprint_metrics['f1_score']:.3f}")
    else:
        context.log.warning("No ground truth footprints available")
    
    # Load ground truth heights if available
    truth_heights_df = None
    if truth_heights_path and Path(truth_heights_path).exists():
        truth_heights_df = pd.read_csv(truth_heights_path)
        context.log.info(f"Loaded {len(truth_heights_df)} ground truth heights")
        
        # Compute height metrics
        height_metrics = compute_height_metrics(pred_gdf, truth_heights_df, matches)
        
        if "rmse_m" in height_metrics:
            context.log.info(f"Height RMSE: {height_metrics['rmse_m']:.3f}m")
    else:
        context.log.warning("No ground truth heights available")
    
    # Create plots
    if truth_heights_df is not None and "mean_height" in pred_gdf.columns:
        pred_heights = np.array([pred_gdf.iloc[m[0]]["mean_height"] for m in matches if m[0] < len(pred_gdf)])
        true_heights = np.array([truth_heights_df.iloc[m[1]]["true_height"] for m in matches if m[1] < len(truth_heights_df)])
    else:
        pred_heights = np.array([])
        true_heights = np.array([])
    
    plot_paths = create_evaluation_plots(
        pred_heights, true_heights, footprint_metrics, output_dir
    )
    
    # Create reports
    pdf_path = output_dir / "accuracy_report.pdf"
    create_pdf_report(pdf_path, project_name, footprint_metrics, height_metrics, plot_paths)
    
    # Save metrics as JSON
    metrics_path = output_dir / "accuracy_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump({
            "footprint_metrics": footprint_metrics,
            "height_metrics": height_metrics,
            "evaluation_timestamp": datetime.now().isoformat(),
        }, f, indent=2)
    
    context.log.info(f"Accuracy evaluation complete")
    
    result = {
        "report_path": str(pdf_path) if pdf_path.exists() else str(pdf_path.with_suffix('.md')),
        "metrics_path": str(metrics_path),
        "plot_paths": [str(p) for p in plot_paths],
        "footprint_metrics": footprint_metrics,
        "height_metrics": height_metrics,
    }
    
    context.add_output_metadata({
        "f1_score": round(footprint_metrics.get("f1_score", 0), 3),
        "precision": round(footprint_metrics.get("precision", 0), 3),
        "recall": round(footprint_metrics.get("recall", 0), 3),
        "height_rmse_m": round(height_metrics.get("rmse_m", 0), 3) if "rmse_m" in height_metrics else "N/A",
        "report_path": str(pdf_path),
    })
    
    return result
