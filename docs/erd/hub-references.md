# Hub Entity References

This document lists all entities and fields that reference hub entities across the property-management-backend codebase.

## Hub: `User` (7 referencing entities, 12 reference fields)

| Module | Referencing Entity | Field Path | Kind |
| :--- | :--- | :--- | :--- |
| `chat` | `Chat` | `deletedBy` | array of refs |
| `chat` | `Chat` | `participants` | array of refs |
| `chat` | `Chat` | `readBy` | array of refs |
| `fcmToken` | `DeviceToken` | `userId` | single ref |
| `message` | `Message` | `pinnedBy` | single ref |
| `message` | `Message` | `sender` | single ref |
| `notification` | `Notification` | `receiver` | single ref |
| `notification` | `Notification` | `referenceId` | single ref |
| `notification` | `Notification` | `sender` | single ref |
| `notificationPreference` | `NotificationPreference` | `userId` | one-to-one (unique) |
| `resetToken` | `Token` | `user` | single ref |
| `support` | `Support` | `userId` | single ref |

