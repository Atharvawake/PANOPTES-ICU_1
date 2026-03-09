# PANOPTES-ICU — Data Pipeline & Model Training

## Folder Structure
```
panoptes_pipeline/
├── step1_extract_features.py     ← Extract vitals + labs from MIMIC CSVs
├── step2_build_timeseries.py     ← Build GRU-D numpy arrays (X, mask, delta)
├── step3_train_grud.py           ← Train GRU-D sepsis prediction model
├── step4_train_vae.py            ← Train VAE deterioration detector
├── step5_init_shap.py            ← Initialize SHAP explainability
├── step6_server_production.py    ← Updated FastAPI server (copy to backend/)
├── step7_load_demo_to_mongo.py   ← Load MIMIC patients into MongoDB
├── run_all.py                    ← Run all steps in sequence
├── data/                         ← Generated numpy arrays + labels
└── models/                       ← Saved model weights
```

## Prerequisites
```bash
pip install torch numpy pandas scikit-learn shap ruptures motor pymongo python-dotenv
```

## Setup
1. Update MIMIC_DIR in step1_extract_features.py to point to your MIMIC folder
2. Create backend/.env:
   ```
   MONGO_URL=mongodb://localhost:27017
   DB_NAME=panoptes_icu
   CORS_ORIGINS=http://localhost:3000
   ```

## Run Pipeline
```bash
cd panoptes_pipeline/
python run_all.py          # runs all 5 training steps
```

## Start System
```bash
# Terminal 1 — MongoDB
mongod

# Terminal 2 — Backend
cp step6_server_production.py ../backend/server.py
cd ../backend
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Terminal 3 — Load patients
python step7_load_demo_to_mongo.py

# Terminal 4 — Frontend
cd ../frontend
yarn start
```

## What Each Step Produces
| Step | Output |
|------|--------|
| Step 1 | data/raw_vitals.pkl, data/raw_labs.pkl, data/patient_labels.csv |
| Step 2 | data/X_timeseries.npy, data/X_mask.npy, data/X_delta.npy, data/y_sepsis.npy |
| Step 3 | models/grud_sepsis_v1.pt, models/training_log.csv |
| Step 4 | models/vae_detector_v1.pt, models/vae_threshold.npy |
| Step 5 | models/shap_background.npy, models/shap_feature_names.txt |
| Step 7 | MongoDB: patients + vitals collections populated |

## Notes
- Demo dataset: 100 patients — good for pipeline testing, not production accuracy
- Full MIMIC-III (58K patients): apply at https://physionet.org/
- Run same pipeline on full data — target GRU-D AUC > 0.85
