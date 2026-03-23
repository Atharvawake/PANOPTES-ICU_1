"""
PANOPTES-ICU — Step 6: Updated server.py
=========================================
Enhanced server with:
  1. Model loading at startup (GRU-D + VAE)
  2. SHAP initialization at startup
  3. Patient CRUD endpoints (/patients)
  4. Vitals time-series storage (/patients/{id}/vitals)
  5. Real GRU-D prediction from stored vitals
  6. VAE deterioration endpoint
  7. Alert persistence to MongoDB
  8. Real SHAP explanations

Place this file at: backend/server_production.py
Then rename to server.py when ready to switch from demo.
"""

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import numpy as np
import torch
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timezone
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ── Scoring systems ──
from models.scoring.apache_ii import APACHE_II_Input, calculate_apache_ii
from models.scoring.sofa      import SOFA_Input, calculate_sofa
from models.scoring.qsofa     import qSOFA_Input, calculate_qsofa
from models.scoring.gcs       import GCS_Input, calculate_gcs
from models.scoring.ranson    import Ranson_Input, calculate_ranson
from models.scoring.saps      import SAPS_Input, calculate_saps
from models.scoring.mods      import MODS_Input, calculate_mods
from models.scoring.murray    import Murray_Input, calculate_murray
from models.scoring.alvarado  import Alvarado_Input, calculate_alvarado

# ── ML models ──
from models.ml.gru_d_model          import GRUD_Sepsis_Predictor
from models.ml.deterioration_detector import VariationalAutoencoder

# ── Services ──
from services.prediction_service   import PredictionService
from services.alert_service        import AlertService, AlertType, AlertSeverity
from services.explainability_service import ExplainabilityService

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ─────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────
mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client    = AsyncIOMotorClient(mongo_url)
db        = client[os.environ.get("DB_NAME", "panoptes_icu")]

prediction_service   = PredictionService()
alert_service        = AlertService()
explainability_service = ExplainabilityService()

app        = FastAPI(title="PANOPTES-ICU API", version="2.0.0")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Feature config
N_FEATURES = 27
N_HOURS    = 24
MODELS_DIR = ROOT_DIR / ".." / "panoptes_pipeline" / "models"
DATA_DIR   = ROOT_DIR / ".." / "panoptes_pipeline" / "data"

FEATURE_NAMES = [
    "heart_rate", "sbp", "dbp", "map", "resp_rate", "spo2",
    "temperature", "gcs_total", "gcs_eye", "gcs_verbal", "gcs_motor",
    "fio2", "glucose_chart", "sodium", "potassium", "creatinine",
    "bun", "glucose_lab", "bicarbonate", "wbc", "hemoglobin",
    "hematocrit", "platelet", "bilirubin", "lactate", "ph", "pao2"
]

NORMAL_VALUES = {
    "heart_rate": 75, "sbp": 120, "dbp": 70, "map": 85,
    "resp_rate": 16, "spo2": 98, "temperature": 37.0,
    "gcs_total": 15, "gcs_eye": 4, "gcs_verbal": 5, "gcs_motor": 6,
    "fio2": 0.21, "glucose_chart": 100, "sodium": 140, "potassium": 4.0,
    "creatinine": 1.0, "bun": 15, "glucose_lab": 100, "bicarbonate": 24,
    "wbc": 8, "hemoglobin": 13, "hematocrit": 40, "platelet": 200,
    "bilirubin": 0.8, "lactate": 1.0, "ph": 7.4, "pao2": 95
}

device = torch.device("cpu")   # use "cuda" if GPU available

