import colors from "colors";
import { User } from "../app/modules/user/user.model";
import config from "../config";
import { USER_ROLES } from "../enums/user";
import { logger } from "../shared/logger";
import { seedDefaultPackages } from "../app/modules/package/package.seed";

const superUser = {
  name: "Super Admin",
  role: USER_ROLES.SUPER_ADMIN,
  email: config.admin.email,
  password: config.admin.password,
  verified: true,
  phone: "+1234567890",
  countryCode: "+1",
};

const seedSuperAdmin = async () => {
  // 1. Seed Packages
  await seedDefaultPackages();

  // 2. Seed Super Admin
  const existingUser = await User.findOne({
    email: config.admin.email,
  });

  if (!existingUser) {
    await User.create(superUser);
    logger.info(colors.green("✔ Super admin created successfully!"));
    return;
  }

  if (existingUser.role !== USER_ROLES.SUPER_ADMIN) {
    existingUser.role = USER_ROLES.SUPER_ADMIN;
    existingUser.verified = true;
    if (!existingUser.phone) {
      existingUser.phone = "+1234567890";
    }
    if (!existingUser.countryCode) {
      existingUser.countryCode = "+1";
    }

    await existingUser.save();

    logger.info(colors.yellow("✔ Existing user promoted to Super Admin!"));
    return;
  }

  logger.info(colors.cyan("✔ Super Admin already exists."));
};

export default seedSuperAdmin;
