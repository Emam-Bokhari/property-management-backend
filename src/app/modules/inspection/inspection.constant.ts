export enum INSPECTION_STATUS {
  COMPLETED = "completed",
  PENDING = "pending",
  DRAFT = "draft",
}

export enum ROOM_INSPECTION_STATUS {
  PASS = "pass",
  FAIR = "fair",
  DEFECT = "defect",
}

export const inspectionSearchableFields = ["areaName", "notes"];
