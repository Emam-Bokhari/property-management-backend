import cron from "node-cron";
import colors from "colors";
import { logger } from "../../../shared/logger";
import { SmartReminderService } from "./smartReminder.service";

/**
 * Initializes the background cron job for Smart Reminders.
 * Runs every minute to check for due reminders and dispatches push notifications to landlords.
 */
export const initSmartReminderCron = () => {
  // Run every minute
  cron.schedule("* * * * *", async () => {
    try {
      await SmartReminderService.checkAndSendDueReminders();
    } catch (error) {
      logger.error(
        colors.red("❌ Error executing Smart Reminder Cron task:"),
        error,
      );
    }
  });

  logger.info(
    colors.green(
      "⏰ Smart Reminder Cron job initialized (running every minute)",
    ),
  );

  // Run immediate startup check
  SmartReminderService.checkAndSendDueReminders().catch((err) => {
    logger.error(
      colors.red("❌ Error executing initial Smart Reminder startup check:"),
      err,
    );
  });
};
