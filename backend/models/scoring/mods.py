"""MODS (Multiple Organ Dysfunction Score)

Range: 0-24 points (6 organ systems, 0-4 each)
Scoring system for organ dysfunction in ICU
"""

from typing import Dict
from pydantic import BaseModel, Field


class MODS_Input(BaseModel):
    """Input parameters for MODS"""
    pao2_fio2_ratio: float = Field(..., description="PaO2/FiO2 ratio")
    creatinine: float = Field(..., description="Serum creatinine in µmol/L")
    bilirubin: float = Field(..., description="Serum bilirubin in µmol/L")
    platelets: float = Field(..., description="Platelet count in 10^9/L")
    mean_arterial_pressure: float = Field(..., description="MAP in mmHg")
    gcs: int = Field(..., ge=3, le=15, description="Glasgow Coma Scale")


class MODS_Score(BaseModel):
    """MODS Score Output"""
    total_score: int
    organ_scores: Dict[str, int]
    severity: str


def calculate_mods(input_data: MODS_Input) -> MODS_Score:
    """Calculate MODS Score
    
    Args:
        input_data: Patient parameters
        
    Returns:
        MODS_Score with organ-specific scores
    """
    organ_scores = {}
    
    # Respiratory (PaO2/FiO2)
    pf = input_data.pao2_fio2_ratio
    if pf > 300:
        organ_scores['respiratory'] = 0
    elif pf > 226:
        organ_scores['respiratory'] = 1
    elif pf > 151:
        organ_scores['respiratory'] = 2
    elif pf > 76:
        organ_scores['respiratory'] = 3
    else:
        organ_scores['respiratory'] = 4
    
    # Renal (Serum Creatinine)
    creat = input_data.creatinine
    if creat <= 100:
        organ_scores['renal'] = 0
    elif creat <= 170:
        organ_scores['renal'] = 1
    elif creat <= 310:
        organ_scores['renal'] = 2
    elif creat <= 500:
        organ_scores['renal'] = 3
    else:
        organ_scores['renal'] = 4
    
    # Hepatic (Serum Bilirubin)
    bili = input_data.bilirubin
    if bili <= 20:
        organ_scores['hepatic'] = 0
    elif bili <= 60:
        organ_scores['hepatic'] = 1
    elif bili <= 120:
        organ_scores['hepatic'] = 2
    elif bili <= 240:
        organ_scores['hepatic'] = 3
    else:
        organ_scores['hepatic'] = 4
    
    # Hematologic (Platelet count)
    plt = input_data.platelets
    if plt > 120:
        organ_scores['hematologic'] = 0
    elif plt > 80:
        organ_scores['hematologic'] = 1
    elif plt > 50:
        organ_scores['hematologic'] = 2
    elif plt > 20:
        organ_scores['hematologic'] = 3
    else:
        organ_scores['hematologic'] = 4
    
    # Cardiovascular (MAP * Heart Rate pressure-adjusted)
    map_val = input_data.mean_arterial_pressure
    if map_val > 70:
        organ_scores['cardiovascular'] = 0
    elif map_val > 60:
        organ_scores['cardiovascular'] = 1
    elif map_val > 50:
        organ_scores['cardiovascular'] = 2
    elif map_val > 40:
        organ_scores['cardiovascular'] = 3
    else:
        organ_scores['cardiovascular'] = 4
    
    # Neurologic (Glasgow Coma Scale)
    gcs = input_data.gcs
    if gcs == 15:
        organ_scores['neurologic'] = 0
    elif gcs >= 13:
        organ_scores['neurologic'] = 1
    elif gcs >= 10:
        organ_scores['neurologic'] = 2
    elif gcs >= 7:
        organ_scores['neurologic'] = 3
    else:
        organ_scores['neurologic'] = 4
    
    total_score = sum(organ_scores.values())
    
    # Determine severity
    if total_score < 5:
        severity = "Minimal Dysfunction"
    elif total_score < 9:
        severity = "Mild Dysfunction"
    elif total_score < 13:
        severity = "Moderate Dysfunction"
    elif total_score < 17:
        severity = "Severe Dysfunction"
    else:
        severity = "Very Severe Dysfunction"
    
    return MODS_Score(
        total_score=total_score,
        organ_scores=organ_scores,
        severity=severity
    )
