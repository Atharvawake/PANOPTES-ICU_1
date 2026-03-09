"""Murray Score (Lung Injury Score)

Range: 0-4 points
Assesses acute lung injury severity
"""

from typing import Dict
from pydantic import BaseModel, Field


class Murray_Input(BaseModel):
    """Input parameters for Murray Score"""
    chest_xray_quadrants: int = Field(..., ge=0, le=4, description="Number of quadrants with infiltrates")
    pao2_fio2_ratio: float = Field(..., description="PaO2/FiO2 ratio")
    peep: int = Field(..., ge=0, description="PEEP in cmH2O")
    compliance: float = Field(..., ge=0, description="Respiratory compliance in mL/cmH2O")


class Murray_Score(BaseModel):
    """Murray Score Output"""
    total_score: float
    component_scores: Dict[str, int]
    severity: str
    recommendation: str


def calculate_murray(input_data: Murray_Input) -> Murray_Score:
    """Calculate Murray Lung Injury Score
    
    Args:
        input_data: Lung injury parameters
        
    Returns:
        Murray_Score with lung injury severity
    """
    component_scores = {}
    
    # Chest X-ray Score
    component_scores['chest_xray'] = input_data.chest_xray_quadrants
    
    # Hypoxemia Score (PaO2/FiO2)
    pf = input_data.pao2_fio2_ratio
    if pf >= 300:
        component_scores['hypoxemia'] = 0
    elif pf >= 225:
        component_scores['hypoxemia'] = 1
    elif pf >= 175:
        component_scores['hypoxemia'] = 2
    elif pf >= 100:
        component_scores['hypoxemia'] = 3
    else:
        component_scores['hypoxemia'] = 4
    
    # PEEP Score
    peep = input_data.peep
    if peep <= 5:
        component_scores['peep'] = 0
    elif peep <= 8:
        component_scores['peep'] = 1
    elif peep <= 11:
        component_scores['peep'] = 2
    elif peep <= 14:
        component_scores['peep'] = 3
    else:
        component_scores['peep'] = 4
    
    # Compliance Score
    compliance = input_data.compliance
    if compliance >= 80:
        component_scores['compliance'] = 0
    elif compliance >= 60:
        component_scores['compliance'] = 1
    elif compliance >= 40:
        component_scores['compliance'] = 2
    elif compliance >= 20:
        component_scores['compliance'] = 3
    else:
        component_scores['compliance'] = 4
    
    # Calculate average (Murray Score is average of 4 components)
    total_score = sum(component_scores.values()) / 4.0
    
    # Determine severity
    if total_score == 0:
        severity = "No Lung Injury"
        recommendation = "Continue monitoring"
    elif total_score <= 2.5:
        severity = "Mild to Moderate Lung Injury"
        recommendation = "Optimize ventilation, monitor closely"
    else:
        severity = "Severe Lung Injury (ARDS)"
        recommendation = "ARDS protocol, consider ECMO, lung protective ventilation"
    
    return Murray_Score(
        total_score=round(total_score, 2),
        component_scores=component_scores,
        severity=severity,
        recommendation=recommendation
    )
