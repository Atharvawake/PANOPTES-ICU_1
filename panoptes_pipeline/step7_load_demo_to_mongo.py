"""
PANOPTES-ICU — Step 7: Load MIMIC Demo Patients into MongoDB
=============================================================
Reads MIMIC-III demo CSVs and loads 10 ICU patients into
your MongoDB database so the full pipeline can be tested
end-to-end via the FastAPI server.

Run this AFTER starting the server, or run standalone with
a direct MongoDB connection.

Usage:
    python step7_load_demo_to_mongo.py
"""

import os
import csv
import asyncio
import numpy as np
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path
from collections import defaultdict

load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

MIMIC_DIR  = "mimic_data"
MONGO_URL  = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME    = os.environ.get("DB_NAME", "panoptes_icu")
N_PATIENTS = 10   # how many patients to load

# ── MIMIC vital sign item IDs ──
VITAL_ITEMS = {
    "heart_rate":  ["220045", "211"],
    "sbp":         ["220179", "220050", "51"],
    "dbp":         ["220180", "220051", "8368"],
    "map":         ["220181", "220052", "52"],
    "resp_rate":   ["220210", "618"],
    "spo2":        ["220277", "646"],
    "temperature": ["223762", "223761", "676", "678"],
    "gcs_total":   ["198"],
    "fio2":        ["223835", "3420", "190"],
    "glucose_chart": ["220621", "807", "1529"],
}

# ── MIMIC lab item IDs ──
LAB_ITEMS = {
    "sodium":      ["50983"],
    "potassium":   ["50971"],
    "creatinine":  ["50912"],
    "bun":         ["51006"],
    "bicarbonate": ["50882"],
    "wbc":         ["51301"],
    "hemoglobin":  ["51222"],
    "hematocrit":  ["51221"],
    "platelet":    ["51265"],
    "bilirubin":   ["50885"],
    "lactate":     ["50813"],
    "ph":          ["50820"],
    "pao2":        ["50821"],
}

SEPSIS_ICD9 = {"99591", "99592", "78552"}

def parse_dt(s):
    if not s: return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try: return datetime.strptime(s.strip(), fmt)
        except: continue
    return None

