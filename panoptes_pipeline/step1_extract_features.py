"""
PANOPTES-ICU — Step 1: Feature Extraction from MIMIC-III Demo
=============================================================
Reads raw MIMIC-III CSV files and extracts:
  - Vital signs time-series from CHARTEVENTS
  - Lab values from LABEVENTS
  - Sepsis labels from DIAGNOSES_ICD
  - Mortality labels from PATIENTS
  - ICU stay info from ICUSTAYS

Output:
  data/raw_vitals.pkl      — per-patient vital sign time-series
  data/raw_labs.pkl        — per-patient lab value time-series
  data/patient_labels.csv  — sepsis + mortality labels per ICU stay
"""

import os
import csv
import pickle
import pandas as pd
from datetime import datetime
from collections import defaultdict

# ─────────────────────────────────────────────
# CONFIG — update MIMIC_DIR to your path
# ─────────────────────────────────────────────
MIMIC_DIR   = "mimic_data"
OUTPUT_DIR  = "data"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ─────────────────────────────────────────────
# VITAL SIGN ITEM IDs  (CareVue + MetaVision)
# ─────────────────────────────────────────────
VITAL_ITEMS = {
    # Heart Rate
    "heart_rate":           ["220045", "211"],
    # Systolic BP
    "sbp":                  ["220179", "220050", "51"],
    # Diastolic BP
    "dbp":                  ["220180", "220051", "8368"],
    # Mean Arterial Pressure
    "map":                  ["220181", "220052", "52"],
    # Respiratory Rate
    "resp_rate":            ["220210", "618"],
    # SpO2
    "spo2":                 ["220277", "646"],
    # Temperature (Fahrenheit → convert to Celsius)
    "temperature_f":        ["223761", "678"],
    # Temperature (Celsius)
    "temperature_c":        ["223762", "676"],
    # GCS Total
    "gcs_total":            ["198"],
    # GCS Eye
    "gcs_eye":              ["220739", "226756"],
    # GCS Verbal
    "gcs_verbal":           ["223900", "226758"],
    # GCS Motor
    "gcs_motor":            ["223901", "226757"],
    # FiO2
    "fio2":                 ["223835", "3420", "190", "189"],
    # Glucose (chart)
    "glucose_chart":        ["220621", "807", "811", "1529"],
}

# ─────────────────────────────────────────────
# LAB ITEM IDs
# ─────────────────────────────────────────────
LAB_ITEMS = {
    "sodium":           ["50983"],
    "potassium":        ["50971"],
    "creatinine":       ["50912"],
    "bun":              ["51006"],
    "glucose_lab":      ["50931"],
    "bicarbonate":      ["50882"],
    "wbc":              ["51301"],
    "hemoglobin":       ["51222"],
    "hematocrit":       ["51221"],
    "platelet":         ["51265"],
    "bilirubin":        ["50885"],
    "lactate":          ["50813"],
    "ph":               ["50820"],
    "pco2":             ["50818"],
    "pao2":             ["50821"],   # PaO2 — may be sparse
    "chloride":         ["50902"],
    "calcium":          ["50893"],
    "magnesium":        ["50960"],
    "phosphate":        ["50970"],
    "inr":              ["51237"],
}

# ─────────────────────────────────────────────
# SEPSIS ICD-9 CODES
# ─────────────────────────────────────────────
SEPSIS_ICD9 = {"99591", "99592", "78552", "03810", "99500"}


def parse_dt(s):
    """Parse datetime string, return None on failure."""
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s.strip(), fmt)
        except ValueError:
            continue
    return None


def fahrenheit_to_celsius(f):
    return (f - 32) * 5.0 / 9.0


# ─────────────────────────────────────────────
# STEP 1A: Load ICU Stays
# ─────────────────────────────────────────────
print("Loading ICU stays...")
icustays = {}   # icustay_id → {subject_id, hadm_id, intime, outtime, los}
with open(os.path.join(MIMIC_DIR, "ICUSTAYS.csv")) as f:
    for row in csv.DictReader(f):
        icustays[row["icustay_id"]] = {
            "subject_id": row["subject_id"],
            "hadm_id":    row["hadm_id"],
            "intime":     parse_dt(row["intime"]),
            "outtime":    parse_dt(row["outtime"]),
            "los_days":   float(row["los"]) if row["los"] else None,
            "care_unit":  row["first_careunit"],
        }
print(f"  → {len(icustays)} ICU stays loaded")

# ─────────────────────────────────────────────
# STEP 1B: Load Mortality Labels
# ─────────────────────────────────────────────
print("Loading mortality labels...")
mortality = {}  # subject_id → expire_flag
with open(os.path.join(MIMIC_DIR, "PATIENTS.csv")) as f:
    for row in csv.DictReader(f):
        mortality[row["subject_id"]] = int(row["expire_flag"])
print(f"  → {len(mortality)} patients, {sum(mortality.values())} deceased")

# ─────────────────────────────────────────────
# STEP 1C: Load Sepsis Labels
# ─────────────────────────────────────────────
print("Loading sepsis labels...")
sepsis_admissions = set()   # hadm_id
with open(os.path.join(MIMIC_DIR, "DIAGNOSES_ICD.csv")) as f:
    for row in csv.DictReader(f):
        if row["icd9_code"] in SEPSIS_ICD9:
            sepsis_admissions.add(row["hadm_id"])
print(f"  → {len(sepsis_admissions)} admissions with sepsis ICD-9")

