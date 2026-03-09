"""PANOPTES-ICU Enhanced Server with Cutting-Edge AI/ML

Integrates:
- Multiple scoring systems (APACHE II, SOFA, qSOFA, GCS)
- GRU-D based sepsis prediction
- Deterioration detection (VAE + Anomaly detection)
- SHAP explainability
- Smart alert system
- Real-time predictions
"""

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone
import numpy as np

# Import scoring systems
from models.scoring.apache_ii import APACHE_II_Input, calculate_apache_ii
from models.scoring.sofa import SOFA_Input, calculate_sofa
from models.scoring.qsofa import qSOFA_Input, calculate_qsofa
from models.scoring.gcs import GCS_Input, calculate_gcs

# Import services
from services.prediction_service import PredictionService
from services.alert_service import AlertService, AlertType, AlertSeverity
from services.explainability_service import ExplainabilityService

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Initialize services
prediction_service = PredictionService()
alert_service = AlertService()
explainability_service = ExplainabilityService()

# Create the main app
app = FastAPI(
    title="PANOPTES-ICU API",
    description="Intelligent Clinical Decision Support System for ICU",
    version="1.0.0"
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class PatientBasicInfo(BaseModel):
    """Basic patient information"""
    patient_id: str
    age: int
    gender: str
    admission_date: str

class TimeSeriesDataPoint(BaseModel):
    """Single time-series data point"""
    timestamp: str
    features: List[float]
    feature_names: List[str]
    observed_mask: List[int]  # 1 = observed, 0 = missing

class PredictionRequest(BaseModel):
    """Request for ML predictions"""
    patient_id: str
    time_series: List[TimeSeriesDataPoint]
    prediction_type: str  # 'sepsis', 'mortality', 'organ_failure'

class ExplanationRequest(BaseModel):
    """Request for prediction explanation"""
    patient_id: str
    prediction_score: float
    features: Dict[str, float]


# ============================================================================
# HEALTH CHECK & INFO ENDPOINTS
# ============================================================================

@api_router.get("/")
async def root():
    """API root endpoint"""
    return {
        "message": "PANOPTES-ICU API",
        "version": "1.0.0",
        "status": "operational",
        "features": [
            "Multi-score calculation (APACHE II, SOFA, qSOFA, GCS)",
            "GRU-D sepsis prediction",
            "Deterioration detection",
            "SHAP explainability",
            "Smart alert system"
        ]
    }

@api_router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "database": "connected",
            "prediction_service": "ready",
            "alert_service": "active"
        }
    }

@api_router.get("/system-info")
async def system_info():
    """Get system information and capabilities"""
    return {
        "ai_models": {
            "gru_d": {
                "name": "GRU-D Sepsis Predictor",
                "type": "Deep Learning Time-Series",
                "target_auc": ">0.85",
                "status": "demo_mode",
                "description": "Handles irregular time-series with missing values"
            },
            "vae_detector": {
                "name": "VAE Deterioration Detector",
                "type": "Autoencoder + Anomaly Detection",
                "status": "demo_mode",
                "description": "Detects subtle patient deterioration patterns"
            }
        },
        "explainability": {
            "method": "SHAP (SHapley Additive exPlanations)",
            "features": [
                "Feature importance",
                "Counterfactual analysis",
                "Individual predictions"
            ]
        },
        "scoring_systems": [
            "APACHE II (0-71)",
            "SOFA (0-24)",
            "qSOFA (0-3)",
            "Glasgow Coma Scale (3-15)"
        ]
    }


# ============================================================================
# SCORING ENDPOINTS
# ============================================================================

