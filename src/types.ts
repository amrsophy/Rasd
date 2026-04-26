export interface Player {
  id: string;
  name: string;
  birthDate: string;
  estimatedAge: number;
  confidence: number;
  matchStatus: "match" | "suspicious" | "mismatch";
  photoUrl: string;
  certificateUrl: string;
  verifiedAt: any; // Allow string or Timestamp
  reasoning?: string;
  governorate?: string;
  sport?: string;
  club?: string;
}

export interface VerificationRequest {
  id: string;
  playerName: string;
  birthDate: string;
  estimatedAge: number;
  confidence: number;
  matchStatus: "match" | "suspicious" | "mismatch";
  reasoning: string;
  photoUrl: string;
  certificateUrl: string;
  status: "pending" | "completed" | "failed";
  createdAt: string;
  governorate?: string;
  sport?: string;
  club?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  performedBy: string;
  performedByName: string;
  timestamp: any;
  targetId?: string;
  targetName?: string;
}
