import torch
import torch.nn as nn
from typing import Tuple, Optional

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
    def _mock_sepsis_prediction(self, patient_id):
        import random
        prob=random.uniform(0.3,0.7)
        return {"patient_id":patient_id,"probability":prob,"risk_level":"HIGH" if prob>0.6 else "MODERATE" if prob>0.4 else "LOW","prediction_type":"sepsis","model":"mock"}
