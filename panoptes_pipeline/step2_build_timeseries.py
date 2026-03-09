import os, pickle, csv
import numpy as np
import pandas as pd
from datetime import datetime
from collections import defaultdict

DATA_DIR  = "data"
MIMIC_DIR = "mimic_data"
N_HOURS   = 24
MIN_HOURS = 1

FEATURE_NAMES = [
    "heart_rate","sbp","dbp","map","resp_rate","spo2",
    "temperature","gcs_total","gcs_eye","gcs_verbal","gcs_motor",
    "fio2","glucose_chart","sodium","potassium","creatinine",
    "bun","glucose_lab","bicarbonate","wbc","hemoglobin",
    "hematocrit","platelet","bilirubin","lactate","ph","pao2",
]
N_FEATURES = len(FEATURE_NAMES)
feat_idx = {f:i for i,f in enumerate(FEATURE_NAMES)}

NORMAL_VALUES = {
    "heart_rate":75.0,"sbp":120.0,"dbp":70.0,"map":85.0,
    "resp_rate":16.0,"spo2":98.0,"temperature":37.0,
    "gcs_total":15.0,"gcs_eye":4.0,"gcs_verbal":5.0,"gcs_motor":6.0,
    "fio2":0.21,"glucose_chart":100.0,"sodium":140.0,"potassium":4.0,
    "creatinine":1.0,"bun":15.0,"glucose_lab":100.0,"bicarbonate":24.0,
    "wbc":8.0,"hemoglobin":13.0,"hematocrit":40.0,"platelet":200.0,
    "bilirubin":0.8,"lactate":1.0,"ph":7.4,"pao2":95.0,
}

VALID_RANGES = {
    "heart_rate":(0,300),"sbp":(40,300),"dbp":(10,200),
    "map":(20,220),"resp_rate":(0,80),"spo2":(50,100),
    "temperature":(25,45),"gcs_total":(3,15),"gcs_eye":(1,4),
    "gcs_verbal":(1,5),"gcs_motor":(1,6),"fio2":(0.1,1.0),
    "glucose_chart":(10,2000),"sodium":(100,180),"potassium":(1.5,10),
    "creatinine":(0.1,30),"bun":(1,200),"glucose_lab":(10,2000),
    "bicarbonate":(5,50),"wbc":(0,200),"hemoglobin":(1,25),
    "hematocrit":(5,70),"platelet":(1,2000),"bilirubin":(0,50),
    "lactate":(0.1,30),"ph":(6.5,8.0),"pao2":(20,700),
}

def parse_dt(s):
    if not s: return None
    for fmt in ("%Y-%m-%d %H:%M:%S","%Y-%m-%d"):
        try: return datetime.strptime(s.strip(),fmt)
        except: continue
    return None

def is_valid(feat,val):
    lo,hi=VALID_RANGES.get(feat,(-1e9,1e9))
    return lo<=val<=hi

def build_hourly_series(events,intime,n_hours):
    hourly=[[] for _ in range(n_hours)]
    for dt,val in events:
        if dt<intime: continue
        hour=int((dt-intime).total_seconds()/3600)
        if 0<=hour<n_hours: hourly[hour].append(val)
    return np.array([np.mean(v) if v else np.nan for v in hourly])

def compute_time_delta(series):
    delta=np.zeros(len(series))
    last_obs=-1
    for t in range(len(series)):
        if not np.isnan(series[t]):
            last_obs=t; delta[t]=0.0
        else:
            delta[t]=(t-last_obs) if last_obs>=0 else t+1
    return delta

def forward_fill(series,feat_name):
    filled=series.copy()
    last_val=NORMAL_VALUES.get(feat_name,0.0)
    for t in range(len(filled)):
        if np.isnan(filled[t]): filled[t]=last_val
        else: last_val=filled[t]
    return filled

print("Loading raw data...")
with open(os.path.join(DATA_DIR,"raw_vitals.pkl"),"rb") as f:
    raw_vitals=pickle.load(f)
with open(os.path.join(DATA_DIR,"raw_labs.pkl"),"rb") as f:
    raw_labs=pickle.load(f)

labels_df=pd.read_csv(os.path.join(DATA_DIR,"patient_labels.csv"))
labels_df["icustay_id"]=labels_df["icustay_id"].astype(str)
labels_df=labels_df.set_index("icustay_id")

