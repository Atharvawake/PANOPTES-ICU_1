"""
PANOPTES-ICU — Step 4: Train VAE Deterioration Detector
========================================================
Trains the Variational Autoencoder on stable (non-sepsis) ICU patients
to learn what 'normal' physiology looks like.

After training, tests reconstruction error on sepsis patients —
they should have higher error (= detected as anomalies).

Output:
    models/vae_detector_v1.pt    — trained VAE weights
    models/vae_threshold.npy     — anomaly threshold (95th percentile)
"""

import os
import sys
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.metrics import roc_auc_score
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from models.ml.deterioration_detector import VariationalAutoencoder, vae_loss

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
DATA_DIR   = "data"
MODEL_DIR  = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

EPOCHS      = 80
BATCH_SIZE  = 16
LR          = 1e-3
LATENT_SIZE = 8
HIDDEN      = [32, 16]
BETA        = 0.5          # beta-VAE weight for KL term
SEED        = 42

torch.manual_seed(SEED)
np.random.seed(SEED)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

# ─────────────────────────────────────────────
# LOAD DATA
# ─────────────────────────────────────────────
print("Loading data...")
X     = np.load(os.path.join(DATA_DIR, "X_timeseries.npy"))
y_sep = np.load(os.path.join(DATA_DIR, "y_sepsis.npy"))

n_stays, n_hours, n_features = X.shape
print(f"  Shape: {X.shape}")
print(f"  Sepsis: {int(y_sep.sum())} | Non-sepsis: {int((y_sep==0).sum())}")

# ─────────────────────────────────────────────
# PREPARE INPUT — use last snapshot of each stay
# (mean of all hourly readings = stable physiology summary)
# Also use hourly windows from non-sepsis patients
# ─────────────────────────────────────────────

# Flatten each hourly step as an independent sample for training
# Use only NON-SEPSIS stays for learning 'normal'
normal_idx  = np.where(y_sep == 0)[0]
sepsis_idx  = np.where(y_sep == 1)[0]

# Use all hourly snapshots from normal patients
X_normal_all = X[normal_idx]   # (n_normal, 24, F)
X_sepsis_all = X[sepsis_idx]   # (n_sepsis, 24, F)

# Flatten to (n_normal * 24, F) for VAE training
X_normal_flat = X_normal_all.reshape(-1, n_features)
X_sepsis_flat = X_sepsis_all.reshape(-1, n_features)

print(f"\nVAE training samples (normal hourly): {len(X_normal_flat)}")
print(f"Anomaly test samples  (sepsis hourly): {len(X_sepsis_flat)}")

# ─────────────────────────────────────────────
# TRAIN / VAL SPLIT
# ─────────────────────────────────────────────
from sklearn.model_selection import train_test_split
idx_tr, idx_val = train_test_split(
    np.arange(len(X_normal_flat)), test_size=0.2, random_state=SEED
)

X_tr  = torch.FloatTensor(X_normal_flat[idx_tr]).to(device)
X_val = torch.FloatTensor(X_normal_flat[idx_val]).to(device)

train_loader = DataLoader(
    TensorDataset(X_tr),
    batch_size=BATCH_SIZE, shuffle=True
)
val_loader = DataLoader(
    TensorDataset(X_val),
    batch_size=BATCH_SIZE, shuffle=False
)

# ─────────────────────────────────────────────
# MODEL
# ─────────────────────────────────────────────
vae = VariationalAutoencoder(
    input_size=n_features,
    hidden_sizes=HIDDEN,
    latent_size=LATENT_SIZE
).to(device)

total_params = sum(p.numel() for p in vae.parameters())
print(f"\nVAE Architecture:")
print(f"  Input:  {n_features} → {HIDDEN} → latent {LATENT_SIZE}")
print(f"  Params: {total_params:,}")

optimizer = torch.optim.Adam(vae.parameters(), lr=LR)
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=EPOCHS)

# ─────────────────────────────────────────────
# TRAINING LOOP
# ─────────────────────────────────────────────
print(f"\nTraining VAE for {EPOCHS} epochs...")
print("-" * 55)

