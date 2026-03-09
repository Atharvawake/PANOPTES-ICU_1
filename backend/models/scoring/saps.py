"""SAPS II (Simplified Acute Physiology Score II)

Range: 0-163 points
Used for ICU mortality prediction
"""

from typing import Dict, Optional
from pydantic import BaseModel, Field


class SAPS_Input(BaseModel):
    """Input parameters for SAPS II"""
    age: int = Field(..., ge=0, le=120)
    heart_rate: int = Field(..., description="Heart rate in bpm")
    systolic_bp: int = Field(..., description="Systolic BP in mmHg")
    temperature: float = Field(..., description="Temperature in Celsius")
    pao2_fio2_ratio: Optional[float] = Field(None, description="PaO2/FiO2 ratio")
    urine_output: float = Field(..., description="Urine output in L/day")
    bun: float = Field(..., description="BUN in mg/dL")
    wbc: float = Field(..., description="WBC in thousands")
    potassium: float = Field(..., description="Potassium in mEq/L")
    sodium: float = Field(..., description="Sodium in mEq/L")
    bicarbonate: float = Field(..., description="Bicarbonate in mEq/L")
    bilirubin: float = Field(..., description="Bilirubin in mg/dL")
    gcs: int = Field(..., ge=3, le=15)
    admission_type: str = Field(..., description="scheduled_surgical, medical, unscheduled_surgical")
    chronic_disease: bool = Field(False, description="AIDS, metastatic cancer, or hematologic malignancy")


class SAPS_Score(BaseModel):
    """SAPS II Score Output"""
    total_score: int
    mortality_risk: float
    component_scores: Dict[str, int]


def calculate_saps(input_data: SAPS_Input) -> SAPS_Score:
    """Calculate SAPS II Score
    
    Args:
        input_data: Patient parameters
        
    Returns:
        SAPS_Score with mortality risk
    """
    component_scores = {}
    
    # Age points
    age = input_data.age
    if age < 40:
        component_scores['age'] = 0
    elif age < 60:
        component_scores['age'] = 7
    elif age < 70:
        component_scores['age'] = 12
    elif age < 75:
        component_scores['age'] = 15
    elif age < 80:
        component_scores['age'] = 16
    else:
        component_scores['age'] = 18
    
    # Heart Rate
    hr = input_data.heart_rate
    if hr < 40:
        component_scores['heart_rate'] = 11
    elif hr < 70:
        component_scores['heart_rate'] = 2
    elif hr < 120:
        component_scores['heart_rate'] = 0
    elif hr < 160:
        component_scores['heart_rate'] = 4
    else:
        component_scores['heart_rate'] = 7
    
    # Systolic BP
    sbp = input_data.systolic_bp
    if sbp < 70:
        component_scores['systolic_bp'] = 13
    elif sbp < 100:
        component_scores['systolic_bp'] = 5
    elif sbp < 200:
        component_scores['systolic_bp'] = 0
    else:
        component_scores['systolic_bp'] = 2
    
    # Temperature
    temp = input_data.temperature
    if temp < 39:
        component_scores['temperature'] = 0
    else:
        component_scores['temperature'] = 3
    
    # PaO2/FiO2 ratio (if ventilated)
    if input_data.pao2_fio2_ratio:
        pf = input_data.pao2_fio2_ratio
        if pf < 100:
            component_scores['oxygenation'] = 11
        elif pf < 200:
            component_scores['oxygenation'] = 9
        else:
            component_scores['oxygenation'] = 6
    else:
        component_scores['oxygenation'] = 0
    
    # Urine output
    uo = input_data.urine_output
    if uo < 0.5:
        component_scores['urine_output'] = 11
    elif uo < 1.0:
        component_scores['urine_output'] = 4
    else:
        component_scores['urine_output'] = 0
    
    # BUN
    bun = input_data.bun
    if bun < 28:
        component_scores['bun'] = 0
    elif bun < 84:
        component_scores['bun'] = 6
    else:
        component_scores['bun'] = 10
    
    # WBC
    wbc = input_data.wbc
    if wbc < 1:
        component_scores['wbc'] = 12
    elif wbc < 20:
        component_scores['wbc'] = 0
    else:
        component_scores['wbc'] = 3
    
    # Potassium
    k = input_data.potassium
    if k < 3:
        component_scores['potassium'] = 3
    elif k < 5:
        component_scores['potassium'] = 0
    else:
        component_scores['potassium'] = 3
    
    # Sodium
    na = input_data.sodium
    if na < 125:
        component_scores['sodium'] = 5
    elif na < 145:
        component_scores['sodium'] = 0
    else:
        component_scores['sodium'] = 1
    
    # Bicarbonate
    hco3 = input_data.bicarbonate
    if hco3 < 15:
        component_scores['bicarbonate'] = 6
    elif hco3 < 20:
        component_scores['bicarbonate'] = 3
    else:
        component_scores['bicarbonate'] = 0
    
    # Bilirubin
    bili = input_data.bilirubin
    if bili < 4:
        component_scores['bilirubin'] = 0
    elif bili < 6:
        component_scores['bilirubin'] = 4
    else:
        component_scores['bilirubin'] = 9
    
    # GCS
    gcs = input_data.gcs
    if gcs < 6:
        component_scores['gcs'] = 26
    elif gcs < 9:
        component_scores['gcs'] = 13
    elif gcs < 11:
        component_scores['gcs'] = 7
    elif gcs < 14:
        component_scores['gcs'] = 5
    else:
        component_scores['gcs'] = 0
    
    # Admission type
    if input_data.admission_type == 'scheduled_surgical':
        component_scores['admission'] = 0
    elif input_data.admission_type == 'medical':
        component_scores['admission'] = 6
    else:  # unscheduled_surgical
        component_scores['admission'] = 8
    
    # Chronic disease
    if input_data.chronic_disease:
        component_scores['chronic_disease'] = 17
    else:
        component_scores['chronic_disease'] = 0
    
    total_score = sum(component_scores.values())
    
    # Calculate mortality risk using logistic regression
    logit = -7.7631 + 0.0737 * total_score + 0.9971 * (1 if total_score > 0 else 0)
    mortality_risk = 100 * (1 / (1 + 2.71828 ** (-logit)))
    
    return SAPS_Score(
        total_score=total_score,
        mortality_risk=round(mortality_risk, 2),
        component_scores=component_scores
    )
