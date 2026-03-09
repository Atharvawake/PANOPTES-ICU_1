"""Alvarado Score for Acute Appendicitis

Range: 0-10 points
<5: Appendicitis unlikely
5-6: Possible appendicitis
7-8: Probable appendicitis
>8: Very likely appendicitis
"""

from typing import Dict
from pydantic import BaseModel, Field


class Alvarado_Input(BaseModel):
    """Input parameters for Alvarado Score"""
    # Symptoms (1 point each)
    migration_pain: bool = Field(False, description="Migration of pain to RLQ")
    anorexia: bool = Field(False, description="Anorexia")
    nausea_vomiting: bool = Field(False, description="Nausea/Vomiting")
    
    # Signs (2 points each)
    tenderness_rlq: bool = Field(False, description="Tenderness in RLQ")
    rebound_tenderness: bool = Field(False, description="Rebound tenderness")
    elevated_temperature: bool = Field(False, description="Temperature >37.3°C (99.1°F)")
    
    # Lab findings
    leukocytosis: bool = Field(False, description="WBC >10,000")
    left_shift: bool = Field(False, description="Left shift (>75% neutrophils)")


class Alvarado_Score(BaseModel):
    """Alvarado Score Output"""
    total_score: int
    criteria_met: Dict[str, bool]
    probability: str
    recommendation: str


def calculate_alvarado(input_data: Alvarado_Input) -> Alvarado_Score:
    """Calculate Alvarado Score
    
    Args:
        input_data: Clinical parameters
        
    Returns:
        Alvarado_Score with appendicitis probability
    """
    score = 0
    criteria_met = {}
    
    # Symptoms (1 point each)
    if input_data.migration_pain:
        score += 1
        criteria_met['migration_pain'] = True
    else:
        criteria_met['migration_pain'] = False
    
    if input_data.anorexia:
        score += 1
        criteria_met['anorexia'] = True
    else:
        criteria_met['anorexia'] = False
    
    if input_data.nausea_vomiting:
        score += 1
        criteria_met['nausea_vomiting'] = True
    else:
        criteria_met['nausea_vomiting'] = False
    
    # Signs (2 points each)
    if input_data.tenderness_rlq:
        score += 2
        criteria_met['tenderness_rlq'] = True
    else:
        criteria_met['tenderness_rlq'] = False
    
    if input_data.rebound_tenderness:
        score += 1
        criteria_met['rebound_tenderness'] = True
    else:
        criteria_met['rebound_tenderness'] = False
    
    if input_data.elevated_temperature:
        score += 1
        criteria_met['elevated_temperature'] = True
    else:
        criteria_met['elevated_temperature'] = False
    
    # Lab findings (1 point each for leukocytosis, 2 points for left shift)
    if input_data.leukocytosis:
        score += 2
        criteria_met['leukocytosis'] = True
    else:
        criteria_met['leukocytosis'] = False
    
    if input_data.left_shift:
        score += 1
        criteria_met['left_shift'] = True
    else:
        criteria_met['left_shift'] = False
    
    # Determine probability and recommendation
    if score < 5:
        probability = "Unlikely"
        recommendation = "Discharge with follow-up if symptoms persist"
    elif score <= 6:
        probability = "Possible"
        recommendation = "Observation, serial exams, consider imaging"
    elif score <= 8:
        probability = "Probable"
        recommendation = "Surgical consultation, likely operative management"
    else:
        probability = "Very Likely"
        recommendation = "URGENT surgical consultation, appendectomy indicated"
    
    return Alvarado_Score(
        total_score=score,
        criteria_met=criteria_met,
        probability=probability,
        recommendation=recommendation
    )
