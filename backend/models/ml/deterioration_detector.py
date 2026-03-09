"""Deterioration Detection using Autoencoder + Anomaly Detection

Cutting-edge approach for early detection of patient deterioration:
1. Learn baseline patient patterns with autoencoder
2. Detect deviations using reconstruction error
3. Identify subtle changes before traditional scoring systems

Techniques:
- Variational Autoencoder (VAE) for robust representations
- Isolation Forest for anomaly detection
- Change point detection (PELT algorithm)
- CUSUM for cumulative deviation tracking
"""

import torch
import torch.nn as nn
import numpy as np
from typing import Tuple, List, Optional
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import ruptures as rpt


class VariationalAutoencoder(nn.Module):
    """VAE for learning patient baseline patterns"""
    
    def __init__(
        self,
        input_size: int,
        hidden_sizes: List[int] = [64, 32],
        latent_size: int = 16
    ):
        super(VariationalAutoencoder, self).__init__()
        self.input_size = input_size
        self.latent_size = latent_size
        
        # Encoder
        encoder_layers = []
        prev_size = input_size
        for hidden_size in hidden_sizes:
            encoder_layers.extend([
                nn.Linear(prev_size, hidden_size),
                nn.ReLU(),
                nn.BatchNorm1d(hidden_size),
                nn.Dropout(0.2)
            ])
            prev_size = hidden_size
        
        self.encoder = nn.Sequential(*encoder_layers)
        
        # Latent space
        self.fc_mu = nn.Linear(hidden_sizes[-1], latent_size)
        self.fc_logvar = nn.Linear(hidden_sizes[-1], latent_size)
        
        # Decoder
        decoder_layers = []
        prev_size = latent_size
        for hidden_size in reversed(hidden_sizes):
            decoder_layers.extend([
                nn.Linear(prev_size, hidden_size),
                nn.ReLU(),
                nn.BatchNorm1d(hidden_size),
                nn.Dropout(0.2)
            ])
            prev_size = hidden_size
        
        decoder_layers.append(nn.Linear(prev_size, input_size))
        self.decoder = nn.Sequential(*decoder_layers)
        
    def encode(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """Encode to latent space"""
        h = self.encoder(x)
        mu = self.fc_mu(h)
        logvar = self.fc_logvar(h)
        return mu, logvar
    
    def reparameterize(self, mu: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
        """Reparameterization trick"""
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std
    
    def decode(self, z: torch.Tensor) -> torch.Tensor:
        """Decode from latent space"""
        return self.decoder(z)
    
    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Forward pass
        
        Returns:
            Tuple of (reconstruction, mu, logvar)
        """
        mu, logvar = self.encode(x)
        z = self.reparameterize(mu, logvar)
        reconstruction = self.decode(z)
        return reconstruction, mu, logvar
    
    def compute_reconstruction_error(self, x: torch.Tensor) -> torch.Tensor:
        """Compute reconstruction error for anomaly detection"""
        with torch.no_grad():
            reconstruction, _, _ = self.forward(x)
            error = torch.mean((x - reconstruction) ** 2, dim=1)
        return error


def vae_loss(recon_x, x, mu, logvar, beta: float = 1.0):
    """VAE loss function
    
    Args:
        recon_x: Reconstructed input
        x: Original input
        mu: Mean of latent distribution
        logvar: Log variance of latent distribution
        beta: Weight for KL divergence (beta-VAE)
    """
    # Reconstruction loss
    recon_loss = nn.functional.mse_loss(recon_x, x, reduction='sum')
    
    # KL divergence loss
    kld = -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp())
    
    return recon_loss + beta * kld


class DeteriorationDetector:
    """Comprehensive deterioration detection system
    
    Combines multiple techniques:
    1. VAE reconstruction error
    2. Isolation Forest anomaly detection
    3. Change point detection
    4. CUSUM monitoring
    """
    
    def __init__(
        self,
        input_size: int,
        contamination: float = 0.1,  # Expected proportion of outliers
        cusum_threshold: float = 5.0
    ):
        self.input_size = input_size
        self.contamination = contamination
        self.cusum_threshold = cusum_threshold
        
        # Initialize models
        self.vae = VariationalAutoencoder(input_size)
        self.isolation_forest = IsolationForest(
            contamination=contamination,
            random_state=42,
            n_estimators=100
        )
        self.scaler = StandardScaler()
        
        # CUSUM state
        self.cusum_pos = 0.0
        self.cusum_neg = 0.0
        self.baseline_mean = None
        self.baseline_std = None
        
        # History for change point detection
        self.history = []
        
    def fit_baseline(self, baseline_data: np.ndarray):
        """Learn baseline patient patterns
        
        Args:
            baseline_data: Normal/stable patient data [n_samples, input_size]
        """
        # Scale data
        self.scaler.fit(baseline_data)
        scaled_data = self.scaler.transform(baseline_data)
        
        # Train VAE
        self.vae.train()
        optimizer = torch.optim.Adam(self.vae.parameters(), lr=0.001)
        
        tensor_data = torch.FloatTensor(scaled_data)
        dataset = torch.utils.data.TensorDataset(tensor_data)
        loader = torch.utils.data.DataLoader(dataset, batch_size=32, shuffle=True)
        
        # Training loop
        for epoch in range(50):
            total_loss = 0
            for batch in loader:
                x = batch[0]
                optimizer.zero_grad()
                recon_x, mu, logvar = self.vae(x)
                loss = vae_loss(recon_x, x, mu, logvar)
                loss.backward()
                optimizer.step()
                total_loss += loss.item()
        
        # Train Isolation Forest
        self.isolation_forest.fit(scaled_data)
        
        # Set baseline statistics for CUSUM
        self.baseline_mean = np.mean(baseline_data, axis=0)
        self.baseline_std = np.std(baseline_data, axis=0)
        
    def detect_anomaly(self, data_point: np.ndarray) -> dict:
        """Detect if data point is anomalous
        
        Args:
            data_point: Single observation [input_size]
            
        Returns:
            Dictionary with anomaly scores and flags
        """
        # Scale data
        scaled_point = self.scaler.transform(data_point.reshape(1, -1))
        
        # VAE reconstruction error
        tensor_point = torch.FloatTensor(scaled_point)
        self.vae.eval()
        recon_error = self.vae.compute_reconstruction_error(tensor_point).item()
        
        # Isolation Forest prediction
        iso_score = self.isolation_forest.score_samples(scaled_point)[0]
        is_anomaly_iso = self.isolation_forest.predict(scaled_point)[0] == -1
        
        # CUSUM calculation
        if self.baseline_mean is not None:
            deviation = (data_point - self.baseline_mean) / (self.baseline_std + 1e-8)
            deviation_score = np.mean(np.abs(deviation))
            
            self.cusum_pos = max(0, self.cusum_pos + deviation_score - 0.5)
            self.cusum_neg = max(0, self.cusum_neg - deviation_score - 0.5)
            
            cusum_alert = (self.cusum_pos > self.cusum_threshold or 
                          self.cusum_neg > self.cusum_threshold)
        else:
            cusum_alert = False
            deviation_score = 0
        
        # Combined decision
        is_deteriorating = (
            recon_error > 0.5 or  # High reconstruction error
            is_anomaly_iso or      # Isolation Forest flag
            cusum_alert            # CUSUM threshold exceeded
        )
        
        # Add to history
        self.history.append(data_point)
        
        return {
            'is_deteriorating': is_deteriorating,
            'reconstruction_error': recon_error,
            'isolation_score': iso_score,
            'is_anomaly_isolation': is_anomaly_iso,
            'cusum_positive': self.cusum_pos,
            'cusum_negative': self.cusum_neg,
            'cusum_alert': cusum_alert,
            'deviation_score': deviation_score,
            'severity': 'HIGH' if recon_error > 1.0 else 'MODERATE' if recon_error > 0.5 else 'LOW'
        }
    
    def detect_change_points(self, min_size: int = 5, jump: int = 1) -> List[int]:
        """Detect change points in patient trajectory using PELT algorithm
        
        Args:
            min_size: Minimum segment size
            jump: Subsample factor (1 = no subsampling)
            
        Returns:
            List of change point indices
        """
        if len(self.history) < min_size * 2:
            return []
        
        # Convert history to array
        signal = np.array(self.history)
        
        # Apply PELT algorithm
        algo = rpt.Pelt(model="rbf", min_size=min_size, jump=jump)
        algo.fit(signal)
        
        try:
            change_points = algo.predict(pen=10)
            # Remove last point (always equals length)
            return change_points[:-1] if change_points else []
        except:
            return []
    
    def reset_cusum(self):
        """Reset CUSUM counters"""
        self.cusum_pos = 0.0
        self.cusum_neg = 0.0
    
    def get_trend_analysis(self, window_size: int = 20) -> dict:
        """Analyze recent trend in patient trajectory
        
        Args:
            window_size: Number of recent observations to analyze
            
        Returns:
            Dictionary with trend information
        """
        if len(self.history) < 2:
            return {'trend': 'INSUFFICIENT_DATA', 'slope': 0, 'confidence': 0}
        
        recent_data = np.array(self.history[-window_size:])
        
        # Compute overall trend (mean across features)
        mean_values = np.mean(recent_data, axis=1)
        
        # Linear regression for trend
        x = np.arange(len(mean_values))
        coeffs = np.polyfit(x, mean_values, 1)
        slope = coeffs[0]
        
        # Classify trend
        if abs(slope) < 0.01:
            trend = 'STABLE'
        elif slope > 0:
            trend = 'IMPROVING' if slope > 0.05 else 'SLIGHTLY_IMPROVING'
        else:
            trend = 'DETERIORATING' if slope < -0.05 else 'SLIGHTLY_DETERIORATING'
        
        # Confidence based on consistency
        residuals = mean_values - np.polyval(coeffs, x)
        confidence = 1.0 - (np.std(residuals) / (np.std(mean_values) + 1e-8))
        confidence = max(0, min(1, confidence))
        
        return {
            'trend': trend,
            'slope': float(slope),
            'confidence': float(confidence),
            'recent_values': mean_values.tolist()
        }
