import colors from "colors";
import { Package } from "./package.model";
import { PackageService } from "./package.service";
import { logger } from "../../../shared/logger";

export const defaultPackages = [
  {
    name: "Basic",
    description: "ছোট বাড়িওয়ালা ও নতুন ল্যান্ডলর্ডদের জন্য উপযুক্ত প্ল্যান",
    monthlyPrice: 19,
    yearlyPrice: 190,
    maxProperties: 2,
    maxFlats: 10,
    features: [
      "১৪ দিনের ফ্রি ট্রায়াল",
      "সর্বোচ্চ ২টি প্রপার্টি",
      "সর্বোচ্চ ১০টি ফ্ল্যাট / ইউনিট",
      "অনলাইন ভাড়া কালেকশন (Stripe)",
      "ভাড়াটিয়া ও লিজ ম্যানেজমেন্ট",
      "মেইনটেন্যান্স রিকোয়েস্ট ট্র্যাকিং",
      "আয়-ব্যয়ের হিসাব ও রিপোর্ট",
    ],
    hasTrial: true,
    trialDays: 14,
    isPopular: false,
    isActive: true,
  },
  {
    name: "Standard",
    description: "মাঝারি বাড়িওয়ালা ও গ্রোয়িং প্রপার্টি ওনারদের জন্য সেরা চয়েস",
    monthlyPrice: 49,
    yearlyPrice: 490,
    maxProperties: 5,
    maxFlats: 30,
    features: [
      "৭ দিনের ফ্রি ট্রায়াল",
      "সর্বোচ্চ ৫টি প্রপার্টি",
      "সর্বোচ্চ ৩০টি ফ্ল্যাট / ইউনিট",
      "প্ল্যাটফর্মের সকল ফিচার অন্তর্ভুক্ত",
      "কন্ট্রাক্টর কোঅর্ডিনেশন ও অ্যাসাইন",
      "স্মার্ট এসএমএস ও পুশ রিমাইন্ডার",
      "ডিজিটাল ইন্সপেকশন ও ইনভেন্টরি ট্র্যাকিং",
      "অ্যাডভান্সড ফাইন্যান্সিয়াল রিপোর্ট",
    ],
    hasTrial: true,
    trialDays: 7,
    isPopular: true,
    isActive: true,
  },
  {
    name: "Premium",
    description: "বড় পোর্টফোলিও ওনার ও প্রপার্টি ম্যানেজমেন্ট এজেন্সির জন্য",
    monthlyPrice: 99,
    yearlyPrice: 990,
    maxProperties: -1, // Unlimited
    maxFlats: -1, // Unlimited
    features: [
      "সরাসরি ফুল অ্যাক্সেস (কোনো লিমিট নেই)",
      "আনলিমিটেড প্রপার্টি",
      "আনলিমিটেড ফ্ল্যাট / ইউনিট",
      "প্ল্যাটফর্মের সকল প্রিমিয়াম ফিচার আনলকড",
      "আনলিমিটেড টিম মেম্বার ও স্টাফ অ্যাক্সেস",
      "ভিআইপি অনবোর্ডিং ও প্রায়োরিটি সাপোর্ট",
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
