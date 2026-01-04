
export interface SensorData {
  time: string;
  x: number;
  y: number;
  z: number;
  magnitude: number;
  hr: number;
  spo2: number;
}

export interface IncidentRecord {
  id: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high';
  peakMagnitude: number;
  hrAtIncident: number;
  spo2AtIncident: number;
  location?: { lat: number; lng: number };
  analysis?: string;
  status: 'acknowledged' | 'ignored' | 'alerted';
}

export enum DetectionMode {
  SIMULATED = 'SIMULATED',
  LIVE = 'LIVE'
}
