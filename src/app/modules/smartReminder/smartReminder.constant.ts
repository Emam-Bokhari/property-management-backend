export const REMINDER_STATUS = {
  PENDING: "pending",
  COMPLETED: "completed",
  OVERDUE: "overdue",
} as const;

export const smartReminderSearchableFields = ["title", "note"];
