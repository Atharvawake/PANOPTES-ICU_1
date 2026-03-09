"""SOFA Scoring System Implementation

Sequential Organ Failure Assessment
Range: 0-24, assesses organ dysfunction/failure
"""

from typing import Dict, Optional
from pydantic import BaseModel, Field


class SOFA_Input(BaseModel):
    """Input parameters for SOFA calculation"""
    pao2: float = Field(..., description="PaO2 in mmHg")
    fio2: float = Field(..., description="FiO2 as decimal (0.21-1.0)")
    mechanical_ventilation: bool = Field(False)
    platelets: float = Field(..., description="Platelet count in thousands")
    bilirubin: float = Field(..., description="Total bilirubin in mg/dL")
    mean_arterial_pressure: float = Field(..., description="MAP in mmHg")
    dopamine_dose: Optional[float] = Field(0, description="mcg/kg/min")
    dobutamine_dose: Optional[float] = Field(0, description="mcg/kg/min")
    epinephrine_dose: Optional[float] = Field(0, description="mcg/kg/min")
    norepinephrine_dose: Optional[float] = Field(0, description="mcg/kg/min")
    gcs: int = Field(..., ge=3, le=15, description="Glasgow Coma Scale")
    creatinine: float = Field(..., description="Serum creatinine in mg/dL")
    urine_output: Optional[float] = Field(None, description="mL/day")


class SOFA_Score(BaseModel):
    """SOFA Score Output"""
    total_score: int
    respiration_score: int
    coagulation_score: int
    liver_score: int
    cardiovascular_score: int
    cns_score: int
    renal_score: int
    organ_dysfunction_count: int
    component_details: Dict[str, str]


