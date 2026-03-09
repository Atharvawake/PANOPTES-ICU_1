"""Explainability Service using SHAP (SHapley Additive exPlanations)

Cutting-edge XAI for clinical decision support:
- Feature importance for each prediction
- Individual patient explanations
- Counterfactual analysis
- Clinical trust building

SHAP is the industry standard for healthcare AI explainability (2023-2025)
"""

import numpy as np
import shap
import torch
from typing import Dict, List, Tuple, Optional
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
import pandas as pd


class ExplainabilityService:
    """Comprehensive explainability service for PANOPTES-ICU"""
    
    def __init__(self):
        self.explainer = None
        self.feature_names = None
        self.background_data = None
        
    def initialize_explainer(
        self,
        model,
        background_data: np.ndarray,
        feature_names: List[str],
        model_type: str = 'tree'  # 'tree', 'deep', 'kernel'
    ):
        """Initialize SHAP explainer
        
        Args:
            model: Trained model (sklearn, PyTorch, etc.)
            background_data: Representative background dataset [n_samples, n_features]
            feature_names: List of feature names
            model_type: Type of explainer to use
        """
        self.feature_names = feature_names
        self.background_data = background_data
        
        if model_type == 'tree':
            # For tree-based models (RandomForest, XGBoost)
            self.explainer = shap.TreeExplainer(model)
        elif model_type == 'deep':
            # For deep learning models (PyTorch, TensorFlow)
            self.explainer = shap.DeepExplainer(model, torch.FloatTensor(background_data))
        else:
            # Kernel SHAP (model-agnostic, slower)
            self.explainer = shap.KernelExplainer(model.predict_proba, background_data)
    
    def explain_prediction(
        self,
        patient_data: np.ndarray,
        prediction_score: float
    ) -> Dict:
        """Explain individual patient prediction
        
        Args:
            patient_data: Single patient features [n_features]
            prediction_score: Model's prediction score
            
        Returns:
            Dictionary with explanation details
        """
        if self.explainer is None:
            return {'error': 'Explainer not initialized'}
        
        # Compute SHAP values
        shap_values = self.explainer.shap_values(patient_data.reshape(1, -1))
        
        # Handle multi-output models
        if isinstance(shap_values, list):
            shap_values = shap_values[1]  # Positive class for binary
        
        shap_values = shap_values.flatten()
        
        # Get top contributing features
        feature_contributions = [
            {
                'feature': self.feature_names[i],
                'value': float(patient_data[i]),
                'shap_value': float(shap_values[i]),
                'impact': 'Increases risk' if shap_values[i] > 0 else 'Decreases risk',
                'magnitude': abs(float(shap_values[i]))
            }
            for i in range(len(self.feature_names))
        ]
        
        # Sort by magnitude
        feature_contributions.sort(key=lambda x: x['magnitude'], reverse=True)
        
        # Get base value (expected model output)
        if hasattr(self.explainer, 'expected_value'):
            base_value = self.explainer.expected_value
            if isinstance(base_value, list):
                base_value = base_value[1]
        else:
            base_value = 0.5
        
        # Create clinical explanation
        top_risk_factors = [
            f"{c['feature']}={c['value']:.2f}" 
            for c in feature_contributions[:3] if c['shap_value'] > 0
        ]
        
        top_protective_factors = [
            f"{c['feature']}={c['value']:.2f}"
            for c in feature_contributions[:3] if c['shap_value'] < 0
        ]
        
        clinical_explanation = f"Prediction: {prediction_score:.1%} risk. "
        
        if top_risk_factors:
            clinical_explanation += f"Key risk factors: {', '.join(top_risk_factors)}. "
        
        if top_protective_factors:
            clinical_explanation += f"Protective factors: {', '.join(top_protective_factors)}."
        
        return {
            'prediction_score': float(prediction_score),
            'base_value': float(base_value),
            'feature_contributions': feature_contributions,
            'top_5_contributors': feature_contributions[:5],
            'clinical_explanation': clinical_explanation,
            'shap_values': shap_values.tolist()
        }
    
    def generate_counterfactuals(
        self,
        patient_data: np.ndarray,
        current_risk: float,
        target_risk: float = 0.3,
        top_n: int = 5
    ) -> List[Dict]:
        """Generate counterfactual explanations
        
        'If feature X changed by Y, risk would decrease to Z'
        
        Args:
            patient_data: Current patient features
            current_risk: Current risk score
            target_risk: Desired target risk
            top_n: Number of counterfactuals to generate
            
        Returns:
            List of counterfactual scenarios
        """
        if self.explainer is None:
            return []
        
        # Get SHAP values
        shap_values = self.explainer.shap_values(patient_data.reshape(1, -1))
        if isinstance(shap_values, list):
            shap_values = shap_values[1]
        shap_values = shap_values.flatten()
        
        # Identify features with highest positive SHAP (increasing risk)
        risk_increasing_features = [
            (i, shap_values[i]) for i in range(len(shap_values))
            if shap_values[i] > 0
        ]
        risk_increasing_features.sort(key=lambda x: x[1], reverse=True)
        
        counterfactuals = []
        
        for i, shap_val in risk_increasing_features[:top_n]:
            feature_name = self.feature_names[i]
            current_value = patient_data[i]
            
            # Estimate required change (simplified)
            risk_reduction_needed = current_risk - target_risk
            estimated_change_pct = (risk_reduction_needed / shap_val) * 100 if shap_val > 0 else 0
            
            # Calculate target value (clinical realistic bounds)
            if 'temperature' in feature_name.lower():
                target_value = max(36.0, min(38.0, current_value - estimated_change_pct * 0.1))
                unit = "°C"
            elif 'heart_rate' in feature_name.lower() or 'hr' in feature_name.lower():
                target_value = max(60, min(100, current_value - estimated_change_pct * 0.5))
                unit = "bpm"
            elif 'lactate' in feature_name.lower():
                target_value = max(0.5, min(2.0, current_value - estimated_change_pct * 0.05))
                unit = "mmol/L"
            elif 'wbc' in feature_name.lower():
                target_value = max(4, min(11, current_value - estimated_change_pct * 0.1))
                unit = "K/μL"
            else:
                target_value = current_value * 0.8  # Generic 20% reduction
                unit = ""
            
            projected_risk = max(0, current_risk - (shap_val / sum(abs(shap_values))))
            
            counterfactuals.append({
                'feature': feature_name,
                'current_value': float(current_value),
                'target_value': float(target_value),
                'change_required': float(target_value - current_value),
                'unit': unit,
                'projected_risk': float(projected_risk),
                'risk_reduction': float(current_risk - projected_risk),
                'clinical_recommendation': self._generate_clinical_recommendation(
                    feature_name, current_value, target_value
                )
            })
        
        return counterfactuals
    
    def _generate_clinical_recommendation(
        self,
        feature_name: str,
        current_value: float,
        target_value: float
    ) -> str:
        """Generate actionable clinical recommendation"""
        change = target_value - current_value
        
        if 'temperature' in feature_name.lower():
            if change < 0:
                return "Consider antipyretics, cooling measures"
            else:
                return "Monitor temperature, ensure adequate warming"
        elif 'lactate' in feature_name.lower():
            if change < 0:
                return "Optimize tissue perfusion, consider fluid resuscitation"
        elif 'heart_rate' in feature_name.lower():
            if change < 0:
                return "Consider beta-blockers if appropriate, treat underlying cause"
            else:
                return "Assess for hypovolemia, consider fluids"
        elif 'wbc' in feature_name.lower():
            if change < 0:
                return "Manage infection source, appropriate antibiotics"
        elif 'creatinine' in feature_name.lower():
            if change < 0:
                return "Optimize renal perfusion, review nephrotoxic medications"
        elif 'platelets' in feature_name.lower():
            if change > 0:
                return "Identify and treat underlying cause, consider transfusion if bleeding"
        
        return "Monitor closely, treat underlying condition"
    
    def get_global_feature_importance(self) -> List[Dict]:
        """Get global feature importance across all predictions
        
        Returns:
            List of features with importance scores
        """
        if self.explainer is None or self.background_data is None:
            return []
        
        # Compute SHAP values for background data
        shap_values = self.explainer.shap_values(self.background_data)
        
        if isinstance(shap_values, list):
            shap_values = shap_values[1]
        
        # Calculate mean absolute SHAP values
        mean_abs_shap = np.mean(np.abs(shap_values), axis=0)
        
        feature_importance = [
            {
                'feature': self.feature_names[i],
                'importance': float(mean_abs_shap[i]),
                'rank': i + 1
            }
            for i in range(len(self.feature_names))
        ]
        
        feature_importance.sort(key=lambda x: x['importance'], reverse=True)
        
        # Update ranks
        for i, item in enumerate(feature_importance):
            item['rank'] = i + 1
        
        return feature_importance
