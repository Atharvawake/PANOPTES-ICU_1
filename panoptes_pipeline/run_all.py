"""
PANOPTES-ICU — Step 2: Build Time-Series Arrays for GRU-D (FIXED)
"""

import os
import pickle
import csv
import numpy as np
import pandas as pd
from datetime import datetime
from collections import defaultdict

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
DATA_DIR   = "data"
MIMIC_DIR  = "mimic_data"
N_HOURS    = 24
MIN_HOURS  = 1          # lowered from 6 to include more demo patients

FEATURE_NAMES = [
    "heart_rate", "sbp", "dbp", "map", "resp_rate", "spo2",
    "temperature", "gcs_total", "gcs_eye", "gcs_verbal", "gcs_motor",
    "fio2", "glucose_chart", "sodium", "potassium", "creatinine",
    "bun", "glucose_lab", "bicarbonate", "wbc", "hemoglobin",
    "hematocrit", "platelet", "bilirubin", "lactate", "ph", "pao2",
]
N_FEATURES = len(FEATURE_NAMES)
feat_idx   = {f: i for i, f in enumerate(FEATURE_NAMES)}

NORMAL_VALUES = {
    "heart_rate": 75.0, "sbp": 120.0, "dbp": 70.0, "map": 85.0,
    "resp_rate": 16.0, "spo2": 98.0, "temperature": 37.0,
    "gcs_total": 15.0, "gcs_eye": 4.0, "gcs_verbal": 5.0, "gcs_motor": 6.0,
    "fio2": 0.21, "glucose_chart": 100.0, "sodium": 140.0, "potassium": 4.0,
    "creatinine": 1.0, "bun": 15.0, "glucose_lab": 100.0, "bicarbonate": 24.0,
    "wbc": 8.0, "hemoglobin": 13.0, "hematocrit": 40.0, "platelet": 200.0,
    "bilirubin": 0.8, "lactate": 1.0, "ph": 7.4, "pao2": 95.0,
}

VALID_RANGES = {
    "heart_rate": (0, 300), "sbp": (40, 300), "dbp": (10, 200),
    "map": (20, 220), "resp_rate": (0, 80), "spo2": (50, 100),
    "temperature": (25, 45), "gcs_total": (3, 15), "gcs_eye": (1, 4),
    "gcs_verbal": (1, 5), "gcs_motor": (1, 6), "fio2": (0.1, 1.0),
    "glucose_chart": (10, 2000), "sodium": (100, 180), "potassium": (1.5, 10),
    "creatinine": (0.1, 30), "bun": (1, 200), "glucose_lab": (10, 2000),
    "bicarbonate": (5, 50), "wbc": (0, 200), "hemoglobin": (1, 25),
    "hematocrit": (5, 70), "platelet": (1, 2000), "bilirubin": (0, 50),
    "lactate": (0.1, 30), "ph": (6.5, 8.0), "pao2": (20, 700),
}


def parse_dt(s):
    if not s: return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try: return datetime.strptime(s.strip(), fmt)
        except: continue
    return None


def is_valid(feat, val):
    lo, hi = VALID_RANGES.get(feat, (-1e9, 1e9))
    return lo <= val <= hi


def build_hourly_series(events, intime, n_hours):
    hourly = [[] for _ in range(n_hours)]
    for dt, val in events:
        if dt < intime: continue
        hour = int((dt - intime).total_seconds() / 3600)
        if 0 <= hour < n_hours:
            hourly[hour].append(val)
    return np.array([np.mean(v) if v else np.nan for v in hourly])


def compute_time_delta(series):
    delta = np.zeros(len(series))
    last_obs = -1
    for t in range(len(series)):
        if not np.isnan(series[t]):
            last_obs = t
            delta[t] = 0.0
        else:
            delta[t] = (t - last_obs) if last_obs >= 0 else t + 1
    return delta