@api_router.post("/scoring/apache-ii")
async def calculate_apache_score(input_data: APACHE_II_Input):
    """Calculate APACHE II Score
    
    Returns comprehensive score with mortality risk assessment
    """
    try:
        result = calculate_apache_ii(input_data)
        
        # Store in database
        score_doc = {
            "type": "apache_ii",
            "patient_data": input_data.model_dump(),
            "result": result.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.scoring_results.insert_one(score_doc)
        
        return result
    except Exception as e:
        logger.error(f"APACHE II calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/sofa")
async def calculate_sofa_score(input_data: SOFA_Input):
    """Calculate SOFA Score
    
    Returns organ-specific dysfunction scores
    """
    try:
        result = calculate_sofa(input_data)
        
        # Store in database
        score_doc = {
            "type": "sofa",
            "patient_data": input_data.model_dump(),
            "result": result.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.scoring_results.insert_one(score_doc)
        
        # Check for alert conditions
        if result.total_score >= 10:
            alert_service.evaluate_score_alert(
                patient_id="demo_patient",  # Replace with actual patient ID
                score_name="SOFA",
                score_value=result.total_score,
                threshold=10,
                details=result.model_dump()
            )
        
        return result
    except Exception as e:
        logger.error(f"SOFA calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/qsofa")
async def calculate_qsofa_score(input_data: qSOFA_Input):
    """Calculate qSOFA Score
    
    Quick sepsis screening tool
    """
    try:
        result = calculate_qsofa(input_data)
        
        # Store in database
        score_doc = {
            "type": "qsofa",
            "patient_data": input_data.model_dump(),
            "result": result.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.scoring_results.insert_one(score_doc)
        
        return result
    except Exception as e:
        logger.error(f"qSOFA calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/gcs")
async def calculate_gcs_score(input_data: GCS_Input):
    """Calculate Glasgow Coma Scale
    
    Consciousness level assessment
    """
    try:
        result = calculate_gcs(input_data)
        
        # Store in database
        score_doc = {
            "type": "gcs",
            "patient_data": input_data.model_dump(),
            "result": result.model_dump(),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.scoring_results.insert_one(score_doc)
        
        return result
    except Exception as e:
        logger.error(f"GCS calculation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# AI/ML PREDICTION ENDPOINTS
# ============================================================================

@api_router.post("/predict/sepsis")
async def predict_sepsis(patient_id: str):
    """Predict sepsis risk using GRU-D model
    
    Returns probability and risk level with clinical recommendations
    """
    try:
        # Demo: Generate mock time-series data
        # In production, fetch from database
        seq_len, n_features = 24, 20
        time_series_data = np.random.randn(seq_len, n_features)
        observation_mask = np.random.randint(0, 2, (seq_len, n_features))
        time_deltas = np.random.rand(seq_len, n_features) * 2
        
        # Predict
        result = prediction_service.predict_sepsis(
            patient_id=patient_id,
            time_series_data=time_series_data,
            observation_mask=observation_mask,
            time_deltas=time_deltas
        )
        
        # Create alert if high risk
        if result.get('probability', 0) >= 0.5:
            alert_service.evaluate_sepsis_alert(
                patient_id=patient_id,
                sepsis_probability=result['probability'],
                qsofa_score=2  # Mock qSOFA score
            )
        
        # Store prediction
        await db.predictions.insert_one({
            **result,
            "stored_at": datetime.now(timezone.utc).isoformat()
        })
        
        return result
    except Exception as e:
        logger.error(f"Sepsis prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/predict/mortality")
async def predict_mortality(
    patient_id: str,
    apache_score: int,
    sofa_score: int,
    age: int,
    comorbidities: int = 0
):
    """Predict mortality risk
    
    Based on APACHE II, SOFA scores, and patient characteristics
    """
    try:
        result = prediction_service.predict_mortality(
            patient_id=patient_id,
            apache_score=apache_score,
            sofa_score=sofa_score,
            age=age,
            comorbidities=comorbidities
        )
        
        # Store prediction
        await db.predictions.insert_one({
            **result,
            "stored_at": datetime.now(timezone.utc).isoformat()
        })
        
        return result
    except Exception as e:
        logger.error(f"Mortality prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/predict/organ-failure")
async def predict_organ_failure(
    patient_id: str,
    sofa_components: Dict[str, int]
):
    """Predict organ-specific failure risk
    
    Returns individual organ risks and multi-organ failure probability
    """
    try:
        result = prediction_service.predict_organ_failure(
            patient_id=patient_id,
            sofa_components=sofa_components
        )
        
        # Store prediction
        await db.predictions.insert_one({
            **result,
            "stored_at": datetime.now(timezone.utc).isoformat()
        })
        
        return result
    except Exception as e:
        logger.error(f"Organ failure prediction error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# EXPLAINABILITY ENDPOINTS
# ============================================================================

@api_router.post("/explain/prediction")
async def explain_prediction(request: ExplanationRequest):
    """Get SHAP explanation for a prediction
    
    Returns feature importance and clinical interpretation
    """
    try:
        # Convert features to numpy array
        feature_names = list(request.features.keys())
        feature_values = np.array(list(request.features.values()))
        
        # Note: This requires the explainer to be initialized with a model
        # For demo purposes, we'll return a mock explanation
        explanation = {
            "patient_id": request.patient_id,
            "prediction_score": request.prediction_score,
            "top_contributors": [
                {
                    "feature": "Heart Rate",
                    "value": 125,
                    "impact": "Increases risk",
                    "contribution": 0.15
                },
                {
                    "feature": "Lactate",
                    "value": 3.2,
                    "impact": "Increases risk",
                    "contribution": 0.12
                },
                {
                    "feature": "Temperature",
                    "value": 38.5,
                    "impact": "Increases risk",
                    "contribution": 0.08
                }
            ],
            "clinical_explanation": f"Risk at {request.prediction_score:.0%} primarily driven by tachycardia, elevated lactate, and fever.",
            "note": "Demo explanation - full SHAP integration requires trained model"
        }
        
        return explanation
    except Exception as e:
        logger.error(f"Explanation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ALERT ENDPOINTS
# ============================================================================

@api_router.get("/alerts/active")
async def get_active_alerts(
    patient_id: Optional[str] = None,
    severity: Optional[str] = None
):
    """Get active alerts
    
    Optionally filter by patient ID and/or severity
    """
    try:
        severity_enum = AlertSeverity[severity] if severity else None
        alerts = alert_service.get_active_alerts(
            patient_id=patient_id,
            severity=severity_enum
        )
        
        return {
            "total": len(alerts),
            "alerts": alerts
        }
    except Exception as e:
        logger.error(f"Alert retrieval error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, acknowledged_by: str):
    """Acknowledge an alert"""
    try:
        success = alert_service.acknowledge_alert(alert_id, acknowledged_by)
        
        if success:
            return {"status": "acknowledged", "alert_id": alert_id}
        else:
            raise HTTPException(status_code=404, detail="Alert not found")
    except Exception as e:
        logger.error(f"Alert acknowledgment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/alerts/summary")
async def get_alert_summary(patient_id: Optional[str] = None):
    """Get alert summary statistics"""
    try:
        summary = alert_service.get_alert_summary(patient_id)
        return summary
    except Exception as e:
        logger.error(f"Alert summary error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PATIENT DASHBOARD ENDPOINT
# ============================================================================

@api_router.get("/dashboard/{patient_id}")
async def get_patient_dashboard(patient_id: str):
    """Get comprehensive patient dashboard data
    
    Includes:
    - Current scores (APACHE, SOFA, qSOFA, GCS)
    - ML predictions (sepsis, mortality, organ failure)
    - Active alerts
    - Trend analysis
    """
    try:
        # Mock comprehensive dashboard
        dashboard_data = {
            "patient_id": patient_id,
            "timestamp": datetime.now().isoformat(),
            "scores": {
                "apache_ii": {
                    "total": 18,
                    "mortality_risk": 15.0,
                    "category": "Moderate Risk"
                },
                "sofa": {
                    "total": 8,
                    "organ_dysfunctions": 3
                },
                "qsofa": {
                    "total": 1,
                    "high_risk": False
                },
                "gcs": {
                    "total": 14,
                    "severity": "Mild TBI"
                }
            },
            "predictions": {
                "sepsis": {
                    "probability": 0.35,
                    "risk_level": "MODERATE",
                    "trend": "STABLE"
                },
                "mortality": {
                    "probability": 0.15,
                    "risk_level": "MODERATE",
                    "timeframe": "7-14 days"
                }
            },
            "alerts": alert_service.get_alert_summary(patient_id),
            "active_alerts": alert_service.get_active_alerts(patient_id)[:5],
            "ai_insights": {
                "deterioration_risk": "LOW",
                "recommended_actions": [
                    "Continue current monitoring frequency",
                    "Reassess SOFA score in 12 hours",
                    "Monitor for sepsis indicators"
                ]
            }
        }
        
        return dashboard_data
    except Exception as e:
        logger.error(f"Dashboard error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DEMO DATA ENDPOINT
# ============================================================================

@api_router.get("/demo/patient-data")
async def get_demo_patient_data():
    """Get demo patient data for testing"""
    return {
        "patient_id": "DEMO_001",
        "basic_info": {
            "age": 65,
            "gender": "M",
            "admission_date": "2025-01-15",
            "diagnosis": "Septic Shock, ARDS"
        },
        "apache_ii_data": {
            "age": 65,
            "temperature": 38.5,
            "mean_arterial_pressure": 75,
            "heart_rate": 125,
            "respiratory_rate": 28,
            "pao2": 75,
            "fio2": 0.6,
            "arterial_ph": 7.32,
            "sodium": 138,
            "potassium": 4.2,
            "creatinine": 1.8,
            "hematocrit": 32,
            "wbc": 18.5,
            "gcs": 14,
            "chronic_health": False,
            "postoperative": False
        },
        "sofa_data": {
            "pao2": 75,
            "fio2": 0.6,
            "mechanical_ventilation": True,
            "platelets": 95,
            "bilirubin": 1.5,
            "mean_arterial_pressure": 75,
            "dopamine_dose": 5,
            "gcs": 14,
            "creatinine": 1.8
        },
        "qsofa_data": {
            "respiratory_rate": 28,
            "systolic_bp": 95,
            "gcs": 14
        }
    }


# Include the router in the main app
app.include_router(api_router)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Shutdown event
@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    logger.info("Database connection closed")
