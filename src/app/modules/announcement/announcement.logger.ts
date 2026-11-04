import { Types } from "mongoose";
import colors from "colors";
import { Property } from "../property/property.model";
import { Flat } from "../flat/flat.model";
import { User } from "../user/user.model";
import { DeviceToken } from "../fcmToken/fcmToken.model";
import { VISIBILITY_SCOPE } from "./announcement.constant";

export interface IAnnouncementDispatchLogParams {
  announcementId: Types.ObjectId | string;
  title: string;
  propertyId: Types.ObjectId | string;
  visibilityScope: VISIBILITY_SCOPE;
  selectedFlatIds?: (Types.ObjectId | string)[];
  landlordId: Types.ObjectId | string;
  recipientIds: (Types.ObjectId | string)[];
}

const stripAnsi = (str: string): string =>
  str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );

const truncate = (str: string, maxLen: number): string => {
  if (!str) return "-";
  return str.length > maxLen ? str.slice(0, Math.max(0, maxLen - 1)) + "…" : str;
};

const BOX_WIDTH = 84;
const INNER_WIDTH = BOX_WIDTH - 4; // 2 for borders, 2 for inner spacing

const makeRow = (content: string): string => {
  const visibleLen = stripAnsi(content).length;
  const pad = Math.max(0, INNER_WIDTH - visibleLen);
  return `${colors.gray("│")} ${content}${" ".repeat(pad)} ${colors.gray("│")}`;
};

const topBorder = `${colors.gray("┌")}${colors.gray("─".repeat(BOX_WIDTH - 2))}${colors.gray("┐")}`;
const divider = `${colors.gray("├")}${colors.gray("─".repeat(BOX_WIDTH - 2))}${colors.gray("┤")}`;
const bottomBorder = `${colors.gray("└")}${colors.gray("─".repeat(BOX_WIDTH - 2))}${colors.gray("┘")}`;

const formatRecipientRow = (
  idx: string,
  name: string,
  flat: string,
  contact: string,
  pushStatus: string,
  isHeader = false,
  hasFCM = false,
): string => {
  const c1 = truncate(idx, 3).padEnd(3);
  const c2 = truncate(name, 20).padEnd(20);
  const c3 = truncate(flat, 18).padEnd(18);
  const c4 = truncate(contact, 20).padEnd(20);
  const c5 = truncate(pushStatus, 14).padEnd(14);

  if (isHeader) {
    return `${colors.dim(c1)} ${colors.dim(c2)} ${colors.dim(c3)} ${colors.dim(c4)} ${colors.dim(c5)}`;
  }

  const pushFormatted = hasFCM ? colors.green.bold(c5) : colors.yellow(c5);
  return `${colors.gray(c1)} ${colors.white(c2)} ${colors.cyan(c3)} ${colors.gray(c4)} ${pushFormatted}`;
};