def forward_fill_and_default(series, feat_name):
    filled = series.copy()
    last_val = NORMAL_VALUES.get(feat_name, 0.0)
    for t in range(len(filled)):
        if np.isnan(filled[t]):
            filled[t] = last_val
        else:
            last_val = filled[t]
    return filled


# ─────────────────────────────────────────────
# LOAD RAW DATA
# ─────────────────────────────────────────────
print("Loading raw data...")
with open(os.path.join(DATA_DIR, "raw_vitals.pkl"), "rb") as f:
    raw_vitals = pickle.load(f)
with open(os.path.join(DATA_DIR, "raw_labs.pkl"), "rb") as f:
    raw_labs = pickle.load(f)

labels_df = pd.read_csv(os.path.join(DATA_DIR, "patient_labels.csv"))

# ── KEY FIX: convert icustay_id to STRING in labels ──
labels_df["icustay_id"] = labels_df["icustay_id"].astype(str)
labels_df = labels_df.set_index("icustay_id")

print(f"Loaded {len(raw_vitals)} vital records, {len(raw_labs)} lab records")
print(f"Labels rows: {len(labels_df)}")

# ─────────────────────────────────────────────
# LOAD ICU STAY INFO (intime/outtime/los)
# ─────────────────────────────────────────────
icustay_info = {}
icustays_path = os.path.join(MIMIC_DIR, "ICUSTAYS.csv")
print(f"Loading ICU stay info from: {icustays_path}")

if not os.path.exists(icustays_path):
    print(f"ERROR: Cannot find {icustays_path}")
    print("Please make sure your MIMIC CSV files are in the mimic_data/ folder")
    exit(1)

with open(icustays_path) as f:
    for row in csv.DictReader(f):
        icustay_info[str(row["icustay_id"])] = {
            "intime":  parse_dt(row["intime"]),
            "outtime": parse_dt(row["outtime"]),
            "los":     float(row["los"]) if row["los"] else 0,
        }

print(f"Loaded {len(icustay_info)} ICU stays from ICUSTAYS.csv")

# ─────────────────────────────────────────────
# DEBUG: Check key overlap
# ─────────────────────────────────────────────
all_icustay_ids = set(str(k) for k in raw_vitals.keys()) | \
                  set(str(k) for k in raw_labs.keys())

overlap_with_icu  = all_icustay_ids & set(icustay_info.keys())
overlap_with_lbls = all_icustay_ids & set(labels_df.index)

print(f"\nDEBUG:")
print(f"  Total unique ICU stays in vitals/labs: {len(all_icustay_ids)}")
print(f"  Found in icustay_info:  {len(overlap_with_icu)}")
print(f"  Found in labels_df:     {len(overlap_with_lbls)}")

# ─────────────────────────────────────────────
# BUILD ARRAYS
# ─────────────────────────────────────────────
print(f"\nBuilding {N_HOURS}-hour time-series arrays...")

X_list = []; mask_list = []; delta_list = []
y_sep_list = []; y_mort_list = []; id_list = []
skipped = 0; skip_reasons = defaultdict(int)

for icustay_id in sorted(all_icustay_ids):
    sid = str(icustay_id)

    # Check ICU stay info
    stay = icustay_info.get(sid)
    if stay is None:
        skip_reasons["no_icu_info"] += 1
        skipped += 1
        continue

    intime = stay["intime"]
    los    = stay["los"]

    if intime is None:
        skip_reasons["no_intime"] += 1
        skipped += 1
        continue

    if los < (MIN_HOURS / 24.0):
        skip_reasons["too_short"] += 1
        skipped += 1
        continue

    # Check labels
    if sid not in labels_df.index:
        skip_reasons["no_label"] += 1
        skipped += 1
        continue

    row    = labels_df.loc[sid]
    sepsis = int(row["sepsis"])
    mort   = int(row["mortality"])

    # ── Build features ──
    X_stay     = np.zeros((N_HOURS, N_FEATURES))
    mask_stay  = np.zeros((N_HOURS, N_FEATURES))
    delta_stay = np.zeros((N_HOURS, N_FEATURES))

    vitals = raw_vitals.get(sid, raw_vitals.get(icustay_id, {}))
    labs   = raw_labs.get(sid,   raw_labs.get(icustay_id, {}))
    all_feats = {**vitals, **labs}

    for feat_name in FEATURE_NAMES:
        fi     = feat_idx[feat_name]
        events = all_feats.get(feat_name, [])
        events = [(dt, v) for dt, v in events if is_valid(feat_name, v)]

        raw_series    = build_hourly_series(events, intime, N_HOURS)
        mask_col      = (~np.isnan(raw_series)).astype(float)
        delta_col     = compute_time_delta(raw_series)
        filled_series = forward_fill_and_default(raw_series, feat_name)

        X_stay[:, fi]     = filled_series
        mask_stay[:, fi]  = mask_col
        delta_stay[:, fi] = delta_col

    X_list.append(X_stay)
    mask_list.append(mask_stay)
    delta_list.append(delta_stay)
    y_sep_list.append(sepsis)
    y_mort_list.append(mort)
    id_list.append(int(sid))

