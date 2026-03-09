"""Ranson Criteria for Acute Pancreatitis Severity

Range: 0-11 points
Mortality increases with score:
0-2: <1% mortality
3-4: 15% mortality  
5-6: 40% mortality
>6: Nearly 100% mortality
"""

from typing import Dict, Optional
from pydantic import BaseModel, Field


class Ranson_Input(BaseModel):
    """Input parameters for Ranson Criteria (On Admission + At 48 hours)"""
    # On Admission
    age: int = Field(..., ge=0, le=120, description="Age in years")
    wbc: float = Field(..., description="WBC count in thousands")
    glucose: float = Field(..., description="Blood glucose in mg/dL")
    ldh: float = Field(..., description="LDH in U/L")
    ast: float = Field(..., description="AST in U/L")
    
    # At 48 hours
    hematocrit_drop: float = Field(..., description="Hematocrit drop in %")
    bun_rise: float = Field(..., description="BUN rise in mg/dL")
    calcium: float = Field(..., description="Serum calcium in mg/dL")
    pao2: float = Field(..., description="PaO2 in mmHg")
    base_deficit: float = Field(..., description="Base deficit in mEq/L")
    fluid_sequestration: float = Field(..., description="Estimated fluid sequestration in L")


class Ranson_Score(BaseModel):
    """Ranson Score Output"""
    total_score: int
    mortality_risk: float
    severity: str
    criteria_met: Dict[str, bool]
    recommendation: str


def calculate_ranson(input_data: Ranson_Input) -> Ranson_Score:
    """Calculate Ranson Criteria
    
    Args:
        input_data: Patient parameters
        
    Returns:
        Ranson_Score with severity assessment
    """
    criteria_met = {}
    score = 0
    
    # On Admission Criteria
    if input_data.age > 55:
        criteria_met['age_over_55'] = True
        score += 1
    else:
        criteria_met['age_over_55'] = False
    
    if input_data.wbc > 16:
        criteria_met['wbc_high'] = True
        score += 1
    else:
        criteria_met['wbc_high'] = False
    
    if input_data.glucose > 200:
        criteria_met['glucose_high'] = True
        score += 1
    else:
        criteria_met['glucose_high'] = False
    
    if input_data.ldh > 350:
        criteria_met['ldh_high'] = True
        score += 1
    else:
        criteria_met['ldh_high'] = False
    
    if input_data.ast > 250:
        criteria_met['ast_high'] = True
        score += 1
    else:
        criteria_met['ast_high'] = False
    
    # At 48 Hours Criteria
    if input_data.hematocrit_drop > 10:
        criteria_met['hematocrit_drop'] = True
        score += 1
    else:
        criteria_met['hematocrit_drop'] = False
    
    if input_data.bun_rise > 5:
        criteria_met['bun_rise'] = True
        score += 1
    else:
        criteria_met['bun_rise'] = False
    
    if input_data.calcium < 8:
        criteria_met['hypocalcemia'] = True
        score += 1
    else:
        criteria_met['hypocalcemia'] = False
    
    if input_data.pao2 < 60:
        criteria_met['hypoxemia'] = True
        score += 1
    else:
        criteria_met['hypoxemia'] = False
    
    if input_data.base_deficit > 4:
        criteria_met['base_deficit'] = True
        score += 1
    else:
        criteria_met['base_deficit'] = False
    
    if input_data.fluid_sequestration > 6:
        criteria_met['fluid_sequestration'] = True
        score += 1
    else:
        criteria_met['fluid_sequestration'] = False
    
    # Determine mortality risk and severity
    if score <= 2:
        mortality_risk = 1.0
        severity = "Mild Pancreatitis"
        recommendation = "Conservative management, monitor closely"
    elif score <= 4:
        mortality_risk = 15.0
        severity = "Moderate Pancreatitis"
        recommendation = "ICU monitoring, aggressive fluid resuscitation"
    elif score <= 6:
        mortality_risk = 40.0
        severity = "Severe Pancreatitis"
        recommendation = "ICU admission, consider transfer to specialized center"
    else:
        mortality_risk = 100.0
        severity = "Critical Pancreatitis"
        recommendation = "URGENT ICU care, multidisciplinary management, high mortality risk"
    
    return Ranson_Score(
        total_score=score,
        mortality_risk=mortality_risk,
        severity=severity,
        criteria_met=criteria_met,
        recommendation=recommendation
    )