# ─────────────────────────────────────────────
# STEP 1D: Build reverse lookup maps
# ─────────────────────────────────────────────
# itemid → feature_name (vital)
vital_itemid_map = {}
for feat_name, item_ids in VITAL_ITEMS.items():
    for iid in item_ids:
        vital_itemid_map[iid] = feat_name

# itemid → feature_name (lab)
lab_itemid_map = {}
for feat_name, item_ids in LAB_ITEMS.items():
    for iid in item_ids:
        lab_itemid_map[iid] = feat_name

# ─────────────────────────────────────────────
# STEP 1E: Extract Vital Signs from CHARTEVENTS
# ─────────────────────────────────────────────
print("Extracting vital signs from CHARTEVENTS (this may take a moment)...")

# raw_vitals: icustay_id → {feat_name → [(datetime, value), ...]}
raw_vitals = defaultdict(lambda: defaultdict(list))
rows_read = 0
rows_used = 0

with open(os.path.join(MIMIC_DIR, "CHARTEVENTS.csv")) as f:
    for row in csv.DictReader(f):
        rows_read += 1
        itemid = row["itemid"]
        if itemid not in vital_itemid_map:
            continue
        if row["error"] == "1":
            continue
        icustay_id = row["icustay_id"]
        if not icustay_id:
            continue
        val_str = row["valuenum"]
        if not val_str:
            continue
        try:
            val = float(val_str)
        except ValueError:
            continue
        dt = parse_dt(row["charttime"])
        if dt is None:
            continue

        feat = vital_itemid_map[itemid]

        # Convert Fahrenheit to Celsius
        if feat == "temperature_f":
            val = fahrenheit_to_celsius(val)
            feat = "temperature"
        elif feat == "temperature_c":
            feat = "temperature"

        raw_vitals[icustay_id][feat].append((dt, val))
        rows_used += 1

print(f"  → Read {rows_read:,} rows, extracted {rows_used:,} vital events")
print(f"  → Vital data for {len(raw_vitals)} ICU stays")

# ─────────────────────────────────────────────
# STEP 1F: Extract Lab Values from LABEVENTS
# ─────────────────────────────────────────────
print("Extracting lab values from LABEVENTS...")

# Match labs to ICU stays via hadm_id
hadm_to_icustay = defaultdict(list)
for icustay_id, info in icustays.items():
    hadm_to_icustay[info["hadm_id"]].append(icustay_id)

raw_labs = defaultdict(lambda: defaultdict(list))
lab_rows_used = 0

with open(os.path.join(MIMIC_DIR, "LABEVENTS.csv")) as f:
    for row in csv.DictReader(f):
        itemid = row["itemid"]
        if itemid not in lab_itemid_map:
            continue
        hadm_id = row["hadm_id"]
        if not hadm_id:
            continue
        val_str = row["valuenum"]
        if not val_str:
            continue
        try:
            val = float(val_str)
        except ValueError:
            continue
        dt = parse_dt(row["charttime"])
        if dt is None:
            continue

        feat = lab_itemid_map[itemid]

        # Assign to matching ICU stays
        for icustay_id in hadm_to_icustay.get(hadm_id, []):
            stay = icustays.get(icustay_id)
            if stay and stay["intime"] and stay["outtime"]:
                if stay["intime"] <= dt <= stay["outtime"]:
                    raw_labs[icustay_id][feat].append((dt, val))
                    lab_rows_used += 1

print(f"  → Extracted {lab_rows_used:,} lab events for {len(raw_labs)} ICU stays")

# ─────────────────────────────────────────────
# STEP 1G: Build Patient Labels
# ─────────────────────────────────────────────
print("Building patient labels...")
label_rows = []
for icustay_id, info in icustays.items():
    subject_id = info["subject_id"]
    hadm_id    = info["hadm_id"]
    sepsis     = 1 if hadm_id in sepsis_admissions else 0
    mort       = mortality.get(subject_id, 0)

    has_vitals = icustay_id in raw_vitals
    has_labs   = icustay_id in raw_labs

    label_rows.append({
        "icustay_id":  icustay_id,
        "subject_id":  subject_id,
        "hadm_id":     hadm_id,
        "care_unit":   info["care_unit"],
        "los_days":    info["los_days"],
        "sepsis":      sepsis,
        "mortality":   mort,
        "has_vitals":  int(has_vitals),
        "has_labs":    int(has_labs),
    })

labels_df = pd.DataFrame(label_rows)
labels_path = os.path.join(OUTPUT_DIR, "patient_labels.csv")
labels_df.to_csv(labels_path, index=False)
print(f"  → Labels saved: {labels_path}")
print(f"  → Sepsis: {labels_df['sepsis'].sum()} / {len(labels_df)} stays")
print(f"  → Mortality: {labels_df['mortality'].sum()} / {len(labels_df)} stays")
print(f"  → Has vitals: {labels_df['has_vitals'].sum()}")
print(f"  → Has labs:   {labels_df['has_labs'].sum()}")

# ─────────────────────────────────────────────
# STEP 1H: Save Raw Data
# ─────────────────────────────────────────────
vitals_path = os.path.join(OUTPUT_DIR, "raw_vitals.pkl")
with open(vitals_path, "wb") as f:
    pickle.dump(dict(raw_vitals), f)
print(f"\nSaved raw_vitals.pkl → {vitals_path}")

labs_path = os.path.join(OUTPUT_DIR, "raw_labs.pkl")
with open(labs_path, "wb") as f:
    pickle.dump(dict(raw_labs), f)
print(f"Saved raw_labs.pkl   → {labs_path}")

print("\n✅ Step 1 Complete! Run step2_build_timeseries.py next.")
