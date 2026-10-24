export interface IAdminMetricCard {
  key: "total_landlords" | "monthly_revenue" | "active_subscriptions" | string;
  title: string;
  value: number;
  formattedValue: string;
  currencySymbol?: string;
  icon: string;
}

export interface IAdminRecentLandlord {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  status: string;
  createdAt: Date | string;
}

export interface IAdminOverviewStats {
  totalTenants: number;
  totalContractors: number;
  totalProperties: number;
  totalFlats: number;
  trialingSubscriptions: number;
  canceledSubscriptions: number;
}

export interface IAdminDashboardStats {
  totalLandlords: number;
  monthlyRevenue: number;
  formattedMonthlyRevenue: string;
  activeSubscriptions: number;
  currencySymbol: string;
  currency: string;
  cards: IAdminMetricCard[];
  overview: IAdminOverviewStats;
  recentLandlords: IAdminRecentLandlord[];
  meta: {
    serverTime: string;
    periodMonth: string;
  };
}
