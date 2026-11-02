import express from "express";
import { UserRoutes } from "../modules/user/user.routes";
import { AuthRoutes } from "../modules/auth/auth.routes";
import { RuleRoutes } from "../modules/rule/rule.route";
import { FaqRoutes } from "../modules/faq/faq.route";
import { ChatRoutes } from "../modules/chat/chat.routes";
import { MessageRoutes } from "../modules/message/message.routes";
import { SupportRoutes } from "../modules/support/support.route";
import { BannerRoutes } from "../modules/banner/banner.route";
import { NotificationRoutes } from "../modules/notification/notification.routes";
import { FcmTokenRoutes } from "../modules/fcmToken/fcmToken.route";
import { NotificationPreferenceRoutes } from "../modules/notificationPreference/notificationPreference.route";
import { PropertyRoutes } from "../modules/property/property.routes";
import { FlatRoutes } from "../modules/flat/flat.routes";
import { AnnouncementRoutes } from "../modules/announcement/announcement.routes";
import { AppOptionRoutes } from "../modules/appOption/appOption.routes";
import { InventoryRoutes } from "../modules/inventory/inventory.routes";
import { InspectionRoutes } from "../modules/inspection/inspection.routes";
import { TenantRoutes } from "../modules/tenant/tenant.routes";
import { SmartReminderRoutes } from "../modules/smartReminder/smartReminder.routes";
import { ContractorRoutes } from "../modules/contractor/contractor.routes";
import { BroadcastRoutes } from "../modules/broadcast/broadcast.routes";
import { MaintenanceRoutes } from "../modules/maintenance/maintenance.routes";
import { WebhookRoutes } from "../modules/webhook/webhook.routes";
import { FinanceRoutes } from "../modules/finance/finance.routes";
import { PackageRoutes } from "../modules/package/package.routes";
import { SubscriptionRoutes } from "../modules/subscription/subscription.routes";
import { LandlordRoutes } from "../modules/landlord/landlord.routes";
import { AdminRoutes } from "../modules/admin/admin.routes";
import { ReviewRoutes } from "../modules/review/review.routes";

const router = express.Router();

const apiRoutes = [
  {
    path: "/users",
    route: UserRoutes,
  },
  {
    path: "/auth",
    route: AuthRoutes,
  },
  {
    path: "/rules",
    route: RuleRoutes,
  },
  {
    path: "/faqs",
    route: FaqRoutes,
  },
  {
    path: "/chats",
    route: ChatRoutes,
  },
  {
    path: "/messages",
    route: MessageRoutes,
  },
  {
    path: "/supports",
    route: SupportRoutes,
  },
  {
    path: "/banners",
    route: BannerRoutes,
  },
  {
    path: "/notifications",
    route: NotificationRoutes,
  },
  {
    path: "/fcmTokens",
    route: FcmTokenRoutes,
  },
  {
    path: "/notification-preferences",
    route: NotificationPreferenceRoutes,
  },
  {
    path: "/properties",
    route: PropertyRoutes,
  },
  {
    path: "/flats",
    route: FlatRoutes,
  },
  {
    path: "/announcements",
    route: AnnouncementRoutes,
  },

  {
    path: "/app-options",
    route: AppOptionRoutes,
  },
  {
    path: "/inventory",
    route: InventoryRoutes,
  },
  {
    path: "/inspections",
    route: InspectionRoutes,
  },
  {
    path: "/tenants",
    route: TenantRoutes,
  },
  {
    path: "/contractors",
    route: ContractorRoutes,
  },
  {
    path: "/smart-reminders",
    route: SmartReminderRoutes,
  },
  {
    path: "/broadcasts",
    route: BroadcastRoutes,
  },
  {
    path: "/maintenance",
    route: MaintenanceRoutes,
  },
  {
    path: "/webhook",
    route: WebhookRoutes,
  },
  {
    path: "/finance",
    route: FinanceRoutes,
  },
  {
    path: "/packages",
    route: PackageRoutes,
  },
  {
    path: "/subscriptions",
    route: SubscriptionRoutes,
  },
  {
    path: "/landlords",
    route: LandlordRoutes,
  },
  {
    path: "/admin",
    route: AdminRoutes,
  },
  {
    path: "/reviews",
    route: ReviewRoutes,
  },
];

apiRoutes.forEach((route) => router.use(route.path, route.route));
export default router;