# ─────────────────────────────────────────────
# STARTUP: LOAD MODELS
# ─────────────────────────────────────────────
@app.on_event("startup")
async def startup_event():
    logger.info("Loading AI/ML models at startup...")

    # ── Load feature normalization stats ──
    try:
        feat_mean = np.load(str(DATA_DIR / "feat_mean.npy"))
        feat_std  = np.load(str(DATA_DIR / "feat_std.npy"))
        app.state.feat_mean = feat_mean
        app.state.feat_std  = feat_std
        logger.info("Normalization stats loaded")
    except Exception as e:
        logger.warning(f"Normalization stats not found, using defaults: {e}")
        app.state.feat_mean = np.zeros(N_FEATURES)
        app.state.feat_std  = np.ones(N_FEATURES)

    # ── Load GRU-D Sepsis Model ──
    grud_path = MODELS_DIR / "grud_sepsis_v1.pt"
    if grud_path.exists():
        try:
            grud_model = GRUD_Sepsis_Predictor(
                input_size=N_FEATURES, hidden_size=64,
                num_layers=2, dropout=0.0
            )
            grud_model.load_state_dict(torch.load(str(grud_path), map_location=device))
            grud_model.eval()
            grud_model.to(device)
            prediction_service.models["sepsis_grud"] = grud_model
            logger.info("✅ GRU-D sepsis model loaded")
        except Exception as e:
            logger.error(f"GRU-D load failed: {e}")
    else:
        logger.warning(f"GRU-D weights not found at {grud_path} — using demo mode")

    # ── Load VAE Deterioration Detector ──
    vae_path       = MODELS_DIR / "vae_detector_v1.pt"
    vae_thresh_path = MODELS_DIR / "vae_threshold.npy"
    if vae_path.exists():
        try:
            vae_model = VariationalAutoencoder(
                input_size=N_FEATURES, hidden_sizes=[32, 16], latent_size=8
            )
            vae_model.load_state_dict(torch.load(str(vae_path), map_location=device))
            vae_model.eval()
            vae_model.to(device)
            app.state.vae = vae_model
            app.state.vae_threshold = float(np.load(str(vae_thresh_path))) if vae_thresh_path.exists() else 0.5
            logger.info(f"✅ VAE detector loaded (threshold={app.state.vae_threshold:.4f})")
        except Exception as e:
            logger.error(f"VAE load failed: {e}")
            app.state.vae = None
    else:
        logger.warning("VAE weights not found — deterioration detection in demo mode")
        app.state.vae = None
        app.state.vae_threshold = 0.5

    # ── Initialize SHAP ──
    bg_path = MODELS_DIR / "shap_background.npy"
    if bg_path.exists() and "sepsis_grud" in prediction_service.models:
        try:
            background = np.load(str(bg_path))
            explainability_service.initialize_explainer(
                model=prediction_service.models["sepsis_grud"],
                background_data=background,
                feature_names=FEATURE_NAMES,
                model_type="kernel"
            )
            logger.info("✅ SHAP explainer initialized")
        except Exception as e:
            logger.error(f"SHAP init failed: {e}")
    else:
        logger.warning("SHAP background data not found — running in demo mode")

    # ── Create MongoDB indexes ──
    try:
        await db.patients.create_index("patient_id", unique=True)
        await db.vitals.create_index([("patient_id", 1), ("timestamp", -1)])
        await db.scoring_results.create_index([("patient_id", 1), ("timestamp", -1)])
        await db.predictions.create_index([("patient_id", 1), ("stored_at", -1)])
        await db.alerts.create_index([("patient_id", 1), ("acknowledged", 1)])
        logger.info("✅ MongoDB indexes created")
    except Exception as e:
        logger.warning(f"Index creation: {e}")

    logger.info("🚀 PANOPTES-ICU Server ready")


@app.on_event("shutdown")
async def shutdown_event():
    client.close()
    logger.info("Database connection closed")


# ─────────────────────────────────────────────
# PYDANTIC MODELS
# ─────────────────────────────────────────────
class Patient(BaseModel):
    patient_id:     str
    name:           str
    age:            int
    gender:         str
    admission_date: str
    diagnosis:      str
    weight_kg:      Optional[float] = None
    height_cm:      Optional[float] = None
    notes:          Optional[str]   = ""

