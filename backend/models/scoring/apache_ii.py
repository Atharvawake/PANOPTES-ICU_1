"""APACHE II Scoring System Implementation

Acute Physiology and Chronic Health Evaluation II
Range: 0-71, higher scores indicate higher mortality risk
"""

from typing import Dict, Optional
from pydantic import BaseModel, Field


class APACHE_II_Input(BaseModel):
    """Input parameters for APACHE II calculation"""
    age: int = Field(..., ge=0, le=120)
    temperature: float = Field(..., description="Temperature in Celsius")
    mean_arterial_pressure: float = Field(..., description="MAP in mmHg")
    heart_rate: int = Field(..., ge=0, le=300)
    respiratory_rate: int = Field(..., ge=0, le=100)
    pao2: Optional[float] = Field(None, description="PaO2 in mmHg")
    fio2: Optional[float] = Field(None, description="FiO2 as decimal (0.21-1.0)")
    aado2: Optional[float] = Field(None, description="A-a DO2 gradient")
    arterial_ph: float = Field(..., ge=6.0, le=8.0)
    sodium: float = Field(..., description="Serum sodium in mEq/L")
    potassium: float = Field(..., description="Serum potassium in mEq/L")
    creatinine: float = Field(..., description="Serum creatinine in mg/dL")
    hematocrit: float = Field(..., description="Hematocrit as percentage")
    wbc: float = Field(..., description="WBC count in thousands")
    gcs: int = Field(..., ge=3, le=15, description="Glasgow Coma Scale")
    chronic_health: bool = Field(False, description="Chronic health condition")
    postoperative: bool = Field(False, description="Postoperative status")


class APACHE_II_Score(BaseModel):
    """APACHE II Score Output"""
    total_score: int
    age_points: int
    physiology_points: int
    chronic_health_points: int
    mortality_risk: float
    risk_category: str
    component_scores: Dict[str, int]