best_val_loss = float("inf")
for epoch in range(1, EPOCHS + 1):
    # Train
    vae.train()
    train_losses = []
    for (batch,) in train_loader:
        optimizer.zero_grad()
        recon, mu, logvar = vae(batch)
        loss = vae_loss(recon, batch, mu, logvar, beta=BETA)
        loss.backward()
        optimizer.step()
        train_losses.append(loss.item())

    # Validate
    vae.eval()
    val_losses = []
    with torch.no_grad():
        for (batch,) in val_loader:
            recon, mu, logvar = vae(batch)
            loss = vae_loss(recon, batch, mu, logvar, beta=BETA)
            val_losses.append(loss.item())

    scheduler.step()

    tl = np.mean(train_losses)
    vl = np.mean(val_losses)

    marker = ""
    if vl < best_val_loss:
        best_val_loss = vl
        torch.save(vae.state_dict(), os.path.join(MODEL_DIR, "vae_detector_v1.pt"))
        marker = "  ← BEST"

    if epoch % 10 == 0 or epoch == 1:
        print(f"Epoch {epoch:3d}/{EPOCHS} | Train: {tl:.4f} | Val: {vl:.4f}{marker}")

# ─────────────────────────────────────────────
# COMPUTE ANOMALY THRESHOLD
# ─────────────────────────────────────────────
print("\nComputing anomaly detection threshold...")

vae.load_state_dict(torch.load(os.path.join(MODEL_DIR, "vae_detector_v1.pt")))
vae.eval()

def compute_errors(X_np):
    errors = []
    with torch.no_grad():
        for i in range(0, len(X_np), 64):
            batch = torch.FloatTensor(X_np[i:i+64]).to(device)
            err = vae.compute_reconstruction_error(batch)
            errors.extend(err.cpu().numpy())
    return np.array(errors)

# Threshold = 95th percentile of normal reconstruction error
normal_errors = compute_errors(X_normal_flat)
threshold = np.percentile(normal_errors, 95)
np.save(os.path.join(MODEL_DIR, "vae_threshold.npy"), threshold)
print(f"  Normal error: mean={normal_errors.mean():.4f}, std={normal_errors.std():.4f}")
print(f"  Threshold (95th pct): {threshold:.4f}")

# ─────────────────────────────────────────────
# TEST ON SEPSIS PATIENTS
# ─────────────────────────────────────────────
if len(X_sepsis_flat) > 0:
    sepsis_errors = compute_errors(X_sepsis_flat)
    print(f"\n  Sepsis error:  mean={sepsis_errors.mean():.4f}, std={sepsis_errors.std():.4f}")

    # AUC for anomaly detection
    all_errors = np.concatenate([normal_errors, sepsis_errors])
    all_labels = np.concatenate([
        np.zeros(len(normal_errors)),
        np.ones(len(sepsis_errors))
    ])
    try:
        auc = roc_auc_score(all_labels, all_errors)
        print(f"\n  VAE Anomaly Detection AUC: {auc:.4f}")
        print(f"  (Higher error = more likely sepsis/anomalous)")
    except Exception as e:
        print(f"  AUC calculation: {e}")

    # Flagged at threshold
    n_normal_flagged = (normal_errors > threshold).sum()
    n_sepsis_flagged = (sepsis_errors > threshold).sum()
    print(f"\n  At threshold {threshold:.4f}:")
    print(f"    Normal flagged:  {n_normal_flagged}/{len(normal_errors)} "
          f"({100*n_normal_flagged/len(normal_errors):.1f}%) ← False Positive Rate")
    print(f"    Sepsis flagged:  {n_sepsis_flagged}/{len(sepsis_errors)} "
          f"({100*n_sepsis_flagged/len(sepsis_errors):.1f}%) ← Sensitivity")

print(f"\n✅ VAE saved: {MODEL_DIR}/vae_detector_v1.pt")
print(f"✅ Threshold: {MODEL_DIR}/vae_threshold.npy")
print("   Run step5_init_shap.py next.")
