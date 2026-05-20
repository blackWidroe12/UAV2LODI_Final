"""
Evaluation Metrics for UAV2LoD1 Pipeline

Metrics for assessing building footprint detection and height estimation.
"""

import logging
from typing import Optional

import numpy as np
from shapely.geometry import Polygon

logger = logging.getLogger(__name__)


def intersection_over_union(poly1: Polygon, poly2: Polygon) -> float:
    """
    Calculate Intersection over Union (IoU) between two polygons.
    
    Args:
        poly1: First polygon
        poly2: Second polygon
        
    Returns:
        IoU score (0-1)
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


def precision(tp: int, fp: int) -> float:
    """
    Calculate precision.
    
    Args:
        tp: True positives
        fp: False positives
        
    Returns:
        Precision score (0-1)
    """
    if tp + fp == 0:
        return 0.0
    return tp / (tp + fp)


def recall(tp: int, fn: int) -> float:
    """
    Calculate recall (completeness).
    
    Args:
        tp: True positives
        fn: False negatives
        
    Returns:
        Recall score (0-1)
    """
    if tp + fn == 0:
        return 0.0
    return tp / (tp + fn)


def f1_score(precision_val: float, recall_val: float) -> float:
    """
    Calculate F1 score.
    
    Args:
        precision_val: Precision value
        recall_val: Recall value
        
    Returns:
        F1 score (0-1)
    """
    if precision_val + recall_val == 0:
        return 0.0
    return 2 * precision_val * recall_val / (precision_val + recall_val)


def rmse(predictions: np.ndarray, targets: np.ndarray) -> float:
    """
    Calculate Root Mean Square Error.
    
    Args:
        predictions: Predicted values
        targets: Ground truth values
        
    Returns:
        RMSE value
    """
    if len(predictions) == 0 or len(targets) == 0:
        return np.nan
    return np.sqrt(np.mean((predictions - targets) ** 2))


def mae(predictions: np.ndarray, targets: np.ndarray) -> float:
    """
    Calculate Mean Absolute Error.
    
    Args:
        predictions: Predicted values
        targets: Ground truth values
        
    Returns:
        MAE value
    """
    if len(predictions) == 0 or len(targets) == 0:
        return np.nan
    return np.mean(np.abs(predictions - targets))


def mean_bias(predictions: np.ndarray, targets: np.ndarray) -> float:
    """
    Calculate mean bias (systematic error).
    
    Args:
        predictions: Predicted values
        targets: Ground truth values
        
    Returns:
        Mean bias value
    """
    if len(predictions) == 0 or len(targets) == 0:
        return np.nan
    return np.mean(predictions - targets)


def correlation_coefficient(predictions: np.ndarray, targets: np.ndarray) -> float:
    """
    Calculate Pearson correlation coefficient.
    
    Args:
        predictions: Predicted values
        targets: Ground truth values
        
    Returns:
        Correlation coefficient (-1 to 1)
    """
    if len(predictions) < 2 or len(targets) < 2:
        return np.nan
    
    corr_matrix = np.corrcoef(predictions, targets)
    return corr_matrix[0, 1]


def r_squared(predictions: np.ndarray, targets: np.ndarray) -> float:
    """
    Calculate coefficient of determination (R²).
    
    Args:
        predictions: Predicted values
        targets: Ground truth values
        
    Returns:
        R² value (0-1 for good fits)
    """
    if len(predictions) == 0 or len(targets) == 0:
        return np.nan
    
    ss_res = np.sum((targets - predictions) ** 2)
    ss_tot = np.sum((targets - np.mean(targets)) ** 2)
    
    if ss_tot == 0:
        return np.nan
    
    return 1 - (ss_res / ss_tot)


def dice_coefficient(pred_mask: np.ndarray, true_mask: np.ndarray) -> float:
    """
    Calculate Dice coefficient for binary masks.
    
    Args:
        pred_mask: Predicted binary mask
        true_mask: Ground truth binary mask
        
    Returns:
        Dice coefficient (0-1)
    """
    pred_mask = pred_mask.astype(bool)
    true_mask = true_mask.astype(bool)
    
    intersection = np.logical_and(pred_mask, true_mask).sum()
    
    if pred_mask.sum() + true_mask.sum() == 0:
        return 1.0  # Both empty = perfect match
    
    return 2 * intersection / (pred_mask.sum() + true_mask.sum())


def binary_cross_entropy(pred_probs: np.ndarray, true_mask: np.ndarray, epsilon: float = 1e-7) -> float:
    """
    Calculate binary cross-entropy loss.
    
    Args:
        pred_probs: Predicted probabilities (0-1)
        true_mask: Ground truth binary mask
        epsilon: Small value for numerical stability
        
    Returns:
        BCE loss value
    """
    pred_probs = np.clip(pred_probs, epsilon, 1 - epsilon)
    
    bce = -np.mean(
        true_mask * np.log(pred_probs) + (1 - true_mask) * np.log(1 - pred_probs)
    )
    
    return bce


class ConfusionMatrix:
    """
    Confusion matrix for object detection evaluation.
    """
    
    def __init__(self):
        self.tp = 0  # True positives
        self.fp = 0  # False positives
        self.fn = 0  # False negatives
        self.tn = 0  # True negatives (usually N/A for detection)
    
    def add_prediction(self, is_match: bool, has_ground_truth: bool):
        """Add a single prediction result."""
        if is_match:
            self.tp += 1
        elif has_ground_truth:
            self.fn += 1
        else:
            self.fp += 1
    
    def add_unmatched_prediction(self):
        """Add a false positive."""
        self.fp += 1
    
    def add_missed_ground_truth(self):
        """Add a false negative."""
        self.fn += 1
    
    @property
    def precision(self) -> float:
        """Calculate precision."""
        return precision(self.tp, self.fp)
    
    @property
    def recall(self) -> float:
        """Calculate recall."""
        return recall(self.tp, self.fn)
    
    @property
    def f1(self) -> float:
        """Calculate F1 score."""
        return f1_score(self.precision, self.recall)
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "true_positives": self.tp,
            "false_positives": self.fp,
            "false_negatives": self.fn,
            "precision": self.precision,
            "recall": self.recall,
            "f1_score": self.f1,
        }


class HeightMetrics:
    """
    Container for height estimation metrics.
    """
    
    def __init__(self, predictions: np.ndarray, targets: np.ndarray):
        """
        Initialize with predictions and targets.
        
        Args:
            predictions: Predicted height values
            targets: Ground truth height values
        """
        self.predictions = np.asarray(predictions)
        self.targets = np.asarray(targets)
        
        # Filter out NaN values
        valid_mask = ~(np.isnan(self.predictions) | np.isnan(self.targets))
        self.predictions = self.predictions[valid_mask]
        self.targets = self.targets[valid_mask]
        
        self.n_samples = len(self.predictions)
    
    @property
    def rmse(self) -> float:
        """Root Mean Square Error."""
        return rmse(self.predictions, self.targets)
    
    @property
    def mae(self) -> float:
        """Mean Absolute Error."""
        return mae(self.predictions, self.targets)
    
    @property
    def mean_bias(self) -> float:
        """Mean Bias."""
        return mean_bias(self.predictions, self.targets)
    
    @property
    def std_error(self) -> float:
        """Standard deviation of errors."""
        if self.n_samples == 0:
            return np.nan
        return np.std(self.predictions - self.targets)
    
    @property
    def correlation(self) -> float:
        """Correlation coefficient."""
        return correlation_coefficient(self.predictions, self.targets)
    
    @property
    def r_squared(self) -> float:
        """Coefficient of determination."""
        return r_squared(self.predictions, self.targets)
    
    def percentile_error(self, percentile: float) -> float:
        """Calculate error at given percentile."""
        if self.n_samples == 0:
            return np.nan
        errors = np.abs(self.predictions - self.targets)
        return np.percentile(errors, percentile)
    
    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "n_samples": self.n_samples,
            "rmse_m": self.rmse,
            "mae_m": self.mae,
            "mean_bias_m": self.mean_bias,
            "std_error_m": self.std_error,
            "correlation": self.correlation,
            "r_squared": self.r_squared,
            "error_95th_percentile_m": self.percentile_error(95),
        }


def compute_segmentation_metrics(
    pred_mask: np.ndarray,
    true_mask: np.ndarray,
) -> dict:
    """
    Compute comprehensive segmentation metrics.
    
    Args:
        pred_mask: Predicted binary mask
        true_mask: Ground truth binary mask
        
    Returns:
        Dictionary of metrics
    """
    pred_mask = pred_mask.astype(bool)
    true_mask = true_mask.astype(bool)
    
    # Calculate components
    tp = np.logical_and(pred_mask, true_mask).sum()
    fp = np.logical_and(pred_mask, ~true_mask).sum()
    fn = np.logical_and(~pred_mask, true_mask).sum()
    tn = np.logical_and(~pred_mask, ~true_mask).sum()
    
    # Calculate metrics
    prec = precision(tp, fp)
    rec = recall(tp, fn)
    f1 = f1_score(prec, rec)
    
    # IoU
    union = tp + fp + fn
    iou = tp / union if union > 0 else 0
    
    # Dice
    dice = dice_coefficient(pred_mask, true_mask)
    
    # Accuracy
    total = tp + fp + fn + tn
    accuracy = (tp + tn) / total if total > 0 else 0
    
    return {
        "true_positives": int(tp),
        "false_positives": int(fp),
        "false_negatives": int(fn),
        "true_negatives": int(tn),
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "iou": iou,
        "dice": dice,
        "accuracy": accuracy,
    }