def calculate_apache_ii(input_data: APACHE_II_Input) -> APACHE_II_Score:
    """Calculate APACHE II Score
    
    Args:
        input_data: Patient clinical parameters
        
    Returns:
        APACHE_II_Score with total score and mortality risk
    """
    component_scores = {}
    physiology_score = 0
    
    # Temperature (Rectal)
    temp = input_data.temperature
    if temp >= 41:
        component_scores['temperature'] = 4
    elif temp >= 39:
        component_scores['temperature'] = 3
    elif temp >= 38.5 or temp < 30:
        component_scores['temperature'] = 1
    elif temp >= 36 and temp <= 38.4:
        component_scores['temperature'] = 0
    elif temp >= 34 and temp < 36:
        component_scores['temperature'] = 1
    elif temp >= 32 and temp < 34:
        component_scores['temperature'] = 2
    elif temp >= 30 and temp < 32:
        component_scores['temperature'] = 3
    else:
        component_scores['temperature'] = 4
    
    # Mean Arterial Pressure
    map_val = input_data.mean_arterial_pressure
    if map_val >= 160:
        component_scores['map'] = 4
    elif map_val >= 130:
        component_scores['map'] = 3
    elif map_val >= 110:
        component_scores['map'] = 2
    elif map_val >= 70 and map_val <= 109:
        component_scores['map'] = 0
    elif map_val >= 50:
        component_scores['map'] = 2
    else:
        component_scores['map'] = 4
    
    # Heart Rate
    hr = input_data.heart_rate
    if hr >= 180:
        component_scores['heart_rate'] = 4
    elif hr >= 140:
        component_scores['heart_rate'] = 3
    elif hr >= 110:
        component_scores['heart_rate'] = 2
    elif hr >= 70 and hr <= 109:
        component_scores['heart_rate'] = 0
    elif hr >= 55:
        component_scores['heart_rate'] = 2
    elif hr >= 40:
        component_scores['heart_rate'] = 3
    else:
        component_scores['heart_rate'] = 4
    
    # Respiratory Rate
    rr = input_data.respiratory_rate
    if rr >= 50:
        component_scores['respiratory_rate'] = 4
    elif rr >= 35:
        component_scores['respiratory_rate'] = 3
    elif rr >= 25:
        component_scores['respiratory_rate'] = 1
    elif rr >= 12 and rr <= 24:
        component_scores['respiratory_rate'] = 0
    elif rr >= 10:
        component_scores['respiratory_rate'] = 1
    elif rr >= 6:
        component_scores['respiratory_rate'] = 2
    else:
        component_scores['respiratory_rate'] = 4
    
    # Oxygenation (FiO2 >= 0.5 use A-a gradient, else use PaO2)
    if input_data.fio2 and input_data.fio2 >= 0.5:
        aado2 = input_data.aado2 or 0
        if aado2 >= 500:
            component_scores['oxygenation'] = 4
        elif aado2 >= 350:
            component_scores['oxygenation'] = 3
        elif aado2 >= 200:
            component_scores['oxygenation'] = 2
        elif aado2 < 200:
            component_scores['oxygenation'] = 0
    else:
        pao2 = input_data.pao2 or 80
        if pao2 >= 70:
            component_scores['oxygenation'] = 0
        elif pao2 >= 61:
            component_scores['oxygenation'] = 1
        elif pao2 >= 55:
            component_scores['oxygenation'] = 3
        else:
            component_scores['oxygenation'] = 4
    
    # Arterial pH
    ph = input_data.arterial_ph
    if ph >= 7.7:
        component_scores['ph'] = 4
    elif ph >= 7.6:
        component_scores['ph'] = 3
    elif ph >= 7.5:
        component_scores['ph'] = 1
    elif ph >= 7.33 and ph <= 7.49:
        component_scores['ph'] = 0
    elif ph >= 7.25:
        component_scores['ph'] = 2
    elif ph >= 7.15:
        component_scores['ph'] = 3
    else:
        component_scores['ph'] = 4
    
    # Serum Sodium
    na = input_data.sodium
    if na >= 180:
        component_scores['sodium'] = 4
    elif na >= 160:
        component_scores['sodium'] = 3
    elif na >= 155:
        component_scores['sodium'] = 2
    elif na >= 150:
        component_scores['sodium'] = 1
    elif na >= 130 and na <= 149:
        component_scores['sodium'] = 0
    elif na >= 120:
        component_scores['sodium'] = 2
    elif na >= 111:
        component_scores['sodium'] = 3
    else:
        component_scores['sodium'] = 4
    
    # Serum Potassium
    k = input_data.potassium
    if k >= 7:
        component_scores['potassium'] = 4
    elif k >= 6:
        component_scores['potassium'] = 3
    elif k >= 5.5:
        component_scores['potassium'] = 1
    elif k >= 3.5 and k <= 5.4:
        component_scores['potassium'] = 0
    elif k >= 3:
        component_scores['potassium'] = 1
    elif k >= 2.5:
        component_scores['potassium'] = 2
    else:
        component_scores['potassium'] = 4
    
    # Serum Creatinine (double points if acute renal failure)
    creat = input_data.creatinine
    if creat >= 3.5:
        component_scores['creatinine'] = 4
    elif creat >= 2:
        component_scores['creatinine'] = 3
    elif creat >= 1.5:
        component_scores['creatinine'] = 2
    elif creat >= 0.6 and creat <= 1.4:
        component_scores['creatinine'] = 0
    else:
        component_scores['creatinine'] = 2
    
    # Hematocrit
    hct = input_data.hematocrit
    if hct >= 60:
        component_scores['hematocrit'] = 4
    elif hct >= 50:
        component_scores['hematocrit'] = 2
    elif hct >= 46:
        component_scores['hematocrit'] = 1
    elif hct >= 30 and hct <= 45.9:
        component_scores['hematocrit'] = 0
    elif hct >= 20:
        component_scores['hematocrit'] = 2
    else:
        component_scores['hematocrit'] = 4
    
    # White Blood Cell Count
    wbc = input_data.wbc
    if wbc >= 40:
        component_scores['wbc'] = 4
    elif wbc >= 20:
        component_scores['wbc'] = 2
    elif wbc >= 15:
        component_scores['wbc'] = 1
    elif wbc >= 3 and wbc <= 14.9:
        component_scores['wbc'] = 0
    elif wbc >= 1:
        component_scores['wbc'] = 2
    else:
        component_scores['wbc'] = 4
    
    # Glasgow Coma Scale (15 minus actual GCS)
    gcs_score = 15 - input_data.gcs
    component_scores['gcs'] = gcs_score
    
    # Sum physiology points
    physiology_points = sum(component_scores.values())
    
    # Age Points
    age = input_data.age
    if age <= 44:
        age_points = 0
    elif age <= 54:
        age_points = 2
    elif age <= 64:
        age_points = 3
    elif age <= 74:
        age_points = 5
    else:
        age_points = 6
    
    # Chronic Health Points
    chronic_health_points = 0
    if input_data.chronic_health:
        chronic_health_points = 2 if not input_data.postoperative else 5
    
    # Total Score
    total_score = physiology_points + age_points + chronic_health_points
    
    # Mortality Risk Estimation (based on APACHE II literature)
    if total_score < 10:
        mortality_risk = 4.0
        risk_category = "Low Risk"
    elif total_score < 15:
        mortality_risk = 8.0
        risk_category = "Low-Moderate Risk"
    elif total_score < 20:
        mortality_risk = 15.0
        risk_category = "Moderate Risk"
    elif total_score < 25:
        mortality_risk = 25.0
        risk_category = "Moderate-High Risk"
    elif total_score < 30:
        mortality_risk = 40.0
        risk_category = "High Risk"
    elif total_score < 35:
        mortality_risk = 55.0
        risk_category = "Very High Risk"
    else:
        mortality_risk = 75.0
        risk_category = "Critical Risk"
    
    return APACHE_II_Score(
        total_score=total_score,
        age_points=age_points,
        physiology_points=physiology_points,
        chronic_health_points=chronic_health_points,
        mortality_risk=mortality_risk,
        risk_category=risk_category,
        component_scores=component_scores
    )