icustay_info={}
with open(os.path.join(MIMIC_DIR,"ICUSTAYS.csv")) as f:
    for row in csv.DictReader(f):
        icustay_info[str(row["icustay_id"])]={
            "intime":parse_dt(row["intime"]),
            "outtime":parse_dt(row["outtime"]),
            "los":float(row["los"]) if row["los"] else 0,
        }

all_ids=set(str(k) for k in raw_vitals.keys())|set(str(k) for k in raw_labs.keys())
print(f"Vitals/labs IDs: {len(all_ids)}, ICU info IDs: {len(icustay_info)}, Label IDs: {len(labels_df)}")
print(f"Overlap vitals-icu: {len(all_ids & set(icustay_info.keys()))}")
print(f"Overlap vitals-labels: {len(all_ids & set(labels_df.index))}")

X_list=[];mask_list=[];delta_list=[]
y_sep=[];y_mort=[];id_list=[]
skipped=0;skip_reasons=defaultdict(int)

for icustay_id in sorted(all_ids):
    sid=str(icustay_id)
    stay=icustay_info.get(sid)
    if stay is None: skip_reasons["no_icu_info"]+=1;skipped+=1;continue
    intime=stay["intime"]; los=stay["los"]
    if intime is None: skip_reasons["no_intime"]+=1;skipped+=1;continue
    if los<(MIN_HOURS/24.0): skip_reasons["too_short"]+=1;skipped+=1;continue
    if sid not in labels_df.index: skip_reasons["no_label"]+=1;skipped+=1;continue

    row2=labels_df.loc[sid]
    sepsis=int(row2["sepsis"]); mort=int(row2["mortality"])

    X_s=np.zeros((N_HOURS,N_FEATURES))
    mask_s=np.zeros((N_HOURS,N_FEATURES))
    delta_s=np.zeros((N_HOURS,N_FEATURES))

    vitals=raw_vitals.get(sid,raw_vitals.get(icustay_id,{}))
    labs=raw_labs.get(sid,raw_labs.get(icustay_id,{}))
    all_feats={**vitals,**labs}

    for feat_name in FEATURE_NAMES:
        fi=feat_idx[feat_name]
        events=[(dt,v) for dt,v in all_feats.get(feat_name,[]) if is_valid(feat_name,v)]
        raw_s=build_hourly_series(events,intime,N_HOURS)
        mask_s[:,fi]=(~np.isnan(raw_s)).astype(float)
        delta_s[:,fi]=compute_time_delta(raw_s)
        X_s[:,fi]=forward_fill(raw_s,feat_name)

    X_list.append(X_s);mask_list.append(mask_s);delta_list.append(delta_s)
    y_sep.append(sepsis);y_mort.append(mort);id_list.append(int(sid))

print(f"Processed: {len(X_list)} | Skipped: {skipped} | Reasons: {dict(skip_reasons)}")

if len(X_list)==0:
    print("STILL ZERO - printing sample keys for diagnosis:")
    print("  raw_vitals keys:", list(raw_vitals.keys())[:5])
    print("  icustay_info keys:", list(icustay_info.keys())[:5])
    print("  labels index:", list(labels_df.index)[:5])
    exit(1)

X_all=np.array(X_list)
feat_mean=np.nanmean(X_all.reshape(-1,N_FEATURES),axis=0)
feat_std=np.nanstd(X_all.reshape(-1,N_FEATURES),axis=0)
feat_std[feat_std==0]=1.0
X_norm=(X_all-feat_mean)/feat_std

np.save(os.path.join(DATA_DIR,"X_timeseries.npy"),X_norm)
np.save(os.path.join(DATA_DIR,"X_mask.npy"),np.array(mask_list))
np.save(os.path.join(DATA_DIR,"X_delta.npy"),np.array(delta_list))
np.save(os.path.join(DATA_DIR,"y_sepsis.npy"),np.array(y_sep))
np.save(os.path.join(DATA_DIR,"y_mortality.npy"),np.array(y_mort))
np.save(os.path.join(DATA_DIR,"icustay_ids.npy"),np.array(id_list))
np.save(os.path.join(DATA_DIR,"feat_mean.npy"),feat_mean)
np.save(os.path.join(DATA_DIR,"feat_std.npy"),feat_std)

with open(os.path.join(DATA_DIR,"feature_names.txt"),"w") as f:
    f.write("\n".join(FEATURE_NAMES))

print(f"Shape: {X_norm.shape}")
print(f"Sepsis: {sum(y_sep)}/{len(y_sep)}")
print(f"Mortality: {sum(y_mort)}/{len(y_mort)}")
print("Step 2 Complete!")
