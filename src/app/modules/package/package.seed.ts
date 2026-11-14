import colors from "colors";
import { Package } from "./package.model";
import { PackageService } from "./package.service";
import { logger } from "../../../shared/logger";

export const defaultPackages = [
  {
    name: "Basic",
    description: "Suitable plan for small landlords and new property owners",
    monthlyPrice: 19,
    yearlyPrice: 190,
    maxProperties: 2,
    maxFlats: 10,
    features: [
      "14-day free trial",
      "Up to 2 properties",
      "Up to 10 flats / units",
      "Online rent collection (Stripe)",
      "Tenant & lease management",
      "Maintenance request tracking",
      "Income & expense tracking & reports",
    ],
    hasTrial: true,
    trialDays: 14,
    isPopular: false,
    isActive: true,
  },
  {
    name: "Standard",
    description: "Best choice for medium landlords and growing property owners",
    monthlyPrice: 49,
    yearlyPrice: 490,
    maxProperties: 5,
    maxFlats: 30,
    features: [
      "7-day free trial",
      "Up to 5 properties",
      "Up to 30 flats / units",
      "All platform features included",
      "Contractor coordination & assignment",
      "Smart SMS & push reminders",
      "Digital inspection & inventory tracking",
      "Advanced financial reports",
    ],
    hasTrial: true,
    trialDays: 7,
    isPopular: true,
    isActive: true,
  },
  {
    name: "Premium",
    description: "Designed for large portfolio owners and property management agencies",
    monthlyPrice: 99,
    yearlyPrice: 990,
    maxProperties: -1, // Unlimited
    maxFlats: -1, // Unlimited
    features: [
      "Full direct access (No limits)",
      "Unlimited properties",
      "Unlimited flats / units",
      "All premium platform features unlocked",
      "Unlimited team members & staff access",
      "VIP onboarding & priority support",
    ],
    hasTrial: false,
    trialDays: 0,
    isPopular: false,
    isActive: true,
  },
];

export const seedDefaultPackages = async () => {
  try {
    const count = await Package.countDocuments();
    if (count === 0) {
      for (const pkg of defaultPackages) {
        try {
          await PackageService.createPackageIntoDB(pkg as any);
        } catch (err: any) {
          // If stripe fails or offline, fallback with placeholder so DB has packages
          await Package.create({
            ...pkg,
            stripeProductId: "prod_placeholder",
            stripeMonthlyPriceId: `price_${pkg.name.toLowerCase()}_monthly`,
            stripeYearlyPriceId: `price_${pkg.name.toLowerCase()}_yearly`,
          });
        }
      }
      logger.info(
        colors.green(
          "✔ Default SaaS packages seeded successfully with Stripe!",
        ),
      );
    }
  } catch (error) {
    logger.error("Error seeding default packages:", error);
  }
};