export const logAnnouncementDispatch = async (
  params: IAnnouncementDispatchLogParams,
): Promise<void> => {
  try {
    const {
      title,
      propertyId,
      visibilityScope,
      selectedFlatIds,
      landlordId,
      recipientIds,
    } = params;

    // 1. Fetch property and landlord info
    const [propertyDoc, landlordDoc] = await Promise.all([
      Property.findById(propertyId).select("propertyName streetAddress postCode").lean(),
      User.findById(landlordId).select("name email phone companyName").lean(),
    ]);

    const propertyName = propertyDoc?.propertyName || "Unknown Property";
    const addressParts = [
      propertyDoc?.streetAddress,
      propertyDoc?.postCode,
    ].filter(Boolean);
    const propertyAddress = addressParts.length > 0 ? addressParts.join(", ") : "";

    const landlordName = landlordDoc?.name || "Landlord";
    const landlordContact = landlordDoc?.email || landlordDoc?.phone || "";

    // 2. Fetch flats
    let targetFlats: { _id: any; unitName: string; floor: number; tenant?: any; tenants?: any[] }[] = [];
    if (
      visibilityScope === VISIBILITY_SCOPE.SELECTED_FLATS &&
      selectedFlatIds &&
      selectedFlatIds.length > 0
    ) {
      targetFlats = await Flat.find({
        _id: { $in: selectedFlatIds },
        property: propertyId,
        isDeleted: false,
      })
        .select("unitName floor tenant tenants")
        .lean();
    } else {
      targetFlats = await Flat.find({
        property: propertyId,
        isDeleted: false,
      })
        .select("unitName floor tenant tenants")
        .lean();
    }

    // 3. Fetch recipient users
    const recipients = recipientIds.length > 0
      ? await User.find({ _id: { $in: recipientIds } })
          .select("name email phone flat")
          .populate("flat", "unitName floor")
          .lean()
      : [];

    // 4. Fetch device tokens to check push notification readiness
    const deviceTokens = recipientIds.length > 0
      ? await DeviceToken.find({
          userId: { $in: recipientIds },
          fcmToken: { $exists: true, $ne: "" },
        })
          .select("userId deviceType")
          .lean()
      : [];

    const deviceMap = new Map<string, string[]>();
    for (const token of deviceTokens) {
      const uId = token.userId.toString();
      const existing = deviceMap.get(uId) || [];
      existing.push(token.deviceType || "device");
      deviceMap.set(uId, existing);
    }

    // Output box
    console.log("");
    console.log(topBorder);
    console.log(makeRow(colors.cyan.bold("ANNOUNCEMENT DISPATCH & NOTIFICATION REPORT")));
    console.log(divider);

    // Metadata lines
    console.log(
      makeRow(
        `${colors.gray("Title     :")} ${colors.white.bold(truncate(title, 55))}`,
      ),
    );
    console.log(
      makeRow(
        `${colors.gray("Property  :")} ${colors.green.bold(propertyName)} ${propertyAddress ? colors.gray(`(${truncate(propertyAddress, 38)})`) : ""}`,
      ),
    );

    const scopeLabel =
      visibilityScope === VISIBILITY_SCOPE.SELECTED_FLATS
        ? "Selected Flats"
        : "Entire Property";
    console.log(
      makeRow(
        `${colors.gray("Scope     :")} ${colors.yellow(scopeLabel)} ${colors.gray(`• ${targetFlats.length} Flat(s) targeted`)}`,
      ),
    );

    console.log(
      makeRow(
        `${colors.gray("Sender    :")} ${colors.white(landlordName)} ${landlordContact ? colors.gray(`<${landlordContact}>`) : ""}`,
      ),
    );

    // Target flats summary
    console.log(divider);
    console.log(
      makeRow(
        `${colors.cyan.bold(`TARGET FLATS (${targetFlats.length})`)}`,
      ),
    );

    if (targetFlats.length === 0) {
      console.log(
        makeRow(`  ${colors.yellow("No flats found for this property / selection.")}`),
      );
    } else {
      // Print flats in compact rows of up to 3 flats
      const flatBadges = targetFlats.map(
        (f) =>
          `${colors.white(`• ${f.unitName}`)} ${colors.gray(`(Fl ${f.floor})`)}`,
      );

      const maxDisplay = 12;
      const displayFlats = flatBadges.slice(0, maxDisplay);

      for (let i = 0; i < displayFlats.length; i += 3) {
        const chunk = displayFlats.slice(i, i + 3).join("   ");
        console.log(makeRow(`  ${chunk}`));
      }

      if (targetFlats.length > maxDisplay) {
        console.log(
          makeRow(
            `  ${colors.dim(`... and ${targetFlats.length - maxDisplay} more flat(s)`)}`,
          ),
        );
      }
    }

    // Recipients & Push Notification details
    console.log(divider);
    const activeFCMCount = recipients.filter((r) =>
      deviceMap.has(r._id.toString()),
    ).length;

    console.log(
      makeRow(
        `${colors.cyan.bold(`RECIPIENTS & PUSH STATUS`)} ${colors.gray(`(${recipients.length} Tenant${recipients.length === 1 ? "" : "s"}, ${activeFCMCount} FCM Active)`)}`,
      ),
    );

    if (recipients.length === 0) {
      console.log(
        makeRow(
          `  ${colors.yellow.bold("⚠️ No active tenants found for this property / flats. (0 notifications sent)")}`,
        ),
      );
    } else {
      console.log(
        makeRow(
          formatRecipientRow(
            "#",
            "Tenant Name",
            "Flat / Unit",
            "Contact",
            "Push Status",
            true,
          ),
        ),
      );
      console.log(
        makeRow(
          `${colors.gray("─".repeat(3))} ${colors.gray("─".repeat(20))} ${colors.gray("─".repeat(18))} ${colors.gray("─".repeat(20))} ${colors.gray("─".repeat(14))}`,
        ),
      );

      const maxRecipients = 20;
      const displayRecipients = recipients.slice(0, maxRecipients);

      displayRecipients.forEach((recipient, idx) => {
        const uIdStr = recipient._id.toString();
        const devices = deviceMap.get(uIdStr);
        const hasFCM = Boolean(devices && devices.length > 0);

        let pushLabel = "In-App Only";
        if (hasFCM) {
          pushLabel = `FCM (${devices![0]})`;
        }

        // Resolve flat name
        let flatDisplay = "-";
        if (recipient.flat && typeof recipient.flat === "object") {
          const rf = recipient.flat as any;
          flatDisplay = `${rf.unitName || "Unit"} (Fl ${rf.floor ?? 0})`;
        } else {
          // Look up in targetFlats
          const matchedFlat = targetFlats.find(
            (tf) =>
              tf.tenant?.toString() === uIdStr ||
              (Array.isArray(tf.tenants) &&
                tf.tenants.some((t: any) => t.toString() === uIdStr)),
          );
          if (matchedFlat) {
            flatDisplay = `${matchedFlat.unitName} (Fl ${matchedFlat.floor})`;
          }
        }

        const contact = recipient.email || recipient.phone || "-";

        console.log(
          makeRow(
            formatRecipientRow(
              String(idx + 1),
              recipient.name || "Tenant",
              flatDisplay,
              contact,
              pushLabel,
              false,
              hasFCM,
            ),
          ),
        );
      });

      if (recipients.length > maxRecipients) {
        console.log(
          makeRow(
            `  ${colors.dim(`... and ${recipients.length - maxRecipients} more recipient(s)`)}`,
          ),
        );
      }
    }

    // Delivery Summary Footer
    console.log(divider);
    if (recipients.length > 0) {
      console.log(
        makeRow(
          `${colors.gray("Delivery  :")} ${colors.green.bold("✓ Push dispatched via Firebase Batch FCM & Realtime Socket.io")}`,
        ),
      );
    } else {
      console.log(
        makeRow(
          `${colors.gray("Delivery  :")} ${colors.yellow("No push notifications sent (0 target tenants)")}`,
        ),
      );
    }
    console.log(bottomBorder);
    console.log("");
  } catch (err) {
    // Failsafe so logging never crashes the request
    console.error("Announcement dispatch console logger error:", err);
  }
};