def calculate_sofa(input_data: SOFA_Input) -> SOFA_Score:
    """Calculate SOFA Score
    
    Args:
        input_data: Patient clinical parameters
        
    Returns:
        SOFA_Score with component scores
    """
    component_details = {}
    
    # Respiration (PaO2/FiO2 ratio)
    pf_ratio = input_data.pao2 / input_data.fio2
    if pf_ratio >= 400:
        respiration_score = 0
        component_details['respiration'] = f"PF ratio {pf_ratio:.0f} - Normal"
    elif pf_ratio >= 300:
        respiration_score = 1
        component_details['respiration'] = f"PF ratio {pf_ratio:.0f} - Mild dysfunction"
    elif pf_ratio >= 200:
        respiration_score = 2
        component_details['respiration'] = f"PF ratio {pf_ratio:.0f} - Moderate dysfunction"
    elif pf_ratio >= 100:
        if input_data.mechanical_ventilation:
            respiration_score = 3
            component_details['respiration'] = f"PF ratio {pf_ratio:.0f} + Ventilation - Severe dysfunction"
        else:
            respiration_score = 2
            component_details['respiration'] = f"PF ratio {pf_ratio:.0f} - Moderate dysfunction"
    else:
        if input_data.mechanical_ventilation:
            respiration_score = 4
            component_details['respiration'] = f"PF ratio {pf_ratio:.0f} + Ventilation - Critical dysfunction"
        else:
            respiration_score = 3
            component_details['respiration'] = f"PF ratio {pf_ratio:.0f} - Severe dysfunction"
    
    # Coagulation (Platelets)
    platelets = input_data.platelets
    if platelets >= 150:
        coagulation_score = 0
        component_details['coagulation'] = f"Platelets {platelets:.0f}k - Normal"
    elif platelets >= 100:
        coagulation_score = 1
        component_details['coagulation'] = f"Platelets {platelets:.0f}k - Mild dysfunction"
    elif platelets >= 50:
        coagulation_score = 2
        component_details['coagulation'] = f"Platelets {platelets:.0f}k - Moderate dysfunction"
    elif platelets >= 20:
        coagulation_score = 3
        component_details['coagulation'] = f"Platelets {platelets:.0f}k - Severe dysfunction"
    else:
        coagulation_score = 4
        component_details['coagulation'] = f"Platelets {platelets:.0f}k - Critical dysfunction"
    
    # Liver (Bilirubin)
    bilirubin = input_data.bilirubin
    if bilirubin < 1.2:
        liver_score = 0
        component_details['liver'] = f"Bilirubin {bilirubin:.1f} - Normal"
    elif bilirubin < 2:
        liver_score = 1
        component_details['liver'] = f"Bilirubin {bilirubin:.1f} - Mild dysfunction"
    elif bilirubin < 6:
        liver_score = 2
        component_details['liver'] = f"Bilirubin {bilirubin:.1f} - Moderate dysfunction"
    elif bilirubin < 12:
        liver_score = 3
        component_details['liver'] = f"Bilirubin {bilirubin:.1f} - Severe dysfunction"
    else:
        liver_score = 4
        component_details['liver'] = f"Bilirubin {bilirubin:.1f} - Critical dysfunction"
    
    # Cardiovascular (MAP and vasopressor use)
    map_val = input_data.mean_arterial_pressure
    total_vasopressor = (
        input_data.dopamine_dose +
        input_data.dobutamine_dose +
        input_data.epinephrine_dose +
        input_data.norepinephrine_dose
    )
    
    if map_val >= 70 and total_vasopressor == 0:
        cardiovascular_score = 0
        component_details['cardiovascular'] = f"MAP {map_val:.0f}, No pressors - Normal"
    elif map_val < 70:
        cardiovascular_score = 1
        component_details['cardiovascular'] = f"MAP {map_val:.0f} - Hypotension"
    elif input_data.dopamine_dose <= 5 or input_data.dobutamine_dose > 0:
        cardiovascular_score = 2
        component_details['cardiovascular'] = "Low-dose vasopressors"
    elif input_data.dopamine_dose > 5 or (input_data.epinephrine_dose <= 0.1 or input_data.norepinephrine_dose <= 0.1):
        cardiovascular_score = 3
        component_details['cardiovascular'] = "Moderate-dose vasopressors"
    else:
        cardiovascular_score = 4
        component_details['cardiovascular'] = "High-dose vasopressors"
    
    # Central Nervous System (GCS)
    gcs = input_data.gcs
    if gcs == 15:
        cns_score = 0
        component_details['cns'] = f"GCS {gcs} - Normal"
    elif gcs >= 13:
        cns_score = 1
        component_details['cns'] = f"GCS {gcs} - Mild dysfunction"
    elif gcs >= 10:
        cns_score = 2
        component_details['cns'] = f"GCS {gcs} - Moderate dysfunction"
    elif gcs >= 6:
        cns_score = 3
        component_details['cns'] = f"GCS {gcs} - Severe dysfunction"
    else:
        cns_score = 4
        component_details['cns'] = f"GCS {gcs} - Critical dysfunction"
    
    # Renal (Creatinine and urine output)
    creatinine = input_data.creatinine
    urine_output = input_data.urine_output
    
    if creatinine < 1.2 and (urine_output is None or urine_output >= 500):
        renal_score = 0
        component_details['renal'] = f"Creatinine {creatinine:.1f} - Normal"
    elif creatinine < 2 and (urine_output is None or urine_output >= 500):
        renal_score = 1
        component_details['renal'] = f"Creatinine {creatinine:.1f} - Mild dysfunction"
    elif creatinine < 3.5 and (urine_output is None or urine_output >= 500):
        renal_score = 2
        component_details['renal'] = f"Creatinine {creatinine:.1f} - Moderate dysfunction"
    elif creatinine < 5 or (urine_output and urine_output < 500):
        renal_score = 3
        component_details['renal'] = f"Creatinine {creatinine:.1f} or oliguria - Severe dysfunction"
    else:
        renal_score = 4
        component_details['renal'] = f"Creatinine {creatinine:.1f} or anuria - Critical dysfunction"
    
    # Total Score
    total_score = (
        respiration_score + coagulation_score + liver_score +
        cardiovascular_score + cns_score + renal_score
    )
    
    # Count organs with dysfunction (score >= 2)
    organ_dysfunction_count = sum([
        respiration_score >= 2,
        coagulation_score >= 2,
        liver_score >= 2,
        cardiovascular_score >= 2,
        cns_score >= 2,
        renal_score >= 2
    ])
    
    return SOFA_Score(
        total_score=total_score,
        respiration_score=respiration_score,
        coagulation_score=coagulation_score,
        liver_score=liver_score,
        cardiovascular_score=cardiovascular_score,
        cns_score=cns_score,
        renal_score=renal_score,
        organ_dysfunction_count=organ_dysfunction_count,
        component_details=component_details
    )