print(f"  → Processed: {len(X_list)} stays | Skipped: {skipped}")
if skip_reasons:
    print(f"  → Skip reasons: {dict(skip_reasons)}")

if len(X_list) == 0:
    print("\nERROR: No stays were processed!")
    print("Checking first few vitals keys vs icustay_info keys...")
    vkeys = list(raw_vitals.keys())[:5]
    ikeys = list(icustay_info.keys())[:5]
    print(f"  Vitals keys: {vkeys}")
    print(f"  ICU info keys: {ikeys}")
    exit(1)

# ─────────────────────────────────────────────
# NORMALIZE
# ─────────────────────────────────────────────
print("Normalizing features...")
X_all     = np.array(X_list)
feat_mean = np.nanmean(X_all.reshape(-1, N_FEATURES), axis=0)
feat_std  = np.nanstd(X_all.reshape(-1, N_FEATURES),  axis=0)
feat_std[feat_std == 0] = 1.0

X_normalized = (X_all - feat_mean) / feat_std

np.save(os.path.join(DATA_DIR, "feat_mean.npy"), feat_mean)
np.save(os.path.join(DATA_DIR, "feat_std.npy"),  feat_std)

# ─────────────────────────────────────────────
# SAVE
# ─────────────────────────────────────────────
np.save(os.path.join(DATA_DIR, "X_timeseries.npy"), X_normalized)
np.save(os.path.join(DATA_DIR, "X_mask.npy"),       np.array(mask_list))
np.save(os.path.join(DATA_DIR, "X_delta.npy"),      np.array(delta_list))
np.save(os.path.join(DATA_DIR, "y_sepsis.npy"),     np.array(y_sep_list))
np.save(os.path.join(DATA_DIR, "y_mortality.npy"),  np.array(y_mort_list))
np.save(os.path.join(DATA_DIR, "icustay_ids.npy"),  np.array(id_list))

with open(os.path.join(DATA_DIR, "feature_names.txt"), "w") as f:
    f.write("\n".join(FEATURE_NAMES))

# ─────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────
print("\n" + "="*50)
print("DATASET SUMMARY")
print("="*50)
print(f"Total ICU stays:   {len(X_list)}")
print(f"Shape X:           {X_normalized.shape}  (stays × hours × features)")
print(f"Sepsis +ve:        {sum(y_sep_list)} ({100*sum(y_sep_list)/len(y_sep_list):.1f}%)")
print(f"Mortality +ve:     {sum(y_mort_list)} ({100*sum(y_mort_list)/len(y_mort_list):.1f}%)")

mask_arr = np.array(mask_list)
obs_rate = mask_arr.mean(axis=(0, 1))
print("\nObservation rate per feature:")
for i, fn in enumerate(FEATURE_NAMES):
    bar = "█" * int(obs_rate[i] * 20)
    print(f"  {fn:20s} {obs_rate[i]:.2f}  {bar}")

print("\n✅ Step 2 Complete! Run step3_train_grud.py next.")