class VitalsInput(BaseModel):
    """Single hourly vitals reading — all optional except timestamp"""
    timestamp:      str
    heart_rate:     Optional[float] = None
    sbp:            Optional[float] = None
    dbp:            Optional[float] = None
    map:            Optional[float] = None
    resp_rate:      Optional[float] = None
    spo2:           Optional[float] = None
    temperature:    Optional[float] = None
    gcs_total:      Optional[float] = None
    fio2:           Optional[float] = None
    glucose_chart:  Optional[float] = None
    sodium:         Optional[float] = None
    potassium:      Optional[float] = None
    creatinine:     Optional[float] = None
    bun:            Optional[float] = None
    bicarbonate:    Optional[float] = None
    wbc:            Optional[float] = None
    hemoglobin:     Optional[float] = None
    hematocrit:     Optional[float] = None
    platelet:       Optional[float] = None
    bilirubin:      Optional[float] = None
    lactate:        Optional[float] = None
    ph:             Optional[float] = None
    pao2:           Optional[float] = None

class LoginNotifyRequest(BaseModel):
    username: str
    name: str
    email: str
    role: str
    password: str

class AlertAck(BaseModel):
    acknowledged_by: str

# ─────────────────────────────────────────────
# HEALTH & INFO
# ─────────────────────────────────────────────
@api_router.get("/")
async def root():
    grud_loaded = "sepsis_grud" in prediction_service.models
    vae_loaded  = getattr(app.state, "vae", None) is not None
    return {
        "system": "PANOPTES-ICU",
        "version": "2.0.0",
        "models": {
            "grud_sepsis":    "loaded" if grud_loaded else "demo_mode",
            "vae_detector":   "loaded" if vae_loaded  else "demo_mode",
            "shap_explainer": "loaded" if explainability_service.explainer else "demo_mode",
        }
    }

