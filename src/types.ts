export type AppRole = 'Citizen' | 'Doctor' | 'NGO' | 'Admin';

export interface LocationInfo {
  lat: number;
  lng: number;
  address?: string;
}

export interface EmergencyBroadcast {
  id: string;
  type: string;
  message?: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  timestamp: number;
  senderId?: string;
  location?: string | { lat: number, lng: number };
  acceptedBy?: string[];
}

export interface PatientRecord {
  id: string;
  symptoms: string;
  esiScore: number;
  reasoning: string;
  specialty?: string;
  firstAidGuidance?: string[];
  timestamp: number;
  location?: LocationInfo;
  status: 'Critical' | 'Dispatched' | 'En Route' | 'Resolved';
  reporterId?: string;
  assignedResponderId?: string;
  eta?: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  hasPendingWrites?: boolean;
  serverTimestamp?: number;
  lastUpdatedAt?: number;
}
