import os, sys, numpy as np, pandas as pd
import torch, torch.nn as nn
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score, average_precision_score, classification_report, confusion_matrix

print("Starting step 3...")

DATA_DIR  = "data"
MODEL_DIR = "models"
os.makedirs(MODEL_DIR, exist_ok=True)

EPOCHS=50; BATCH_SIZE=16; LR=1e-3; WEIGHT_DECAY=1e-4
PATIENCE=10; HIDDEN_SIZE=64; NUM_LAYERS=2; DROPOUT=0.3; SEED=42

torch.manual_seed(SEED); np.random.seed(SEED)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

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

class ICUDataset(Dataset):
    def __init__(self,X,mask,delta,y):
        self.X=torch.FloatTensor(X); self.mask=torch.FloatTensor(mask)
        self.delta=torch.FloatTensor(delta); self.y=torch.FloatTensor(y)
    def __len__(self): return len(self.y)
    def __getitem__(self,idx): return self.X[idx],self.mask[idx],self.delta[idx],self.y[idx]

print("Loading arrays...")
X=np.load(os.path.join(DATA_DIR,"X_timeseries.npy"))
mask=np.load(os.path.join(DATA_DIR,"X_mask.npy"))
delta=np.load(os.path.join(DATA_DIR,"X_delta.npy"))
y=np.load(os.path.join(DATA_DIR,"y_sepsis.npy"))
n_stays,n_hours,n_features=X.shape
print(f"Shape: {X.shape} | Sepsis: {y.sum():.0f}/{len(y)}")

idx_tr,idx_val=train_test_split(np.arange(len(y)),test_size=0.25,stratify=y,random_state=SEED)
print(f"Train: {len(idx_tr)} | Val: {len(idx_val)}")

pw=(y[idx_tr]==0).sum()/max((y[idx_tr]==1).sum(),1)
sw=np.where(y[idx_tr]==1,pw,1.0)
sampler=WeightedRandomSampler(sw,len(sw),replacement=True)
train_ds=ICUDataset(X[idx_tr],mask[idx_tr],delta[idx_tr],y[idx_tr])
val_ds=ICUDataset(X[idx_val],mask[idx_val],delta[idx_val],y[idx_val])
train_loader=DataLoader(train_ds,batch_size=BATCH_SIZE,sampler=sampler)
val_loader=DataLoader(val_ds,batch_size=BATCH_SIZE,shuffle=False)

model=GRUD_Sepsis_Predictor(n_features,HIDDEN_SIZE,NUM_LAYERS,DROPOUT).to(device)
print(f"Params: {sum(p.numel() for p in model.parameters()):,}")

pw_t=torch.tensor([pw]).to(device)
criterion=nn.BCEWithLogitsLoss(pos_weight=pw_t)
optimizer=torch.optim.Adam(model.parameters(),lr=LR,weight_decay=WEIGHT_DECAY)
scheduler=torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer,mode="max",factor=0.5,patience=5)

best_auc=0.0; pc=0; be=0; logs=[]
print(f"\nTraining {EPOCHS} epochs...")
print("-"*60)

for epoch in range(1,EPOCHS+1):
    model.train()
    tl,tp,tlab=[],[],[]
    for Xb,mb,db,yb in train_loader:
        Xb,mb,db,yb=Xb.to(device),mb.to(device),db.to(device),yb.to(device)
        optimizer.zero_grad()
        prob,_=model(Xb,mb,db); prob=prob.squeeze(-1)
        loss=criterion(torch.logit(prob.clamp(1e-6,1-1e-6)),yb)
        loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); optimizer.step()
        tl.append(loss.item()); tp.extend(prob.detach().cpu().numpy()); tlab.extend(yb.cpu().numpy())
    model.eval()
    vl,vp,vlab=[],[],[]
    with torch.no_grad():
        for Xb,mb,db,yb in val_loader:
            Xb,mb,db,yb=Xb.to(device),mb.to(device),db.to(device),yb.to(device)
            prob,_=model(Xb,mb,db); prob=prob.squeeze(-1)
            loss=criterion(torch.logit(prob.clamp(1e-6,1-1e-6)),yb)
            vl.append(loss.item()); vp.extend(prob.cpu().numpy()); vlab.extend(yb.cpu().numpy())
    tla=np.mean(tl); vla=np.mean(vl)
    try: ta=roc_auc_score(tlab,tp)
    except: ta=0.5
    try: va=roc_auc_score(vlab,vp)
    except: va=0.5
    try: vapr=average_precision_score(vlab,vp)
    except: vapr=0.0
    scheduler.step(va)
    mk=""
    if va>best_auc:
        best_auc=va; be=epoch; pc=0
        torch.save(model.state_dict(),os.path.join(MODEL_DIR,"grud_sepsis_v1.pt")); mk=" <- BEST"
    else: pc+=1
    print(f"Epoch {epoch:3d}/{EPOCHS} | Loss {tla:.4f}/{vla:.4f} | AUC {ta:.3f}/{va:.3f}{mk}")
    if pc>=PATIENCE: print("Early stopping"); break

print(f"\nBest epoch {be} | AUC {best_auc:.4f}")
print(f"Saved: {MODEL_DIR}/grud_sepsis_v1.pt")
print("Step 3 Complete! Run step4_train_vae.py next.")
