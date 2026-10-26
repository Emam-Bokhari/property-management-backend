import { INotification } from "../app/modules/notification/notification.interface";
import { Notification } from "../app/modules/notification/notification.model";
import { notificationHelper } from "../app/builder/pushNotification";
import { NOTIFICATION_TYPE } from "../app/modules/notification/notification.constant";

export const sendNotifications = async (
  data: Partial<INotification>,
): Promise<INotification | any> => {
  if (
    data.type === NOTIFICATION_TYPE.ADMIN ||
    data.type === NOTIFICATION_TYPE.SUPER_ADMIN
  ) {
    // For Admin and super admin, keep the existing Socket.io & DB logic
    const result = await (
      await Notification.create(data)
    ).populate("receiver sender referenceId");

    //@ts-ignore
    const socketIo = global.io;

    if (socketIo) {
      socketIo.emit(`send-notification::${data?.receiver}`, result);
    }

    return result;
  } else {
    // For user events (landlord, tenant, contractor, rent_reminder, maintenance_update, compliance_alert, job_update, etc.)
    if (!data.receiver) return;

    const payload = {
      title: data.title || "Notification",
      body: data.text || "",
      type: data.type || "",
      data: {
        type: data.type || "",
        referenceId: data.referenceId?.toString() || "",
        referenceModel: data.referenceModel || "",
        sender: data.sender?.toString() || "",
      },
    };

    return await notificationHelper.sendToUser(
      data.receiver.toString(),
      payload,
    );
  }
};
