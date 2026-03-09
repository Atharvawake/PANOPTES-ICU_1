import os, sys, numpy as np
import torch, torch.nn as nn
import shap

print("Loading data and model...")
DATA_DIR  = "data"
MODEL_DIR = "models"

X     = np.load(os.path.join(DATA_DIR, "X_timeseries.npy"))
mask  = np.load(os.path.join(DATA_DIR, "X_mask.npy"))
delta = np.load(os.path.join(DATA_DIR, "X_delta.npy"))
y     = np.load(os.path.join(DATA_DIR, "y_sepsis.npy"))

n_stays, n_hours, n_features = X.shape
print(f"  Data shape: {X.shape}")

with open(os.path.join(DATA_DIR, "feature_names.txt")) as f:
    feature_names = [l.strip() for l in f.readlines()]

device = torch.device("cpu")

# Same architecture as step3
class GRUDCell(nn.Module):
    def __init__(self, input_size, hidden_size, delta_size, use_mask=True):
        super().__init__()
        self.input_size=input_size; self.hidden_size=hidden_size; self.use_mask=use_mask
        self.weight_ih=nn.Linear(input_size, 3*hidden_size)
        self.weight_hh=nn.Linear(hidden_size, 3*hidden_size)
        self.decay_h=nn.Linear(delta_size, hidden_size)
        if use_mask:
            self.decay_x=nn.Linear(input_size, input_size)
    def forward(self, x, h, mask, delta):
        gamma_h=torch.exp(-torch.relu(self.decay_h(delta)))
        h=gamma_h*h
        if self.use_mask:
            gamma_x=torch.exp(-torch.relu(self.decay_x(x)))
            x_input=mask*x+(1-mask)*(gamma_x*x)
        else:
            x_input=x
        gi=self.weight_ih(x_input); gh=self.weight_hh(h)
        i_r,i_u,i_n=gi.chunk(3,1); h_r,h_u,h_n=gh.chunk(3,1)
        r=torch.sigmoid(i_r+h_r); u=torch.sigmoid(i_u+h_u)
        n=torch.tanh(i_n+r*h_n)
        hy=(1-u)*n+u*h
        return hy,hy

class GRUD(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers=2, dropout=0.3, output_size=1):
        super().__init__()
        self.hidden_size=hidden_size; self.num_layers=num_layers
        self.cells=nn.ModuleList([
            GRUDCell(
                input_size=input_size if i==0 else hidden_size,
                hidden_size=hidden_size,
                delta_size=input_size,
                use_mask=(i==0)
            ) for i in range(num_layers)
        ])
        self.dropout=nn.Dropout(dropout)
        self.fc=nn.Linear(hidden_size, output_size)
    def forward(self, x, mask, delta, h0=None):
        bs,sl,_=x.size()
        h=[torch.zeros(bs,self.hidden_size,device=x.device) for _ in range(self.num_layers)]
        for t in range(sl):
            xt=x[:,t,:]; mt=mask[:,t,:]; dt=delta[:,t,:]
            for i,cell in enumerate(self.cells):
                inp=xt if i==0 else h[i-1]
                h[i],_=cell(inp,h[i],mt,dt)
                if i>0: h[i]=self.dropout(h[i])
        return self.fc(h[-1]),torch.stack(h)

class GRUD_Sepsis_Predictor(nn.Module):
    def __init__(self, input_size=27, hidden_size=64, num_layers=2, dropout=0.3):
        super().__init__()
        self.grud=GRUD(input_size,hidden_size,num_layers,dropout,64)
        self.classifier=nn.Sequential(nn.Linear(64,32),nn.ReLU(),nn.Dropout(0.2),nn.Linear(32,1),nn.Sigmoid())
    def forward(self,x,mask,delta):
        rep,_=self.grud(x,mask,delta)
        return self.classifier(rep),rep

model = GRUD_Sepsis_Predictor(input_size=n_features, hidden_size=64, num_layers=2, dropout=0.0)
model.load_state_dict(torch.load(os.path.join(MODEL_DIR, "grud_sepsis_v1.pt"), map_location=device))
model.eval()
print("  Model loaded successfully")

def predict_fn(X_flat):
    probs = []
    with torch.no_grad():
        for i in range(0, len(X_flat), 16):
            batch = X_flat[i:i+16]
            n = len(batch)
            X_exp   = np.tile(batch[:, np.newaxis, :], (1, n_hours, 1))
            mask_ones  = np.ones_like(X_exp)
            delta_zeros = np.zeros_like(X_exp)
            Xt = torch.FloatTensor(X_exp)
            mt = torch.FloatTensor(mask_ones)
            dt = torch.FloatTensor(delta_zeros)
            prob, _ = model(Xt, mt, dt)
            probs.extend(prob.squeeze(-1).numpy())
    return np.array(probs)

# Background from normal patients
normal_idx = np.where(y == 0)[0]
np.random.seed(42)
bg_idx = np.random.choice(normal_idx, size=min(30, len(normal_idx)), replace=False)
bg_flat = X[bg_idx, -1, :]
print(f"  Background shape: {bg_flat.shape}")
np.save(os.path.join(MODEL_DIR, "shap_background.npy"), bg_flat)

with open(os.path.join(MODEL_DIR, "shap_feature_names.txt"), "w") as f:
    f.write("\n".join(feature_names))

print("\nInitializing SHAP explainer...")
explainer = shap.KernelExplainer(predict_fn, bg_flat)

sepsis_idx = np.where(y == 1)[0][:3]
test_flat  = X[sepsis_idx, -1, :]
print(f"Computing SHAP for {len(test_flat)} sepsis patients...")
shap_values = explainer.shap_values(test_flat, nsamples=50)
shap_values = np.array(shap_values)

print("\nTop Feature Importances:")
print("-" * 40)
mean_shap = np.abs(shap_values).mean(axis=0)
ranked = sorted(zip(feature_names, mean_shap), key=lambda x: x[1], reverse=True)
for fn, imp in ranked[:10]:
    bar = "█" * int(imp * 200)
    print(f"  {fn:20s} {imp:.4f}  {bar}")

print(f"\nSHAP background saved: {MODEL_DIR}/shap_background.npy")
print("Step 5 Complete! Now start the server.")