@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@api_router.post("/login-notify")
async def login_notify(data: LoginNotifyRequest):
    GMAIL_USER     = os.getenv("GMAIL_USER")
    GMAIL_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")

    if not GMAIL_USER or not GMAIL_PASSWORD:
        raise HTTPException(status_code=500, detail="Email credentials not configured")

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "PANOPTES-ICU — Login Notification"
        msg["From"]    = GMAIL_USER
        msg["To"]      = data.email

        html = f"""
        <html><body style="font-family:Arial,sans-serif;background:#f0f4f8;padding:20px;">
          <div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
            <div style="background:linear-gradient(135deg,#1e3a5f,#0e7490);padding:24px;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:22px;">PANOPTES-ICU</h1>
              <p style="color:#bae6fd;margin:6px 0 0;font-size:13px;">Clinical Decision Support System</p>
            </div>
            <div style="padding:28px;">
              <p style="color:#374151;font-size:15px;">Hello <strong>{data.name}</strong>,</p>
              <p style="color:#6b7280;font-size:14px;">A login was just recorded on your account. Here are your credentials for reference:</p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;">
                <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;">
                  <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;font-weight:bold;">{data.email}</td></tr>
                  <tr><td style="padding:6px 0;color:#6b7280;">Password</td><td style="padding:6px 0;font-weight:bold;">{data.password}</td></tr>
                  <tr><td style="padding:6px 0;color:#6b7280;">Role</td><td style="padding:6px 0;">{data.role}</td></tr>
                  <tr><td style="padding:6px 0;color:#6b7280;">Login Time</td><td style="padding:6px 0;">{datetime.now().strftime("%d %b %Y, %I:%M %p")}</td></tr>
                </table>
              </div>
              <p style="color:#ef4444;font-size:12px;">If this was not you, please contact your ICU administrator immediately.</p>
            </div>
            <div style="background:#f8fafc;padding:16px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="color:#9ca3af;font-size:11px;margin:0;">PANOPTES-ICU v2.0 · Patient data encrypted · Research use only</p>
            </div>
          </div>
        </body></html>
        """

        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_USER, GMAIL_PASSWORD)
            server.sendmail(GMAIL_USER, data.email, msg.as_string())

        return {"status": "email sent"}

    except Exception as e:
        logger.error(f"Email send failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# PATIENT ENDPOINTS
# ─────────────────────────────────────────────
@api_router.post("/patients", status_code=201)
async def create_patient(patient: Patient):
    existing = await db.patients.find_one({"patient_id": patient.patient_id})
    if existing:
        raise HTTPException(status_code=409, detail="Patient ID already exists")
    doc = {**patient.model_dump(), "created_at": datetime.now(timezone.utc).isoformat()}
    await db.patients.insert_one(doc)
    return {"status": "created", "patient_id": patient.patient_id}

@api_router.get("/patients")
async def list_patients():
    patients = await db.patients.find({}, {"_id": 0}).to_list(length=500)
    return {"total": len(patients), "patients": patients}

@api_router.get("/patients/{patient_id}")
async def get_patient(patient_id: str):
    p = await db.patients.find_one({"patient_id": patient_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    return p

@api_router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str):
    result = await db.patients.delete_one({"patient_id": patient_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {"status": "deleted", "patient_id": patient_id}


# ─────────────────────────────────────────────
# VITALS TIME-SERIES ENDPOINTS
# ─────────────────────────────────────────────
@api_router.post("/patients/{patient_id}/vitals")
async def store_vitals(patient_id: str, vitals: VitalsInput):
    doc = {
        "patient_id": patient_id,
        "stored_at":  datetime.now(timezone.utc).isoformat(),
        **vitals.model_dump()
    }
    await db.vitals.insert_one(doc)
    return {"status": "stored", "patient_id": patient_id, "timestamp": vitals.timestamp}

@api_router.get("/patients/{patient_id}/vitals")
async def get_vitals(patient_id: str, limit: int = 24):
    cursor = db.vitals.find(
        {"patient_id": patient_id},
        {"_id": 0},
        sort=[("timestamp", -1)]
    ).limit(limit)
    records = await cursor.to_list(length=limit)
    return {"patient_id": patient_id, "count": len(records), "vitals": records}


# ─────────────────────────────────────────────
# HELPER: Build GRU-D input from stored vitals
# ─────────────────────────────────────────────
async def build_grud_input_from_db(patient_id: str):
    """
    Fetch last N_HOURS vitals from MongoDB and build
    GRU-D input tensors (X, mask, delta).
    """
    cursor = db.vitals.find(
        {"patient_id": patient_id},
        {"_id": 0},
        sort=[("timestamp", 1)]
    ).limit(N_HOURS)
    records = await cursor.to_list(length=N_HOURS)

    feat_mean = app.state.feat_mean
    feat_std  = app.state.feat_std

    X_np     = np.zeros((N_HOURS, N_FEATURES))
    mask_np  = np.zeros((N_HOURS, N_FEATURES))
    delta_np = np.zeros((N_HOURS, N_FEATURES))

    last_observed = [-1] * N_FEATURES

    for t, rec in enumerate(records):
        for fi, feat in enumerate(FEATURE_NAMES):
            val = rec.get(feat)
            if val is not None:
                # Normalize
                val_norm = (val - feat_mean[fi]) / feat_std[fi]
                X_np[t, fi]    = val_norm
                mask_np[t, fi] = 1.0
                delta_np[t, fi] = 0.0
                last_observed[fi] = t
            else:
                # Use normal value when missing
                X_np[t, fi]    = (NORMAL_VALUES.get(feat, 0) - feat_mean[fi]) / feat_std[fi]
                mask_np[t, fi] = 0.0
                delta_np[t, fi] = (t - last_observed[fi]) if last_observed[fi] >= 0 else t + 1

    return X_np, mask_np, delta_np, len(records)


# ─────────────────────────────────────────────
# PREDICTION ENDPOINTS (REAL)
# ─────────────────────────────────────────────
@api_router.post("/predict/sepsis")
async def predict_sepsis(patient_id: str):
    try:
        X_np, mask_np, delta_np, n_records = await build_grud_input_from_db(patient_id)

        if n_records == 0:
            # No vitals in DB → fall back to demo prediction
            result = prediction_service._mock_sepsis_prediction(patient_id)
            result["data_source"] = "mock_no_vitals_in_db"
        elif "sepsis_grud" in prediction_service.models:
            # Real GRU-D prediction
            result = prediction_service.predict_sepsis(
                patient_id=patient_id,
                time_series_data=X_np,
                observation_mask=mask_np,
                time_deltas=delta_np
            )
            result["data_source"] = f"real_grud_{n_records}_records"
        else:
            result = prediction_service._mock_sepsis_prediction(patient_id)
            result["data_source"] = "mock_model_not_loaded"

        # Alert if high risk
        if result.get("probability", 0) >= 0.5:
            alert = alert_service.evaluate_sepsis_alert(
                patient_id=patient_id,
                sepsis_probability=result["probability"],
                qsofa_score=2
            )
            if alert:
                await db.alerts.insert_one(alert.to_dict())

        # Store prediction
        await db.predictions.insert_one({
            **result,
            "stored_at": datetime.now(timezone.utc).isoformat()
        })
        return result

    except Exception as e:
        logger.error(f"Sepsis prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/predict/deterioration")
async def predict_deterioration(patient_id: str):
    """Detect patient deterioration using VAE reconstruction error."""
    try:
        X_np, mask_np, delta_np, n_records = await build_grud_input_from_db(patient_id)

        if n_records == 0:
            return {"patient_id": patient_id, "status": "no_vitals", "is_deteriorating": False}

        vae = getattr(app.state, "vae", None)
        threshold = getattr(app.state, "vae_threshold", 0.5)

        if vae is not None:
            # Use last hour's features
            last_hour = X_np[-1:, :]   # (1, n_features)
            tensor = torch.FloatTensor(last_hour).to(device)
            err = vae.compute_reconstruction_error(tensor).item()

            is_deteriorating = err > threshold
            severity = "HIGH" if err > threshold * 2 else "MODERATE" if is_deteriorating else "NORMAL"

            result = {
                "patient_id":          patient_id,
                "is_deteriorating":    is_deteriorating,
                "reconstruction_error": err,
                "threshold":           threshold,
                "severity":            severity,
                "timestamp":           datetime.now().isoformat(),
                "model":               "VAE_v1"
            }
        else:
            # Demo mode
            result = {
                "patient_id":       patient_id,
                "is_deteriorating": False,
                "severity":         "NORMAL",
                "note":             "VAE not loaded — demo mode",
                "timestamp":        datetime.now().isoformat()
            }

        # Alert if deteriorating
        if result.get("is_deteriorating"):
            alert = alert_service.evaluate_deterioration_alert(patient_id, result)
            if alert:
                await db.alerts.insert_one(alert.to_dict())

        return result

    except Exception as e:
        logger.error(f"Deterioration prediction error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/predict/mortality")
async def predict_mortality(
    patient_id: str, apache_score: int, sofa_score: int,
    age: int, comorbidities: int = 0
):
    try:
        result = prediction_service.predict_mortality(
            patient_id=patient_id, apache_score=apache_score,
            sofa_score=sofa_score, age=age, comorbidities=comorbidities
        )
        await db.predictions.insert_one({**result, "stored_at": datetime.now(timezone.utc).isoformat()})
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/predict/organ-failure")
async def predict_organ_failure(patient_id: str, sofa_components: Dict[str, int]):
    try:
        result = prediction_service.predict_organ_failure(patient_id, sofa_components)
        await db.predictions.insert_one({**result, "stored_at": datetime.now(timezone.utc).isoformat()})
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# EXPLAINABILITY ENDPOINTS (REAL SHAP)
# ─────────────────────────────────────────────
@api_router.post("/explain/prediction")
async def explain_prediction(patient_id: str):
    """Generate real SHAP explanation for a patient's last vitals snapshot."""
    try:
        X_np, mask_np, _, n_records = await build_grud_input_from_db(patient_id)

        if n_records == 0:
            return {"error": "No vitals data found for patient", "patient_id": patient_id}

        last_hour = X_np[-1, :]   # (n_features,)

        if explainability_service.explainer is not None:
            explanation = explainability_service.explain_prediction(
                patient_data=last_hour,
                prediction_score=0.5   # placeholder — real score from predict_sepsis
            )
            explanation["patient_id"] = patient_id
            explanation["data_source"] = "real_shap"
        else:
            # Demo SHAP output
            explanation = {
                "patient_id":       patient_id,
                "prediction_score": 0.5,
                "top_5_contributors": [
                    {"feature": f, "value": float(last_hour[FEATURE_NAMES.index(f)]),
                     "impact": "unknown", "magnitude": 0.1}
                    for f in ["heart_rate", "lactate", "resp_rate", "creatinine", "temperature"]
                    if f in FEATURE_NAMES
                ],
                "clinical_explanation": "SHAP explainer not initialized — train models first",
                "data_source": "demo_mode"
            }

        return explanation
    except Exception as e:
        logger.error(f"Explanation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# SCORING ENDPOINTS (unchanged, all working)
# ─────────────────────────────────────────────
async def _save_score(score_type, patient_id, input_data, result):
    await db.scoring_results.insert_one({
        "type": score_type, "patient_id": patient_id,
        "patient_data": input_data.model_dump(),
        "result": result.model_dump(),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

@api_router.post("/scoring/apache-ii")
async def apache_ii(patient_id: str, input_data: APACHE_II_Input):
    try:
        result = calculate_apache_ii(input_data)
        await _save_score("apache_ii", patient_id, input_data, result)
        if result.total_score >= 25:
            alert = alert_service.evaluate_score_alert(
                patient_id, "APACHE II", result.total_score, 25, result.model_dump())
            if alert:
                await db.alerts.insert_one(alert.to_dict())
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/sofa")
async def sofa(patient_id: str, input_data: SOFA_Input):
    try:
        result = calculate_sofa(input_data)
        await _save_score("sofa", patient_id, input_data, result)
        if result.total_score >= 10:
            alert = alert_service.evaluate_score_alert(
                patient_id, "SOFA", result.total_score, 10, result.model_dump())
            if alert:
                await db.alerts.insert_one(alert.to_dict())
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/qsofa")
async def qsofa(patient_id: str, input_data: qSOFA_Input):
    try:
        result = calculate_qsofa(input_data)
        await _save_score("qsofa", patient_id, input_data, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/gcs")
async def gcs(patient_id: str, input_data: GCS_Input):
    try:
        result = calculate_gcs(input_data)
        await _save_score("gcs", patient_id, input_data, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/ranson")
async def ranson(patient_id: str, input_data: Ranson_Input):
    try:
        result = calculate_ranson(input_data)
        await _save_score("ranson", patient_id, input_data, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/saps")
async def saps(patient_id: str, input_data: SAPS_Input):
    try:
        result = calculate_saps(input_data)
        await _save_score("saps", patient_id, input_data, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/mods")
async def mods(patient_id: str, input_data: MODS_Input):
    try:
        result = calculate_mods(input_data)
        await _save_score("mods", patient_id, input_data, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/murray")
async def murray(patient_id: str, input_data: Murray_Input):
    try:
        result = calculate_murray(input_data)
        await _save_score("murray", patient_id, input_data, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@api_router.post("/scoring/alvarado")
async def alvarado(patient_id: str, input_data: Alvarado_Input):
    try:
        result = calculate_alvarado(input_data)
        await _save_score("alvarado", patient_id, input_data, result)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─────────────────────────────────────────────
# ALERT ENDPOINTS (NOW PERSISTED TO MONGODB)
# ─────────────────────────────────────────────
@api_router.get("/alerts/active")
async def get_active_alerts(patient_id: Optional[str] = None, severity: Optional[str] = None):
    query = {"acknowledged": False}
    if patient_id:
        query["patient_id"] = patient_id
    if severity:
        query["severity"] = severity.upper()
    cursor = db.alerts.find(query, {"_id": 0}).sort("timestamp", -1).limit(100)
    alerts = await cursor.to_list(length=100)
    return {"total": len(alerts), "alerts": alerts}

@api_router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, body: AlertAck):
    result = await db.alerts.update_one(
        {"alert_id": alert_id},
        {"$set": {
            "acknowledged":    True,
            "acknowledged_by": body.acknowledged_by,
            "acknowledged_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "acknowledged", "alert_id": alert_id}

@api_router.get("/alerts/summary")
async def get_alert_summary(patient_id: Optional[str] = None):
    query = {"acknowledged": False}
    if patient_id:
        query["patient_id"] = patient_id
    alerts = await db.alerts.find(query, {"_id": 0}).to_list(length=1000)
    return {
        "total_active": len(alerts),
        "critical":     len([a for a in alerts if a.get("severity") == "CRITICAL"]),
        "urgent":       len([a for a in alerts if a.get("severity") == "URGENT"]),
        "warning":      len([a for a in alerts if a.get("severity") == "WARNING"]),
        "unacknowledged": len([a for a in alerts if not a.get("acknowledged")])
    }


# ─────────────────────────────────────────────
# PATIENT DASHBOARD (full aggregated view)
# ─────────────────────────────────────────────
@api_router.get("/dashboard/{patient_id}")
async def get_dashboard(patient_id: str):
    try:
        # Patient info
        patient = await db.patients.find_one({"patient_id": patient_id}, {"_id": 0})

        # Latest scores
        latest_scores = {}
        for score_type in ["apache_ii", "sofa", "qsofa", "gcs"]:
            doc = await db.scoring_results.find_one(
                {"patient_id": patient_id, "type": score_type},
                {"_id": 0},
                sort=[("timestamp", -1)]
            )
            if doc:
                latest_scores[score_type] = doc["result"]

        # Latest predictions
        latest_preds = {}
        for pred_type in ["sepsis", "mortality", "organ_failure"]:
            doc = await db.predictions.find_one(
                {"patient_id": patient_id, "prediction_type": pred_type},
                {"_id": 0},
                sort=[("stored_at", -1)]
            )
            if doc:
                latest_preds[pred_type] = doc

        # Alerts
        alert_query = {"patient_id": patient_id, "acknowledged": False}
        alerts = await db.alerts.find(alert_query, {"_id": 0}).to_list(length=10)

        # Vitals trend (last 12 hours)
        vitals_cursor = db.vitals.find(
            {"patient_id": patient_id}, {"_id": 0},
            sort=[("timestamp", -1)]
        ).limit(12)
        vitals_trend = await vitals_cursor.to_list(length=12)

        return {
            "patient_id":    patient_id,
            "timestamp":     datetime.now().isoformat(),
            "patient_info":  patient,
            "latest_scores": latest_scores,
            "predictions":   latest_preds,
            "active_alerts": alerts,
            "vitals_trend":  vitals_trend,
            "alert_summary": {
                "total": len(alerts),
                "critical": len([a for a in alerts if a.get("severity") == "CRITICAL"]),
                "urgent":   len([a for a in alerts if a.get("severity") == "URGENT"]),
            }
        }
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────
# MOUNT ROUTER + CORS
# ─────────────────────────────────────────────
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
