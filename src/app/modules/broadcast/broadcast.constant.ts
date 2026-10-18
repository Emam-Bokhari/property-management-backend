export enum BROADCAST_AUDIENCE {
  ALL_LANDLORDS = "all_landlords",
  SELECTED_LANDLORDS = "selected_landlords",
  EVERYONE = "everyone",
}

export enum BROADCAST_CHANNEL {
  PUSH_NOTIFICATION = "push_notification",
}

export enum BROADCAST_STATUS {
  PENDING = "pending",
  SENT = "sent",
  FAILED = "failed",
}

export const BROADCAST_SEARCHABLE_FIELDS = ["title", "message"];