def fahrenheit_to_celsius(f):
    return (f - 32) * 5.0 / 9.0


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db     = client[DB_NAME]
    print(f"Connected to MongoDB: {MONGO_URL} / {DB_NAME}")

    # ── Load MIMIC tables ──
    print("\nLoading MIMIC tables...")

    # Patients
    patients_raw = {}
    with open(os.path.join(MIMIC_DIR, "PATIENTS.csv")) as f:
        for row in csv.DictReader(f):
            patients_raw[row["subject_id"]] = row

    # ICU stays
    icustays_raw = {}
    with open(os.path.join(MIMIC_DIR, "ICUSTAYS.csv")) as f:
        for row in csv.DictReader(f):
            icustays_raw[row["icustay_id"]] = row

    # Diagnoses → sepsis label
    sepsis_hadms = set()
    with open(os.path.join(MIMIC_DIR, "DIAGNOSES_ICD.csv")) as f:
        for row in csv.DictReader(f):
            if row["icd9_code"] in SEPSIS_ICD9:
                sepsis_hadms.add(row["hadm_id"])

    # Admissions → diagnosis text
    admissions_raw = {}
    with open(os.path.join(MIMIC_DIR, "ADMISSIONS.csv")) as f:
        for row in csv.DictReader(f):
            admissions_raw[row["hadm_id"]] = row

    # Vital sign item map
    vital_map = {}
    for feat, ids in VITAL_ITEMS.items():
        for iid in ids:
            vital_map[iid] = feat

    lab_map = {}
    for feat, ids in LAB_ITEMS.items():
        for iid in ids:
            lab_map[iid] = feat

    # ── Load chartevents ──
    print("Loading CHARTEVENTS (may take a moment)...")
    chartevents = defaultdict(lambda: defaultdict(list))  # icustay → feat → [(dt, val)]
    with open(os.path.join(MIMIC_DIR, "CHARTEVENTS.csv")) as f:
        for row in csv.DictReader(f):
            if row["itemid"] not in vital_map: continue
            if row["error"] == "1": continue
            if not row["icustay_id"] or not row["valuenum"]: continue
            try: val = float(row["valuenum"])
            except: continue
            dt = parse_dt(row["charttime"])
            if dt is None: continue
            feat = vital_map[row["itemid"]]
            if "temperature" in feat:
                if row["itemid"] in ["223761", "678", "679"]:
                    val = fahrenheit_to_celsius(val)
                feat = "temperature"
            chartevents[row["icustay_id"]][feat].append((dt, val))

    # ── Load labevents ──
    print("Loading LABEVENTS...")
    hadm_to_icustay = defaultdict(list)
    for icustay_id, info in icustays_raw.items():
        hadm_to_icustay[info["hadm_id"]].append(icustay_id)

    labevents = defaultdict(lambda: defaultdict(list))
    with open(os.path.join(MIMIC_DIR, "LABEVENTS.csv")) as f:
        for row in csv.DictReader(f):
            if row["itemid"] not in lab_map: continue
            if not row["hadm_id"] or not row["valuenum"]: continue
            try: val = float(row["valuenum"])
            except: continue
            dt = parse_dt(row["charttime"])
            if dt is None: continue
            feat = lab_map[row["itemid"]]
            for icustay_id in hadm_to_icustay.get(row["hadm_id"], []):
                stay = icustays_raw.get(icustay_id)
                if stay:
                    intime  = parse_dt(stay["intime"])
                    outtime = parse_dt(stay["outtime"])
                    if intime and outtime and intime <= dt <= outtime:
                        labevents[icustay_id][feat].append((dt, val))

    # ── Select N_PATIENTS ICU stays with vitals ──
    stays_with_data = [
        icu_id for icu_id in icustays_raw
        if icu_id in chartevents and len(chartevents[icu_id]) >= 3
    ][:N_PATIENTS]

    print(f"\nLoading {len(stays_with_data)} patients into MongoDB...")
    loaded_patients = 0
    loaded_vitals   = 0

    for icustay_id in stays_with_data:
        stay_info  = icustays_raw[icustay_id]
        subject_id = stay_info["subject_id"]
        hadm_id    = stay_info["hadm_id"]
        patient_r  = patients_raw.get(subject_id, {})
        admission  = admissions_raw.get(hadm_id, {})
        intime     = parse_dt(stay_info["intime"])

        sepsis     = hadm_id in sepsis_hadms
        gender     = patient_r.get("gender", "U")
        dob        = parse_dt(patient_r.get("dob", ""))

        # Estimate age (dates are shifted in MIMIC demo)
        age = 60
        if dob and intime:
            age = max(18, min(100, (intime - dob).days // 365))

        patient_id = f"MIMIC_{icustay_id}"
        diagnosis  = admission.get("diagnosis", "ICU Admission")
        if sepsis:
            diagnosis += " | SEPSIS"

        # Create patient record
        await db.patients.update_one(
            {"patient_id": patient_id},
            {"$setOnInsert": {
                "patient_id":     patient_id,
                "name":           f"Patient {icustay_id}",
                "age":            age,
                "gender":         gender,
                "admission_date": stay_info["intime"][:10] if stay_info["intime"] else "unknown",
                "diagnosis":      diagnosis[:200],
                "icustay_id":     icustay_id,
                "sepsis_label":   int(sepsis),
                "mimic_subject":  subject_id,
                "created_at":     datetime.now(timezone.utc).isoformat()
            }},
            upsert=True
        )
        loaded_patients += 1

        # Build hourly vitals and insert
        all_events = {**chartevents.get(icustay_id, {}), **labevents.get(icustay_id, {})}

        # Collect all timestamps → round to hour → aggregate
        ts_map = defaultdict(dict)   # hour_offset → {feat: val}

        for feat, events in all_events.items():
            for dt, val in events:
                if intime is None: continue
                hour = int((dt - intime).total_seconds() / 3600)
                if 0 <= hour < 48:
                    if feat not in ts_map[hour]:
                        ts_map[hour][feat] = []
                    ts_map[hour][feat].append(val)

        # Insert one doc per hour
        for hour in sorted(ts_map.keys()):
            feats = ts_map[hour]
            timestamp = intime.replace(
                hour=(intime.hour + hour) % 24,
                minute=0, second=0, microsecond=0
            ).isoformat() if intime else f"hour_{hour}"

            vitals_doc = {
                "patient_id": patient_id,
                "timestamp":  timestamp,
                "hour_offset": hour,
                **{feat: float(np.mean(vals)) for feat, vals in feats.items()}
            }
            await db.vitals.insert_one(vitals_doc)
            loaded_vitals += 1

    print(f"\n{'='*50}")
    print(f"✅ Loaded {loaded_patients} patients into db.patients")
    print(f"✅ Loaded {loaded_vitals} hourly vitals records into db.vitals")
    print(f"\nSample patient IDs:")
    for icu_id in stays_with_data:
        print(f"  MIMIC_{icu_id}")
    print(f"\nTest with:")
    print(f"  curl http://localhost:8001/api/patients")
    print(f"  curl -X POST http://localhost:8001/api/predict/sepsis?patient_id=MIMIC_{stays_with_data[0]}")
    print(f"  curl http://localhost:8001/api/dashboard/MIMIC_{stays_with_data[0]}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
