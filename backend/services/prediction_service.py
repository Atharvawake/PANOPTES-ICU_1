"""Prediction Service for PANOPTES-ICU

Manages all ML model predictions:
- Sepsis prediction (GRU-D)
- Mortality risk
- Organ failure risk
- Deterioration detection
"""

import numpy as np
import torch
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


class PredictionService:
    """Central service for all clinical predictions"""
    
    def __init__(self):
        self.models = {}
        self.model_metadata = {}
        self.prediction_history = []
        
    def load_model(self, model_name: str, model_path: str, model_type: str = 'pytorch'):
        """Load a trained model
        
        Args:
            model_name: Identifier for the model
            model_path: Path to model file
            model_type: Type of model ('pytorch', 'sklearn')
        """
        try:
            if model_type == 'pytorch':
                model = torch.load(model_path)
                model.eval()
            elif model_type == 'sklearn':
                import joblib
                model = joblib.load(model_path)
            
            self.models[model_name] = model
            self.model_metadata[model_name] = {
                'loaded_at': datetime.now(),
                'model_type': model_type,
                'path': model_path
            }
            
            logger.info(f"Model '{model_name}' loaded successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to load model '{model_name}': {str(e)}")
            return False
    
    def predict_sepsis(
        self,
        patient_id: str,
        time_series_data: np.ndarray,
        observation_mask: np.ndarray,
        time_deltas: np.ndarray
    ) -> Dict:
        """Predict sepsis risk using GRU-D model
        
        Args:
            patient_id: Patient identifier
            time_series_data: Time-series features [seq_len, n_features]
            observation_mask: Binary mask for observed values
            time_deltas: Time since last observation
            
        Returns:
            Dictionary with prediction results
        """
        try:
            # Check if model is loaded
            if 'sepsis_grud' not in self.models:
                # Use mock prediction for demo
                return self._mock_sepsis_prediction(patient_id)
            
            model = self.models['sepsis_grud']
            
            # Prepare tensors
            x = torch.FloatTensor(time_series_data).unsqueeze(0)
            mask = torch.FloatTensor(observation_mask).unsqueeze(0)
            delta = torch.FloatTensor(time_deltas).unsqueeze(0)
            
            # Predict
            with torch.no_grad():
                probability, attention = model(x, mask, delta)
            
            sepsis_prob = probability.item()
            
            # Risk categorization
            if sepsis_prob >= 0.7:
                risk_level = "HIGH"
                recommendation = "URGENT: Consider sepsis protocol, blood cultures, antibiotics"
            elif sepsis_prob >= 0.4:
                risk_level = "MODERATE"
                recommendation = "Monitor closely, consider early sepsis workup"
            else:
                risk_level = "LOW"
                recommendation = "Continue routine monitoring"
            
            result = {
                'patient_id': patient_id,
                'prediction_type': 'sepsis',
                'probability': float(sepsis_prob),
                'risk_level': risk_level,
                'recommendation': recommendation,
                'timestamp': datetime.now().isoformat(),
                'model_version': 'GRU-D_v1.0',
                'attention_weights': attention.squeeze().tolist() if attention is not None else []
            }
            
            # Store in history
            self.prediction_history.append(result)
            
            return result
            
        except Exception as e:
            logger.error(f"Sepsis prediction failed: {str(e)}")
            return {
                'error': str(e),
                'patient_id': patient_id,
                'prediction_type': 'sepsis'
            }
    
    def _mock_sepsis_prediction(self, patient_id: str) -> Dict:
        """Mock sepsis prediction for demonstration"""
        # Generate realistic mock prediction
        base_prob = 0.3 + np.random.rand() * 0.4
        
        if base_prob >= 0.7:
            risk_level = "HIGH"
            recommendation = "URGENT: Consider sepsis protocol, blood cultures, antibiotics"
        elif base_prob >= 0.4:
            risk_level = "MODERATE"
            recommendation = "Monitor closely, consider early sepsis workup"
        else:
            risk_level = "LOW"
            recommendation = "Continue routine monitoring"
        
        return {
            'patient_id': patient_id,
            'prediction_type': 'sepsis',
            'probability': float(base_prob),
            'risk_level': risk_level,
            'recommendation': recommendation,
            'timestamp': datetime.now().isoformat(),
            'model_version': 'GRU-D_v1.0_DEMO',
            'note': 'Demo prediction - model not trained yet'
        }
    
    def predict_mortality(
        self,
        patient_id: str,
        apache_score: int,
        sofa_score: int,
        age: int,
        comorbidities: int
    ) -> Dict:
        """Predict mortality risk
        
        Args:
            patient_id: Patient identifier
            apache_score: APACHE II score
            sofa_score: SOFA score
            age: Patient age
            comorbidities: Number of comorbidities
            
        Returns:
            Dictionary with mortality prediction
        """
        # Simplified logistic regression model (for demo)
        # In production, this would use a trained ML model
        
        logit = (
            0.05 * apache_score +
            0.08 * sofa_score +
            0.02 * age +
            0.10 * comorbidities -
            4.0
        )
        
        probability = 1 / (1 + np.exp(-logit))
        
        # Risk categorization based on literature
        if probability >= 0.5:
            risk_level = "VERY HIGH"
            timeframe = "48-72 hours"
        elif probability >= 0.3:
            risk_level = "HIGH"
            timeframe = "3-7 days"
        elif probability >= 0.15:
            risk_level = "MODERATE"
            timeframe = "7-14 days"
        else:
            risk_level = "LOW"
            timeframe = "ICU stay"
        
        return {
            'patient_id': patient_id,
            'prediction_type': 'mortality',
            'probability': float(probability),
            'risk_level': risk_level,
            'timeframe': timeframe,
            'contributing_factors': {
                'apache_ii': apache_score,
                'sofa': sofa_score,
                'age': age,
                'comorbidities': comorbidities
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def predict_organ_failure(
        self,
        patient_id: str,
        sofa_components: Dict[str, int]
    ) -> Dict:
        """Predict organ-specific failure risk
        
        Args:
            patient_id: Patient identifier
            sofa_components: SOFA component scores
            
        Returns:
            Dictionary with organ failure predictions
        """
        organ_predictions = {}
        
        for organ, score in sofa_components.items():
            # Risk probability based on SOFA score
            if score >= 3:
                prob = 0.7 + (score - 3) * 0.1
                risk = "HIGH"
            elif score >= 2:
                prob = 0.4 + (score - 2) * 0.15
                risk = "MODERATE"
            elif score >= 1:
                prob = 0.15 + (score - 1) * 0.125
                risk = "LOW-MODERATE"
            else:
                prob = 0.05
                risk = "LOW"
            
            organ_predictions[organ] = {
                'failure_probability': float(min(0.95, prob)),
                'risk_level': risk,
                'sofa_score': score
            }
        
        # Calculate multi-organ failure risk
        high_risk_organs = sum(1 for p in organ_predictions.values() if p['risk_level'] == 'HIGH')
        
        if high_risk_organs >= 3:
            mof_risk = "CRITICAL"
            mof_prob = 0.8
        elif high_risk_organs >= 2:
            mof_risk = "HIGH"
            mof_prob = 0.6
        elif high_risk_organs >= 1:
            mof_risk = "MODERATE"
            mof_prob = 0.3
        else:
            mof_risk = "LOW"
            mof_prob = 0.1
        
        return {
            'patient_id': patient_id,
            'prediction_type': 'organ_failure',
            'organ_specific': organ_predictions,
            'multi_organ_failure': {
                'probability': mof_prob,
                'risk_level': mof_risk,
                'organs_at_risk': high_risk_organs
            },
            'timestamp': datetime.now().isoformat()
        }
    
    def get_prediction_history(
        self,
        patient_id: Optional[str] = None,
        prediction_type: Optional[str] = None,
        hours: int = 24
    ) -> List[Dict]:
        """Get prediction history
        
        Args:
            patient_id: Filter by patient (optional)
            prediction_type: Filter by type (optional)
            hours: Last N hours (default 24)
            
        Returns:
            List of historical predictions
        """
        cutoff = datetime.now() - timedelta(hours=hours)
        
        filtered = self.prediction_history
        
        if patient_id:
            filtered = [p for p in filtered if p.get('patient_id') == patient_id]
        
        if prediction_type:
            filtered = [p for p in filtered if p.get('prediction_type') == prediction_type]
        
        # Filter by time (if timestamp present)
        filtered = [
            p for p in filtered
            if 'timestamp' in p and datetime.fromisoformat(p['timestamp']) >= cutoff
        ]
        
        return filtered
    
    def get_trending_risk(
        self,
        patient_id: str,
        prediction_type: str = 'sepsis',
        window_size: int = 10
    ) -> Dict:
        """Analyze risk trend over time
        
        Args:
            patient_id: Patient identifier
            prediction_type: Type of prediction
            window_size: Number of recent predictions to analyze
            
        Returns:
            Dictionary with trend analysis
        """
        history = self.get_prediction_history(patient_id, prediction_type, hours=72)
        
        if len(history) < 2:
            return {
                'trend': 'INSUFFICIENT_DATA',
                'direction': 'UNKNOWN',
                'rate_of_change': 0
            }
        
        # Get recent probabilities
        recent = history[-window_size:]
        probabilities = [p.get('probability', 0) for p in recent]
        
        # Calculate trend
        if len(probabilities) >= 2:
            x = np.arange(len(probabilities))
            coeffs = np.polyfit(x, probabilities, 1)
            slope = coeffs[0]
            
            if abs(slope) < 0.01:
                trend = 'STABLE'
                direction = 'NO_CHANGE'
            elif slope > 0:
                trend = 'WORSENING'
                direction = 'INCREASING' if slope > 0.05 else 'SLIGHTLY_INCREASING'
            else:
                trend = 'IMPROVING'
                direction = 'DECREASING' if slope < -0.05 else 'SLIGHTLY_DECREASING'
            
            return {
                'trend': trend,
                'direction': direction,
                'rate_of_change': float(slope),
                'current_probability': probabilities[-1],
                'previous_probability': probabilities[0] if len(probabilities) > 1 else probabilities[-1],
                'data_points': len(probabilities)
            }
        
        return {
            'trend': 'INSUFFICIENT_DATA',
            'direction': 'UNKNOWN',
            'rate_of_change': 0
        }
